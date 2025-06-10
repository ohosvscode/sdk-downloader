import type Stream from 'node:stream'
import type * as progressTypes from 'progress-stream'
import type { DownloadOptions } from '../options'
import fs from 'node:fs'
import path from 'node:path'
import progress from 'progress-stream'
import { DownloadError } from '../errors/download'
import { resolveDownloadOptions, resolveRequestOptions } from '../options'
import { UnifiedProgressManager } from '../progress/manager'
import { createTarUnzipStream } from '../streams/extract'

/**
 * 核心下载器类，封装下载逻辑
 */
export class Downloader {
  private options: DownloadOptions

  constructor(options: DownloadOptions) {
    this.options = options
  }

  async execute(): Promise<void> {
    const resolvedOptions = await resolveDownloadOptions(this.options)
    const requestOptions = await resolveRequestOptions(resolvedOptions)

    return new Promise<void>((resolve, reject) => {
      const startTime = Date.now()
      const timeRef = { lastTime: startTime, lastTransferred: 0 }

      // 确保临时文件目录存在
      if (!fs.existsSync(path.dirname(resolvedOptions.tempFilePath))) {
        fs.mkdirSync(path.dirname(resolvedOptions.tempFilePath), { recursive: true })
      }

      resolvedOptions.requester.get(requestOptions, (response) => {
        // 检查服务器是否支持断点续传
        const currentStartByte = resolvedOptions.startByte || 0
        let finalStartByte = currentStartByte

        if (currentStartByte > 0 && response.statusCode !== 206) {
          console.warn('服务器不支持断点续传，将重新开始下载')
          // 删除临时文件，重新开始
          if (fs.existsSync(resolvedOptions.tempFilePath)) {
            fs.unlinkSync(resolvedOptions.tempFilePath)
          }
          resolvedOptions.startByte = 0
          finalStartByte = 0 // 重置起始字节
        }

        const contentLength = Number.parseInt(response.headers['content-length'] ?? '0', 10)
        const totalSize = finalStartByte > 0 ? finalStartByte + contentLength : contentLength

        // 创建统一进度管理器，使用正确的 finalStartByte
        const progressManager = new UnifiedProgressManager(totalSize, finalStartByte, this.options.onProgress)

        // 初始化 lastTransferred 为断点续传的起始位置
        timeRef.lastTransferred = finalStartByte

        // 创建写入流，支持追加模式（用于断点续传）
        const writeStream = fs.createWriteStream(resolvedOptions.tempFilePath, {
          flags: finalStartByte > 0 ? 'a' : 'w',
        })

        // 处理下载错误
        const handleDownloadError = (error: Error): void => {
          writeStream.destroy()
          reject(new DownloadError(DownloadError.Code.DownloadFailed, { cause: error }))
        }

        const progressStream = this.createProgressStream(totalSize, finalStartByte, progressManager, timeRef)

        if (!fs.existsSync(this.options.cacheDir))
          fs.mkdirSync(this.options.cacheDir, { recursive: true })

        // 处理下载完成
        const handleDownloadComplete = (): void => {
          writeStream.end()

          // 标记下载阶段完成
          progressManager.markDownloadComplete()

          this.handleExtraction(resolvedOptions, progressManager, resolve, reject)
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

  private createProgressStream(
    totalSize: number,
    finalStartByte: number,
    progressManager: UnifiedProgressManager,
    timeRef: { lastTime: number, lastTransferred: number },
  ): progressTypes.ProgressStream {
    return progress({
      length: totalSize,
      transferred: finalStartByte, // 设置已传输的字节数
      time: 100,
    }).on('progress', (progress) => {
      const currentTime = Date.now()
      const timeDifferenceMs = currentTime - timeRef.lastTime
      const transferredDifference = progress.transferred - timeRef.lastTransferred

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
        increment: 0, // 这里初始化为0，实际的increment会在UnifiedProgressManager中计算
      }

      // 使用统一进度管理器更新下载进度
      progressManager.updateDownloadProgress(enhancedProgress)

      // 更新记录的时间和传输量
      timeRef.lastTime = currentTime
      timeRef.lastTransferred = progress.transferred
    })
  }

  private handleExtraction(
    resolvedOptions: any,
    progressManager: UnifiedProgressManager,
    resolve: () => void,
    reject: (error: Error) => void,
  ): void {
    // 下载完成后，将临时文件移动到最终的tar缓存目录并开始解压
    const finalTarPath = path.join(this.options.cacheDir, 'downloaded.tar.gz')

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
          this.options.onComplete?.()
          resolve()
        })
      combinedStream.on('error', error => reject(new DownloadError(DownloadError.Code.DownloadFailed, { cause: error })))
      extractStream.pipe(combinedStream)
    }
    catch (error) {
      reject(new DownloadError(DownloadError.Code.DownloadFailed, { cause: error }))
    }
  }
}
