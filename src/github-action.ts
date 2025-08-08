import type { SdkVersion } from './enums/sdk'
import path from 'node:path'
import * as cache from '@actions/cache'
import * as core from '@actions/core'
import P from 'pino'
import pretty from 'pino-pretty'
import { logSdkDirStructure, runCommandLineDownload } from './command-line'
import { SdkArch, SdkOS } from './enums/sdk'

async function run(): Promise<void> {
  // 获取输入参数
  const version = core.getInput('version', { required: true }) as keyof typeof SdkVersion
  const archInput = core.getInput('arch', { required: false }) || 'X86'
  const osInput = core.getInput('os', { required: false }) || 'Linux'
  const cacheDir = core.getInput('cache_dir', { required: false }) || '.cache/sdk'
  const targetDir = core.getInput('target_dir', { required: false }) || 'sdk'
  const logType = core.getInput('log_type', { required: false }) || 'explicit'
  const logTimeout = Number.parseInt(core.getInput('log_timeout', { required: false }) || '5000', 10)
  const isCache = core.getBooleanInput('cache', { required: false })
  const logger = P(pretty({ colorize: true, colorizeObjects: true, singleLine: true }))

  // 转换字符串输入为枚举值（保持原始大小写）
  const arch = archInput.toLowerCase() === 'arm' ? SdkArch.ARM : SdkArch.X86
  const os = osInput.toLowerCase() === 'macos'
    ? SdkOS.MacOS
    : osInput.toLowerCase() === 'windows'
      ? SdkOS.Windows
      : SdkOS.Linux

  const cacheKey = `ohos-sdk-${version}-${arch}-${os}`
  const cacheHit = await cache.restoreCache([path.resolve(targetDir)], cacheKey)
  if (cacheHit) {
    logger.warn(`Cache hit: ${cacheHit}, skipping download...`)
    await logSdkDirStructure(logger, targetDir)
    core.setOutput('sdkPath', path.resolve(targetDir))
    return
  }
  else {
    logger.warn(`Cache miss, starting to download...`)
  }

  await runCommandLineDownload({
    apiVersion: version,
    arch: SdkArch[arch] as keyof typeof SdkArch,
    os: SdkOS[os] as keyof typeof SdkOS,
    cacheDir,
    targetDir,
    logType: logType as 'explicit' | 'full' | 'silent',
    logTimeout,
    logger,
  })

  if (isCache) {
    logger.info(`Download & extract successfully, saving cache to ${cacheKey}...`)
    const cacheId = await cache.saveCache([path.resolve(targetDir)], cacheKey)
    logger.info(`Cache saved with id: ${cacheId}.`)
  }
  core.setOutput('sdkPath', path.resolve(targetDir))
}

// 运行 Action
run()
