import * as core from '@actions/core'
import * as path from 'node:path'
import { createDownloader } from './download'
import { SdkArch, SdkOS, SdkVersion } from './enums/sdk'

function isLogType(logType: string): logType is 'explicit' | 'full' | 'silent' {
  return ['explicit', 'full', 'silent'].includes(logType)
}

async function run(): Promise<void> {
  try {
    // 获取输入参数
    const version = core.getInput('version', { required: true }) as keyof typeof SdkVersion
    const archInput = core.getInput('arch', { required: false }) || 'X86'
    const osInput = core.getInput('os', { required: false }) || 'Linux'
    const cacheDir = core.getInput('cache-dir', { required: false }) || '.cache/sdk'
    const targetDir = core.getInput('target-dir', { required: false }) || 'sdk'
    const clean = core.getInput('clean', { required: false }) !== 'false'
    const logType = core.getInput('log-type', { required: false }) || 'explicit'
    const logTimeout = parseInt(core.getInput('log-timeout', { required: false }) || '5000', 10)

    // 验证 log-type 参数
    if (!isLogType(logType)) {
      throw new Error(`Invalid log type: ${logType}. Valid options are 'explicit', 'full', or 'silent'.`)
    }

    // 转换字符串输入为枚举值（保持原始大小写）
    const arch = archInput.toLowerCase() === 'arm' ? SdkArch.ARM : SdkArch.X86
    const os = osInput.toLowerCase() === 'macos' ? SdkOS.MacOS : 
               osInput.toLowerCase() === 'windows' ? SdkOS.Windows : SdkOS.Linux

    const workspace = process.env.GITHUB_WORKSPACE || process.cwd()
    const absoluteCacheDir = path.resolve(workspace, cacheDir)
    const absoluteTargetDir = path.resolve(workspace, targetDir)

    core.info(`开始下载 OpenHarmony SDK...`)
    core.info(`版本: ${version}`)
    core.info(`架构: ${archInput}`)
    core.info(`操作系统: ${osInput}`)
    core.info(`缓存目录: ${absoluteCacheDir}`)
    core.info(`目标目录: ${absoluteTargetDir}`)
    core.info(`日志类型: ${logType}`)
    core.info(`日志超时: ${logTimeout}ms`)

    // 节流日志输出
    let lastLogTime = 0

    // 创建下载器
    const downloader = await createDownloader({
      url: { version: SdkVersion[version], arch, os },
      cacheDir: absoluteCacheDir,
      targetDir: absoluteTargetDir,
      clean,
      resumeDownload: true,
    })

    // 根据日志类型设置事件监听
    if (logType === 'silent') {
      // 静默模式，不监听任何事件
    } else if (logType === 'full') {
      // 完整模式，监听所有事件
      downloader.on('*', (ev, data) => {
        core.info(`Event: ${ev}`)
        core.info(JSON.stringify(data))
      })
    } else if (logType === 'explicit') {
      // 显式模式，使用节流监听特定事件
      downloader.on('download-progress', (progress) => {
        const now = Date.now()
        if (now - lastLogTime >= logTimeout) {
          core.info(`下载进度: ${progress.percentage.toFixed(2)}% (${progress.network} ${progress.unit}/s)`)
          lastLogTime = now
        }
      })

      downloader.on('tar-extracted', (entry) => {
        if (entry.type === 'File') {
          const now = Date.now()
          if (now - lastLogTime >= logTimeout) {
            core.debug(`解压文件: ${entry.path}`)
            lastLogTime = now
          }
        }
      })

      downloader.on('zip-extracted', (entry) => {
        if (entry.type === 'File') {
          const now = Date.now()
          if (now - lastLogTime >= logTimeout) {
            core.debug(`解压文件: ${entry.path}`)
            lastLogTime = now
          }
        }
      })
    }

    // 开始下载
    await downloader.startDownload()

    // 验证 SHA256
    core.info('验证文件完整性...')
    await downloader.checkSha256()

    // 解压文件
    core.info('解压 SDK 文件...')
    await downloader.extractTar()
    await downloader.extractZip()

    // 清理缓存（如果需要）
    if (clean) {
      core.info('清理缓存文件...')
      await downloader.clean()
    }

    // 设置输出
    core.setOutput('sdk-path', absoluteTargetDir)
    core.info(`✅ SDK 下载完成！路径: ${absoluteTargetDir}`)

  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(`下载失败: ${error.message}`)
    } else {
      core.setFailed(`下载失败: ${String(error)}`)
    }
  }
}

// 运行 Action
run()