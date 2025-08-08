import process from 'node:process'
import P from 'pino'
import pretty from 'pino-pretty'
import { createDownloader } from './download'
import { getSdkUrl, SdkArch, SdkOS, SdkVersion } from './enums/sdk'
import { CliError } from './errors/cli'

interface DownloadCommandLineOptions {
  apiVersion: keyof typeof SdkVersion
  arch: keyof typeof SdkArch
  os: keyof typeof SdkOS
  cacheDir: string
  targetDir: string
  logType: 'explicit' | 'full' | 'silent'
  logTimeout: number
}

function isLogType(logType: string): logType is 'explicit' | 'full' | 'silent' {
  return ['explicit', 'full', 'silent'].includes(logType)
}

export async function runCommandLineDownload(options: DownloadCommandLineOptions): Promise<void> {
  if (!options.apiVersion || !options.arch || !options.os) {
    throw new CliError('Please provide --api-version, --arch, and --os options.', options)
  }
  if (!isLogType(options.logType))
    throw new CliError(`Invalid log type: ${options.logType}. Valid options are 'explicit', 'full', or 'silent'.`, options)
  const url = getSdkUrl(SdkVersion[options.apiVersion], SdkArch[options.arch], SdkOS[options.os])
  if (!url) {
    throw new CliError(`No SDK found for version ${options.apiVersion}, architecture ${options.arch}, and OS ${options.os}.`, options)
  }

  const logger = P(pretty({ colorize: true, colorizeObjects: true, singleLine: true }))
  logger.info(options, `CLI Options:`)
  const abortController = new AbortController()
  process.on('exit', () => abortController.abort())
  const downloader = await createDownloader({
    url,
    cacheDir: options.cacheDir,
    targetDir: options.targetDir,
    resumeDownload: true,
    signal: abortController.signal,
  })

  downloader.on('*', (ev, data) => {
    if (options.logType === 'silent')
      return
    if (options.logType === 'full')
      return logger.info({ event: ev, data }, `Event: ${ev}`)
  })

  if (options.logType === 'explicit') {
    // 每隔 5 秒打印一次下载进度
    let lastLogTime = 0
    downloader.on('download-progress', (progress) => {
      const now = Date.now()
      if (now - lastLogTime >= options.logTimeout) { // 5000ms = 5秒
        logger.info({
          ...progress,
          msg: `Percentage: ${progress.percentage.toFixed(2)}%, current speed: ${progress.network}${progress.unit}/s`,
        })
        lastLogTime = now
      }
    })
    downloader.on('zip-extracted', (entry) => {
      // 每隔 5 秒打印一次解压进度
      const now = Date.now()
      if (now - lastLogTime >= options.logTimeout) {
        logger.info(entry, `Extracted file in zip: ${entry.path}...`)
        lastLogTime = now
      }
    })
    downloader.on('tar-extracted', (entry) => {
      // 每隔 5 秒打印一次解压进度
      const now = Date.now()
      if (now - lastLogTime >= options.logTimeout) { // 5000ms = 5秒
        logger.info(entry, `Extracted file in tar.gz: ${entry.path}...`)
        lastLogTime = now
      }
    })
  }

  logger.info(`Starting download from ${url}`)
  await downloader.startDownload()
  logger.info(`Download completed and saved to ${options.targetDir}, starting SHA256 check...`)
  await downloader.checkSha256()
  logger.info(`SHA256 check passed, SDK is ready in ${options.targetDir}, starting extract tar...`)
  await downloader.extractTar()
  logger.info(`SDK extracted successfully, starting extract zip...`)
  await downloader.extractZip()
  logger.info(`SDK extracted successfully, cleanup...`)
  await downloader.clean()
  logger.info(`Cleanup completed, SDK is ready in ${options.targetDir}.`)
}
