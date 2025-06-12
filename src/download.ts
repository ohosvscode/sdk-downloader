import type { Emitter } from 'mitt'
import type { DownloadEventMap, DownloadExecutor, DownloadProgressEvent, ResolvedDownloadOptions } from './options'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { computed } from 'alien-signals'
import fg from 'fast-glob'
import mitt from 'mitt'
import progress from 'progress-stream'
import * as tar from 'tar'
import * as unzipper from 'unzipper'
import { DownloadError } from './errors/download'
import { type DownloadOptions, resolveDownloadOptions } from './options'
import { makeRequest, makeSha256Request } from './request'

function typeAssert<T>(_value: unknown): asserts _value is T {}

function useDownloadProgress() {
  let lastTime = Date.now()
  let lastTransferred = 0
  let lastPercentage = 0
  const speedHistory: number[] = [] // 存储最近几次的速度计算
  const maxHistorySize = 5 // 最多保存5次历史记录
  const minTimeInterval = 100 // 最小时间间隔100ms，避免计算过于频繁

  return (progress: progress.Progress): { network: number, unit: 'KB' | 'MB', increment: number } => {
    const currentTime = Date.now()
    const timeDifference = currentTime - lastTime
    const transferredDifference = progress.transferred - lastTransferred

    // 当前下载进度（百分比）与上一次下载进度（百分比）的差值，用于适配vscode.withProgress的increment参数
    const increment: number = progress.percentage - lastPercentage

    let network: number
    let unit: 'KB' | 'MB'

    // 只有当时间间隔足够大且有数据传输时才计算新的速度
    if (timeDifference >= minTimeInterval && transferredDifference > 0) {
      const currentSpeed = (transferredDifference / timeDifference) * 1000
      speedHistory.push(currentSpeed)

      // 保持历史记录数量在限制内
      if (speedHistory.length > maxHistorySize) {
        speedHistory.shift()
      }

      lastTime = currentTime
      lastTransferred = progress.transferred
    }

    // 计算平均速度，如果没有历史记录则使用0
    const avgSpeedBytesPerSecond = speedHistory.length > 0
      ? speedHistory.reduce((sum, speed) => sum + speed, 0) / speedHistory.length
      : 0

    if (avgSpeedBytesPerSecond >= 1024 * 1024) {
      network = Math.round(avgSpeedBytesPerSecond / (1024 * 1024) * 100) / 100
      unit = 'MB'
    }
    else {
      network = Math.round((avgSpeedBytesPerSecond / 1024) * 100) / 100
      unit = 'KB'
    }

    lastPercentage = progress.percentage

    return {
      network,
      unit,
      increment,
    }
  }
}

async function onDownloaded(writeStream: fs.WriteStream, res: import('node:http').IncomingMessage): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    writeStream.on('error', reject)
    res.on('error', reject)
    res.on('end', () => {
      writeStream.close()
      resolve()
    })
  })
}

async function _checkSha256(filePath: string, sha256: string): Promise<void> {
  const fileBuffer = fs.readFileSync(filePath)
  const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex').trim()
  sha256 = sha256.trim()
  if (hash !== sha256) {
    throw new DownloadError(DownloadError.Code.Sha256Mismatch, {
      message: `SHA256 checksum mismatch, expected: ${sha256}, actual: ${hash}`,
    })
  }
}

async function _extractTar(resolvedOptions: ResolvedDownloadOptions, extractedDir: string, emitter: Emitter<DownloadEventMap>): Promise<void> {
  await tar.extract({
    file: resolvedOptions.tempFilePath,
    cwd: extractedDir,
    onReadEntry: (entry) => {
      resolvedOptions.onTarExtracted?.(entry)
      emitter.emit('tar-extracted', entry)
    },
  })
}

