import type Stream from 'node:stream'
import type { ResolvedDownloadOptions } from './options'
import fs from 'node:fs'
import path from 'node:path'
import { effect, signal } from 'alien-signals'
import progress from 'progress-stream'
import * as tar from 'tar'
import * as unzipper from 'unzipper'
import { DownloadError } from './errors/download'
import { type DownloadOptions, resolveDownloadOptions, resolveRequestOptions } from './options'

export interface DownloadStream extends Stream {
  on(event: 'complete', listener: () => void): this
  on(event: 'error', listener: (error: Error) => void): this
}

/**
 * 统一的进度管理器，将下载和解压进度合并
 */
class UnifiedProgressManager {
  private downloadWeight = 0.7 // 下载占总进度的 70%
  private extractWeight = 0.3 // 解压占总进度的 30%

  private downloadCompleted = false
  private lastDownloadProgress: any = null

  private totalSize: number
  private onProgressCallback?: (progress: any) => void

  constructor(totalSize: number, onProgress?: (progress: any) => void) {
    this.totalSize = totalSize
    this.onProgressCallback = onProgress
  }

  updateDownloadProgress(progressData: any): void {
    // 将下载进度映射到 0-70% 范围
    const scaledPercentage = (progressData.percentage || 0) * this.downloadWeight

    const scaledProgress = {
      ...progressData,
      percentage: scaledPercentage,
    }

    this.lastDownloadProgress = scaledProgress
    this.emitProgress(scaledProgress)
  }

  markDownloadComplete(): void {
    this.downloadCompleted = true
  }

  updateExtractProgress(current: number, total: number): void {
    if (!this.downloadCompleted) {
      this.downloadCompleted = true
    }

    // 解压进度从 70% 开始，增加到 100%
    const extractPercentage = total > 0 ? (current / total) * 100 : 0
    const totalPercentage = this.downloadWeight * 100 + (extractPercentage * this.extractWeight)

    // 基于最后的下载进度数据创建解压进度数据
    const baseProgress = this.lastDownloadProgress || {
      transferred: this.totalSize * this.downloadWeight,
      length: this.totalSize,
      remaining: this.totalSize * this.extractWeight,
      eta: 0,
      runtime: 0,
      delta: 0,
      speed: 0,
      network: 0,
      unit: 'KB' as const,
    }

    const extractProgress = {
      ...baseProgress,
      percentage: Math.min(totalPercentage, 100),
      transferred: Math.floor((totalPercentage / 100) * this.totalSize),
      remaining: Math.max(0, this.totalSize - Math.floor((totalPercentage / 100) * this.totalSize)),
      eta: 0, // 解压阶段 ETA 较难预估
      speed: 0, // 解压阶段没有网络速度
      network: 0,
    }

    this.emitProgress(extractProgress)
  }

  private emitProgress(progressData: any): void {
    this.onProgressCallback?.(progressData)
  }
}

/**
 * 创建一个合并 tar 和 unzipper 的流
 */
function createTarUnzipStream<T extends Stream = DownloadStream>(
  options: ResolvedDownloadOptions,
  progressManager?: UnifiedProgressManager,
): T {
  const extractedCount = signal(0)
  const totalEntries = signal(0)
  const hasCompleted = signal(false)

  const tarExtractStream = tar.extract({
    C: options.cacheDir,
    onReadEntry: (entry) => {
      // 只处理 zip 文件
      if (!entry.path.endsWith('.zip')) {
        return
      }

      totalEntries(totalEntries() + 1)

      const zipExtractStream = unzipper.Extract({ path: options.targetDir })
        .on('error', (error) => {
          if (!hasCompleted()) {
            tarExtractStream.emit('error', new DownloadError(DownloadError.Code.ZipExtractionFailed, { cause: error }))
          }
        })
        .on('close', () => {
          const current = extractedCount() + 1
          const total = totalEntries()

          options.onZipExtracted?.(entry as unknown as tar.ReadEntry, total, current)
          extractedCount(current)

          // 更新统一进度
          progressManager?.updateExtractProgress(current, total)
        })

      // 直接将 entry 流到 zip 解压器
      entry.pipe(zipExtractStream)
    },
  })

  // 监听解压完成
  effect(() => {
    if (totalEntries() > 0 && extractedCount() >= totalEntries() && !hasCompleted()) {
      hasCompleted(true)
      tarExtractStream.emit('complete')
    }
  })

  // 处理 tar 解压错误
  tarExtractStream.on('error', (error) => {
    if (!hasCompleted()) {
      tarExtractStream.emit('error', new DownloadError(DownloadError.Code.DownloadFailed, { cause: error }))
    }
  })

  return tarExtractStream as unknown as T
}

/**
 * Download the ArkTS SDK.
 *
 * @param options - The options for the download.
 */
