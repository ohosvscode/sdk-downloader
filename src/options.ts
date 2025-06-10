import type progress from 'progress-stream'
import type * as tar from 'tar'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'
import { getSdkUrl, type SdkArch, type SdkOS, type SdkVersion } from './enums/sdk'
import { DownloadError } from './errors/download'

export interface UrlOptions {
  /**
   * The version of the SDK.
   */
  version: SdkVersion
  /**
   * The architecture of the SDK.
   */
  arch: SdkArch
  /**
   * The operating system of the SDK.
   */
  os: SdkOS
}

export interface DownloadProgressEvent extends progress.Progress {
  /**
   * The network speed of the download.
   */
  network: number
  /**
   * The unit of the network speed.
   */
  unit: 'KB' | 'MB'
}

export interface DownloadOptions {
  /**
   * The URL of the SDK.
   */
  url: string | UrlOptions
  /**
   * The cache directory of the tar file.
   */
  cacheDir: string
  /**
   * The target directory of the SDK.
   */
  targetDir: string
  /**
   * The type of request to use.
   */
  requestType?: 'http' | 'https'
  /**
   * The start byte of the download. If not specified, the download will start from the beginning.
   */
  startByte?: number
  /**
   * Whether to enable resume download. If enabled, the download will automatically resume from where it left off.
   */
  resumeDownload?: boolean
  /**
   * The temporary file path for storing partial downloads. If not specified, will use tarCacheDir + '.tmp'.
   */
  tempFilePath?: string
  /**
   * The callback function to be called when the download progress changes.
   *
   * @param e - The progress event.
   */
  onProgress?(e: DownloadProgressEvent): void | Promise<void>
  /**
   * The callback function to be called when the tar file is extracted.
   *
   * @param entry - The entry of the tar file.
   */
  onTarExtracted?(entry: tar.ReadEntry): void | Promise<void>
  /**
   * The callback function to be called when the zip file is extracted.
   *
   * @param entry - The entry of the zip file.
   * @param total - The total number of entries.
   */
  onZipExtracted?(entry: tar.ReadEntry, total: number, current: number): void | Promise<void>
  /**
   * The callback function to be called when the download is complete.
   */
  onComplete?(): void | Promise<void>
}

export type ResolvedDownloadOptions = Omit<DownloadOptions, 'url'> & {
  url: string
  requester: typeof import('node:http') | typeof import('node:https')
  tempFilePath: string
}

/**
 * 检查临时文件大小，用于断点续传
 */
export function getExistingFileSize(filePath: string): number {
  try {
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath)
      return stats.size
    }
    return 0
  }
  catch {
    return 0
  }
}

/**
 * 准备断点续传的选项
 */
export function prepareResumeOptions(options: DownloadOptions): { startByte: number, tempFilePath: string } {
  const tempFilePath = options.tempFilePath || path.join(options.cacheDir, `download.tmp`)
  let startByte = options.startByte || 0

  if (options.resumeDownload && !options.startByte) {
    // 自动检测已下载的文件大小
    startByte = getExistingFileSize(tempFilePath)
  }

  return { startByte, tempFilePath }
}

export async function resolveDownloadOptions(options: DownloadOptions): Promise<ResolvedDownloadOptions> {
  const url = typeof options.url === 'string' ? options.url : getSdkUrl(options.url.version, options.url.arch, options.url.os)
  if (!url) {
    throw new DownloadError(DownloadError.Code.DownloadFailed, {
      message: `Unsupported URL: ${JSON.stringify(options.url)}`,
    })
  }

  const { startByte, tempFilePath } = prepareResumeOptions(options)

  return {
    ...options,
    url,
    startByte,
    tempFilePath,
    requester: options.requestType === 'http' ? http : https,
  }
}

export async function resolveRequestOptions(options: ResolvedDownloadOptions): Promise<import('node:https').RequestOptions | import('node:http').RequestOptions> {
  const url = new URL(options.url)

  return {
    headers: options.startByte
      ? {
          Range: `bytes=${options.startByte}-`,
        }
      : undefined,
    method: 'GET',
    hostname: url.hostname,
    path: url.pathname,
    port: url.port,
    agent: false,
    rejectUnauthorized: true,
    servername: url.hostname,
  }
}

/**
 * 智能断点续传管理器
 * 用于自动处理断点续传的各种情况
 */
export class ResumeManager {
  private tempFilePath: string
  private maxRetries: number
  private retryCount: number = 0

  constructor(tempFilePath: string, maxRetries: number = 3) {
    this.tempFilePath = tempFilePath
    this.maxRetries = maxRetries
  }

  /**
   * 获取应该开始下载的字节位置
   */
  getStartByte(): number {
    return getExistingFileSize(this.tempFilePath)
  }

  /**
   * 检查是否应该重试下载
   */
  shouldRetry(): boolean {
    return this.retryCount < this.maxRetries
  }

  /**
   * 记录一次重试
   */
  recordRetry(): void {
    this.retryCount++
  }

  /**
   * 重置重试计数
   */
  resetRetries(): void {
    this.retryCount = 0
  }

  /**
   * 清理临时文件
   */
  cleanup(): void {
    try {
      if (fs.existsSync(this.tempFilePath)) {
        fs.unlinkSync(this.tempFilePath)
      }
    }
    catch {
      // 忽略清理错误
    }
  }

  /**
   * 验证文件完整性（可选的校验和验证）
   */
  validateFile(expectedSize?: number): boolean {
    try {
      if (!fs.existsSync(this.tempFilePath)) {
        return false
      }

      const stats = fs.statSync(this.tempFilePath)

      if (expectedSize && stats.size !== expectedSize) {
        return false
      }

      return true
    }
    catch {
      return false
    }
  }
}

/**
 * 创建智能断点续传下载选项
 */
export function createResumeDownloadOptions(
  baseOptions: DownloadOptions,
  resumeManager?: ResumeManager,
): DownloadOptions {
  const tempFilePath = baseOptions.tempFilePath || path.join(baseOptions.cacheDir, 'download.tmp')
  const manager = resumeManager || new ResumeManager(tempFilePath)

  return {
    ...baseOptions,
    resumeDownload: true,
    tempFilePath,
    startByte: baseOptions.startByte || manager.getStartByte(),
  }
}