async function _extractZip(resolvedOptions: ResolvedDownloadOptions, extractedDir: string, emitter: Emitter<DownloadEventMap>): Promise<void> {
  const files = fg.sync(path.join(extractedDir, '**', '*.zip'), {
    onlyFiles: true,
    absolute: true,
  }).filter(file => file.endsWith('.zip'))

  async function extractSingleZip(filePath: string): Promise<void> {
    const fileReadStream = fs.createReadStream(filePath).pipe(unzipper.Parse({ forceStream: true }))
    for await (const entry of fileReadStream) {
      typeAssert<unzipper.Entry>(entry)
      const currentFilePath = path.join(resolvedOptions.targetDir, entry.path)

      if (entry.type === 'File') {
        if (!fs.existsSync(path.dirname(currentFilePath)))
          fs.mkdirSync(path.dirname(currentFilePath), { recursive: true })
        entry.pipe(fs.createWriteStream(currentFilePath))
        await resolvedOptions.onZipExtracted?.(entry)
        emitter.emit('zip-extracted', entry)
      }
      else if (entry.type === 'Directory') {
        if (!fs.existsSync(currentFilePath))
          fs.mkdirSync(currentFilePath, { recursive: true })
      }
    }
  }

  await Promise.all(files.map(extractSingleZip))
}

/**
 * Download the ArkTS SDK.
 *
 * @param options - The options for the download.
 */
export async function createDownloader(options: DownloadOptions): Promise<DownloadExecutor> {
  const resolvedOptions = resolveDownloadOptions(options)
  const emitter = mitt<DownloadEventMap>()

  async function startDownload(requestOptions?: import('node:https').RequestOptions): Promise<void> {
    const startByte = computed<number>(() => fs.existsSync(resolvedOptions.tempFilePath) ? fs.statSync(resolvedOptions.tempFilePath).size : 0)
    const res = await makeRequest(resolvedOptions, startByte(), {
      signal: resolvedOptions.signal,
      ...resolvedOptions.requestOptions,
      ...requestOptions,
    })
    const totalLength = computed<number>(() => (Number(res.headers['content-length']) || 0) + startByte())
    const downloadProgressStream = progress({ length: totalLength(), transferred: startByte() })
    const progressHandler = useDownloadProgress()
    downloadProgressStream.on('progress', (progress) => {
      const progressEvent: DownloadProgressEvent = {
        ...progress,
        ...progressHandler(progress),
      }
      options.onDownloadProgress?.(progressEvent)
      emitter.emit('download-progress', progressEvent)
    })

    if (res.statusCode === 200 || res.statusCode === 206) {
      const writeStream = fs.createWriteStream(resolvedOptions.tempFilePath, {
        flags: startByte() > 0 ? 'a' : 'w',
        start: startByte(),
      })
      res.pipe(downloadProgressStream).pipe(writeStream)
      await onDownloaded(writeStream, res)
    }
  }

  async function checkSha256(): Promise<void> {
    const sha256 = await makeSha256Request(resolvedOptions)
    await _checkSha256(resolvedOptions.tempFilePath, sha256)
  }

  const extractedDir = path.join(resolvedOptions.cacheDir, '.tar-extracted')

  async function extractTar(): Promise<void> {
    if (!fs.existsSync(extractedDir))
      fs.mkdirSync(extractedDir, { recursive: true })
    await _extractTar(resolvedOptions, extractedDir, emitter)
  }

  async function extractZip(): Promise<void> {
    await _extractZip(resolvedOptions, extractedDir, emitter)
  }

  async function clean(): Promise<void> {
    if (resolvedOptions.clean !== false) {
      fs.rmSync(resolvedOptions.tempFilePath, { recursive: true })
      fs.rmSync(resolvedOptions.cacheDir, { recursive: true })
    }
  }

  return {
    startDownload,
    checkSha256,
    extractTar,
    extractZip,
    clean,
    emit: emitter.emit,
    on: emitter.on,
    off: emitter.off,
    all: emitter.all,
  }
}

/**
 * Download the ArkTS SDK.
 *
 * @deprecated Deprecate this entry in newer version.
 * @param options - The options for the download.
 */
export async function download(options: DownloadOptions): Promise<DownloadExecutor> {
  return await createDownloader(options)
}