export async function download(options: DownloadOptions): Promise<void> {
  const resolvedOptions = await resolveDownloadOptions(options)
  const requestOptions = await resolveRequestOptions(resolvedOptions)

  return new Promise<void>((resolve, reject) => {
    const startTime = Date.now()
    let lastTime = startTime
    let lastTransferred = 0

    // 确保临时文件目录存在
    if (!fs.existsSync(path.dirname(resolvedOptions.tempFilePath))) {
      fs.mkdirSync(path.dirname(resolvedOptions.tempFilePath), { recursive: true })
    }

    resolvedOptions.requester.get(requestOptions, (response) => {
      // 检查服务器是否支持断点续传
      const currentStartByte = resolvedOptions.startByte || 0
      if (currentStartByte > 0 && response.statusCode !== 206) {
        console.warn('服务器不支持断点续传，将重新开始下载')
        // 删除临时文件，重新开始
        if (fs.existsSync(resolvedOptions.tempFilePath)) {
          fs.unlinkSync(resolvedOptions.tempFilePath)
        }
        resolvedOptions.startByte = 0
      }

      const contentLength = Number.parseInt(response.headers['content-length'] ?? '0', 10)
      const finalStartByte = resolvedOptions.startByte || 0
      const totalSize = finalStartByte > 0 ? finalStartByte + contentLength : contentLength

      // 创建统一进度管理器
      const progressManager = new UnifiedProgressManager(totalSize, options.onProgress)

      // 创建写入流，支持追加模式（用于断点续传）
      const writeStream = fs.createWriteStream(resolvedOptions.tempFilePath, {
        flags: finalStartByte > 0 ? 'a' : 'w',
      })

      // 处理下载错误
      const handleDownloadError = (error: Error): void => {
        writeStream.destroy()
        reject(new DownloadError(DownloadError.Code.DownloadFailed, { cause: error }))
      }

      const progressStream = progress({
        length: totalSize,
        transferred: finalStartByte, // 设置已传输的字节数
        time: 100,
      }).on('progress', (progress) => {
        const currentTime = Date.now()
        const timeDifferenceMs = currentTime - lastTime
        const transferredDifference = progress.transferred - lastTransferred

        // 计算网络速度 (字节/秒)
        const speedBytesPerSecond = timeDifferenceMs > 0 ? (transferredDifference / timeDifferenceMs) * 1000 : 0

        // 转换为合适的单位
        let network: number
        let unit: 'KB' | 'MB'

        if (speedBytesPerSecond >= 1024 * 1024) {
          network = Math.round((speedBytesPerSecond / (1024 * 1024)) * 100) / 100
          unit = 'MB'
        }
        else {
          network = Math.round((speedBytesPerSecond / 1024) * 100) / 100
          unit = 'KB'
        }

        const enhancedProgress = {
          ...progress,
          network,
          unit,
        }

        // 使用统一进度管理器更新下载进度
        progressManager.updateDownloadProgress(enhancedProgress)

        // 更新记录的时间和传输量
        lastTime = currentTime
        lastTransferred = progress.transferred
      })

      if (!fs.existsSync(options.cacheDir))
        fs.mkdirSync(options.cacheDir, { recursive: true })

      // 处理下载完成
      const handleDownloadComplete = (): void => {
        writeStream.end()

        // 标记下载阶段完成
        progressManager.markDownloadComplete()

        // 下载完成后，将临时文件移动到最终的tar缓存目录并开始解压
        const finalTarPath = path.join(options.cacheDir, 'downloaded.tar.gz')

        try {
          if (fs.existsSync(finalTarPath)) {
            fs.unlinkSync(finalTarPath)
          }
          fs.renameSync(resolvedOptions.tempFilePath, finalTarPath)

          // 开始解压，传入统一进度管理器
          const extractStream = fs.createReadStream(finalTarPath)
          const combinedStream = createTarUnzipStream<Stream.Writable>(resolvedOptions, progressManager)
            .on('complete', () => {
              // 清理临时文件
              if (resolvedOptions.clean !== false) {
                if (fs.existsSync(finalTarPath)) {
                  fs.rmSync(finalTarPath, { recursive: true })
                }
                if (fs.existsSync(resolvedOptions.tempFilePath)) {
                  fs.unlinkSync(resolvedOptions.tempFilePath)
                }
              }
              options.onComplete?.()
              resolve()
            })
          combinedStream.on('error', error => reject(new DownloadError(DownloadError.Code.DownloadFailed, { cause: error })))
          extractStream.pipe(combinedStream)
        }
        catch (error) {
          reject(new DownloadError(DownloadError.Code.DownloadFailed, { cause: error }))
        }
      }

      // 连接流管道：response -> progress -> writeStream
      response
        .pipe(progressStream)
        .pipe(writeStream)
        .on('finish', handleDownloadComplete)
        .on('error', handleDownloadError)
    }).on('error', error => reject(new DownloadError(DownloadError.Code.DownloadFailed, { cause: error })))
  })
}
