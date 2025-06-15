import fs from 'node:fs'
import path from 'node:path'
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

it('should download the SDK', async () => {
  const cacheDir = path.join(process.cwd(), 'target', '.cache')
  const targetDir = path.join(process.cwd(), 'target', 'download')
  const downloader = await createDownloader({
    url: {
      arch: getArch(),
      os: getOS(),
      version: SdkVersion.API12,
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
  }

  await downloader.extractZip()

  // 添加调试信息
  console.warn('After extractZip:')
  console.warn('Cache directory:', cacheDir)
  console.warn('Cache directory exists:', fs.existsSync(cacheDir))
  if (fs.existsSync(cacheDir)) {
    console.warn('Cache directory contents:', fs.readdirSync(cacheDir))
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

  // Timeout: 20 min
}, 20 * 60 * 1000)
