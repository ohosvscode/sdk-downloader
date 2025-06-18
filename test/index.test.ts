import fs from 'node:fs'
import path from 'node:path'
import fg from 'fast-glob'
import { createDownloader, SdkArch, SdkOS, SdkVersion } from '../src'

function getArch(): SdkArch {
  if (process.arch === 'arm' || process.arch === 'arm64')
    return SdkArch.ARM
  else
    return SdkArch.X86
}

function getOS(): SdkOS {
  if (process.platform === 'darwin')
    return SdkOS.MacOS
  else if (process.platform === 'linux')
    return SdkOS.Linux
  else
    return SdkOS.Windows
}

async function download(version: SdkVersion): Promise<void> {
  const cacheDir = path.join(process.cwd(), 'target', '.cache', version)
  const targetDir = path.join(process.cwd(), 'target', 'download', version)
  const downloader = await createDownloader({
    url: {
      arch: getArch(),
      os: getOS(),
      version,
    },
    cacheDir,
    targetDir,
  })

  downloader.on('download-progress', (progress) => {
    // 仅在20，40，60，80，100时打印
    const percentage = progress.percentage.toFixed(2)
    if (percentage === '20.00' || percentage === '40.00' || percentage === '60.00' || percentage === '80.00' || percentage === '100.00') {
      console.warn(`Downloading, ${percentage}%, ${progress.network}${progress.unit}/s`)
    }
  })
  await downloader.startDownload()
  expect(fs.existsSync(cacheDir)).toBe(true)
  await downloader.checkSha256()
  console.warn('Extracting tar...')
  await downloader.extractTar()
  console.warn('Extracting zip...')

  // 添加调试信息
  console.warn('Before extractZip:')
  console.warn('Cache directory:', cacheDir)
  console.warn('Cache directory exists:', fs.existsSync(cacheDir))
  if (fs.existsSync(cacheDir)) {
    console.warn('Cache directory contents:', fs.readdirSync(cacheDir))
    const tarExtractedDir = path.join(cacheDir, '.tar-extracted')
    if (fs.existsSync(tarExtractedDir)) {
      console.warn('.tar-extracted directory contents:', fs.readdirSync(tarExtractedDir))
      // 递归列出所有文件
      const allFiles = fg.sync('**/*', { cwd: tarExtractedDir, absolute: true })
      console.warn('All files in .tar-extracted:', allFiles)
    }
  }

  await downloader.extractZip()

  // 添加调试信息
  console.warn('After extractZip:')
  console.warn('Cache directory:', cacheDir)
  console.warn('Cache directory exists:', fs.existsSync(cacheDir))
  if (fs.existsSync(cacheDir)) {
    console.warn('Cache directory contents:', fs.readdirSync(cacheDir))
    const tarExtractedDir = path.join(cacheDir, '.tar-extracted')
    if (fs.existsSync(tarExtractedDir)) {
      console.warn('.tar-extracted directory contents:', fs.readdirSync(tarExtractedDir))
      // 递归列出所有文件
      const allFiles = fg.sync('**/*', { cwd: tarExtractedDir, absolute: true })
      console.warn('All files in .tar-extracted:', allFiles)
    }
  }

  console.warn('Cleaning...')
  console.warn('Target directory:', targetDir)
  console.warn('Target directory exists:', fs.existsSync(targetDir))
  if (fs.existsSync(targetDir)) {
    console.warn('Target directory contents:', fs.readdirSync(targetDir))
  }

  expect(fs.existsSync(targetDir)).toBe(true)
  await downloader.clean()
  expect(fs.existsSync(cacheDir)).toBe(false)
}

it.concurrent('should download the SDK API10', async () => {
  await download(SdkVersion.API10)
}, 20 * 60 * 1000)

it.concurrent('should download the SDK API11', async () => {
  await download(SdkVersion.API11)
}, 20 * 60 * 1000)

it.concurrent('should download the SDK API12', async () => {
  await download(SdkVersion.API12)
  // Timeout: 20 min
}, 20 * 60 * 1000)

it.concurrent('should download the SDK API13', async () => {
  await download(SdkVersion.API13)
}, 20 * 60 * 1000)

it.concurrent('should download the SDK API14', async () => {
  await download(SdkVersion.API14)
}, 20 * 60 * 1000)

it.concurrent('should download the SDK API15', async () => {
  await download(SdkVersion.API15)
}, 20 * 60 * 1000)

it.concurrent('should download the SDK API18', async () => {
  await download(SdkVersion.API18)
})
