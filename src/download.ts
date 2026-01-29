import type { Emitter } from 'mitt'
import type { DownloadEventMap, DownloadExecutor, DownloadProgressEvent, ResolvedDownloadOptions } from './options'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { computed } from 'alien-signals'
import fg from 'fast-glob'
import mitt from 'mitt'
import progress from 'progress-stream'
import * as tar from 'tar'
import * as unzipper from 'unzipper'
import { DownloadError } from './errors/download'
import { type DownloadOptions, resolveDownloadOptions } from './options'
import { makeRequest, makeSha256Request } from './request'

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
    let isResolved = false

    function cleanup(): void {
      isResolved = true
      if (!res.destroyed) {
        res.destroy()
      }
      if (!writeStream.destroyed) {
        writeStream.destroy()
      }
    }

    function handleError(error: unknown): void {
      if (!isResolved) {
        cleanup()
        const errorMessage = error instanceof Error ? error.message : String(error)
        reject(new DownloadError(DownloadError.Code.DownloadFailed, {
          message: `Download failed: ${errorMessage}`,
          cause: error,
        }))
      }
    }

    writeStream.on('error', handleError)
    writeStream.on('finish', () => {
      if (!isResolved) {
        isResolved = true
        if (!res.destroyed) {
          res.destroy()
        }
        resolve()
      }
    })

    res.on('error', handleError)
  })
}

async function _checkSha256(filePath: string, sha256: string): Promise<void> {
  if (!fs.existsSync(filePath)) {
    throw new DownloadError(DownloadError.Code.FileNotFound, {
      message: `File not found: ${filePath}`,
    })
  }

  if (!sha256 || typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(sha256.trim())) {
    throw new DownloadError(DownloadError.Code.InvalidSha256, {
      message: 'Invalid SHA256 format',
    })
  }

  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)

    stream.on('error', (error) => {
      reject(new DownloadError(DownloadError.Code.FileReadError, {
        message: `Failed to read file: ${error.message}`,
      }))
    })

    stream.on('data', (chunk) => {
      hash.update(chunk)
    })

    stream.on('end', () => {
      const calculatedHash = hash.digest('hex').trim()
      const expectedHash = sha256.trim()

      if (calculatedHash !== expectedHash) {
        const error = new DownloadError(DownloadError.Code.Sha256Mismatch, {
          message: `SHA256 checksum mismatch, expected: ${expectedHash}, actual: ${calculatedHash}`,
        })
        reject(error)
      }
      else {
        resolve()
      }
    })
  })
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

// Unix 文件类型常量
const S_IFMT = 0o170000 // 文件类型掩码
const S_IFLNK = 0o120000 // 符号链接

/**
 * 从 ZIP 的 externalFileAttributes 字段提取 Unix 权限信息
 * Unix 权限存储在高 16 位
 */
function getUnixMode(externalFileAttributes: number): { mode: number, isSymlink: boolean } {
  const unixMode = (externalFileAttributes >> 16) & 0xFFFF
  const fileType = unixMode & S_IFMT
  const permissions = unixMode & 0o7777

  return {
    mode: permissions,
    isSymlink: fileType === S_IFLNK,
  }
}

// 并发控制：限制同时进行的文件操作数量，避免 EMFILE 错误
const MAX_CONCURRENT_FILES = 50

/**
 * 批量执行异步任务，限制并发数量
 */
async function runWithConcurrencyLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<T[]> {
  const results: T[] = []
  let index = 0

  async function runNext(): Promise<void> {
    while (index < tasks.length) {
      const currentIndex = index++
      results[currentIndex] = await tasks[currentIndex]()
    }
  }

  // 启动 limit 个并发执行器
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => runNext())
  await Promise.all(workers)
  return results
}

