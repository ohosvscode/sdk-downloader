import type { Emitter } from 'mitt'
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
  /**
   * The increment of the {@linkcode DownloadProgressEvent.percentage}.
   */
  increment: number
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
   * Whether to clean the cache directory after the download is complete.
   *
   * @default true
   */
  clean?: boolean
  /**
   * The type of request to use.
   */
  requestType?: 'http' | 'https'
  /**
   * The signal to abort the download.
   */
  signal?: AbortSignal
  /**
   * The extra options to pass to the request.
   */
  requestOptions?: import('node:https').RequestOptions
  /**
   * Whether to enable resume download. If enabled, the download will automatically resume from where it left off.
   *
   * @default true
   */
  resumeDownload?: boolean
  /**
   * The temporary file path for storing partial downloads. If not specified, will use tarCacheDir + 'download.tmp.tar.gz'.
   */
  tempFilePath?: string
  /**
   * The callback function to be called when the download progress changes.
   *
   * @param e - The progress event.
   */
  onDownloadProgress?(e: DownloadProgressEvent): void | Promise<void>
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
   */
  onZipExtracted?(entry: import('unzipper').Entry): void | Promise<void>
}

export interface DownloadExecutor extends Emitter<DownloadEventMap> {
  startDownload(): Promise<void>
  checkSha256(): Promise<void>
  extractTar(): Promise<void>
  extractZip(): Promise<void>
  clean(): Promise<void>
}

// eslint-disable-next-line ts/consistent-type-definitions
export type DownloadEventMap = {
  'download-progress': DownloadProgressEvent
  'tar-extracted': tar.ReadEntry
  'zip-extracted': import('unzipper').Entry
}

export type ResolvedDownloadOptions = Omit<DownloadOptions, 'url'> & {
  url: string
  requester: typeof import('node:http') | typeof import('node:https')
  tempFilePath: string
}

export function resolveDownloadOptions(options: DownloadOptions): ResolvedDownloadOptions {
  const url = typeof options.url === 'string' ? options.url : getSdkUrl(options.url.version, options.url.arch, options.url.os)
  if (!url)
    throw new DownloadError(DownloadError.Code.InvalidUrl)

  if (!fs.existsSync(options.cacheDir))
    fs.mkdirSync(options.cacheDir, { recursive: true })

  options.tempFilePath = options.tempFilePath ? path.resolve(options.tempFilePath) : path.resolve(path.join(options.cacheDir, 'download.tmp.tar.gz'))

  if (!fs.existsSync(path.dirname(options.tempFilePath)))
    fs.mkdirSync(path.dirname(options.tempFilePath), { recursive: true })

  return {
    ...options,
    url,
    requester: options.requestType === 'http' ? http : https,
    tempFilePath: options.tempFilePath,
    targetDir: path.resolve(options.targetDir),
    resumeDownload: typeof options.resumeDownload === 'boolean' ? options.resumeDownload : true,
  }
}
