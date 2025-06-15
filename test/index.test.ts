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
  const cacheDir = path.join(process.cwd(), 'target/.cache')
  const targetDir = path.join(process.cwd(), 'target/download')
  const downloader = await createDownloader({
    url: {
      arch: getArch(),
      os: getOS(),
      version: SdkVersion.API12,
    },
    cacheDir,
    targetDir,
  })

  let totalPercentage = 0
  downloader.on('download-progress', (progress) => {
    totalPercentage += progress.increment
    // 仅在20，40，60，80，100时打印
    const percentage = progress.percentage.toFixed(1)
    if (percentage === '20.0' || percentage === '40.0' || percentage === '60.0' || percentage === '80.0' || percentage === '100.0') {
      console.warn(`Downloading, ${percentage}%, ${progress.network}${progress.unit}/s`)
    }
  })
  downloader.on('tar-extracted', (entry) => {
    console.warn(`Extracting: ${entry.path}`)
  })
  downloader.on('zip-extracted', (entry) => {
    console.warn(`Extracting: ${entry.path}`)
  })

  await downloader.startDownload()
  expect(totalPercentage).toBe(100)
  expect(fs.existsSync(cacheDir)).toBe(true)
  await downloader.checkSha256()
  await downloader.extractTar()
  await downloader.extractZip()
  expect(fs.existsSync(targetDir)).toBe(true)
  await downloader.clean()
  expect(fs.readdirSync(cacheDir)).toHaveLength(0)

  // Timeout: 20 min
}, 20 * 60 * 1000)