async function _extractZip(resolvedOptions: ResolvedDownloadOptions, extractedDir: string, emitter: Emitter<DownloadEventMap>): Promise<void> {
  // 在MacOS上解压直接解压到目标目录即可，linux和windows则需要找到对应的目录再解压
  const currentOS = process.platform === 'win32' ? 'windows' : process.platform === 'linux' ? 'linux' : undefined
  const isUnix = process.platform !== 'win32'

  // 使用 cwd 选项而不是将路径嵌入模式中，避免 Windows 上反斜杠导致的问题
  let files = fg.sync('**/*.zip', {
    cwd: extractedDir,
    onlyFiles: true,
    absolute: true,
  })

  if (currentOS === 'linux' || currentOS === 'windows') {
    files = files.filter(filePath => filePath.includes(currentOS))
  }

  async function extractSingleZip(filePath: string): Promise<void> {
    // 使用 Open.file() API 来获取完整的 Central Directory 信息
    // 包括 externalFileAttributes（Unix 权限和符号链接信息）
    const directory = await unzipper.Open.file(filePath)
    // 存储需要设置权限的文件（在所有文件写入完成后设置）
    const permissionsToSet: Array<{ path: string, mode: number }> = []

    // 将文件处理封装为任务
    const extractTasks: Array<() => Promise<void>> = []

    for (const file of directory.files) {
      const currentFilePath = path.join(resolvedOptions.targetDir, file.path)
      const { mode: unixPermissions, isSymlink } = getUnixMode(file.externalFileAttributes)

      if (isSymlink && isUnix) {
        // 符号链接任务
        extractTasks.push(async () => {
          // 确保父目录存在
          const parentDir = path.dirname(currentFilePath)
          if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true })
          }

          // 符号链接：文件内容就是链接目标路径
          const targetPath = (await file.buffer()).toString('utf8')
          // 如果符号链接已存在，先删除
          if (fs.existsSync(currentFilePath)) {
            fs.unlinkSync(currentFilePath)
          }
          fs.symlinkSync(targetPath, currentFilePath)
        })
      }
      else if (file.type === 'Directory') {
        // 目录可以直接同步创建，不需要限制并发
        const parentDir = path.dirname(currentFilePath)
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true })
        }
        if (!fs.existsSync(currentFilePath)) {
          fs.mkdirSync(currentFilePath, { recursive: true })
        }
        // 记录需要设置权限的目录
        if (isUnix && unixPermissions) {
          permissionsToSet.push({ path: currentFilePath, mode: unixPermissions })
        }
      }
      else if (file.type === 'File') {
        // 普通文件任务
        extractTasks.push(async () => {
          // 确保父目录存在
          const parentDir = path.dirname(currentFilePath)
          if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true })
          }

          const entry = file.stream()

          await new Promise<void>((resolve, reject) => {
            // 创建文件时设置初始权限（如果有的话）
            const writeStream = fs.createWriteStream(currentFilePath, {
              mode: isUnix && unixPermissions ? unixPermissions : 0o644,
            })
            writeStream.on('error', reject)
            writeStream.on('finish', () => {
              // 记录需要设置权限的文件（确保权限正确，特别是可执行文件）
              if (isUnix && unixPermissions) {
                permissionsToSet.push({ path: currentFilePath, mode: unixPermissions })
              }
              resolve()
            })
            entry.pipe(writeStream)
          })

          await resolvedOptions.onZipExtracted?.(entry)
          emitter.emit('zip-extracted', entry)
        })
      }
    }

    // 使用并发限制执行所有文件提取任务
    await runWithConcurrencyLimit(extractTasks, MAX_CONCURRENT_FILES)

    // 设置文件权限（在所有文件写入完成后）
    for (const { path: filePath, mode } of permissionsToSet) {
      try {
        fs.chmodSync(filePath, mode)
      }
      catch {
        // 忽略权限设置失败（可能是某些特殊文件）
      }
    }
  }

  // 确保目标目录存在
  if (!fs.existsSync(resolvedOptions.targetDir)) {
    fs.mkdirSync(resolvedOptions.targetDir, { recursive: true })
  }

  // 串行处理每个 zip 文件，避免同时打开太多文件
  for (const zipFile of files) {
    await extractSingleZip(zipFile)
  }
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
