import type Stream from 'node:stream'
import type { ResolvedDownloadOptions } from '../options'
import type { UnifiedProgressManager } from '../progress/manager'
import { effect, signal } from 'alien-signals'
import * as tar from 'tar'
import * as unzipper from 'unzipper'
import { DownloadError } from '../errors/download'

export interface DownloadStream extends Stream {
  on(event: 'complete', listener: () => void): this
  on(event: 'error', listener: (error: Error) => void): this
}

/**
 * 创建一个合并 tar 和 unzipper 的流
 */
export function createTarUnzipStream<T extends Stream = DownloadStream>(
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
