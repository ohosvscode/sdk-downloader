import type { ExpectStatic } from 'vitest'
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

/**
 * 验证 Unix 权限和符号链接是否正确保留（issue #17）
 */
function verifyUnixPermissionsAndSymlinks(targetDir: string): {
  executableFiles: string[]
  symlinks: string[]
  executableCount: number
  symlinkCount: number
} {
  const isUnix = process.platform !== 'win32'
  const executableFiles: string[] = []
  const symlinks: string[] = []

  if (!isUnix) {
    console.warn('[验证跳过] Windows 系统不支持 Unix 权限和符号链接验证')
    return { executableFiles, symlinks, executableCount: 0, symlinkCount: 0 }
  }

  // 查找所有文件
  const allFiles = fg.sync('**/*', {
    cwd: targetDir,
    absolute: true,
    onlyFiles: false,
    followSymbolicLinks: false,
  })

  for (const filePath of allFiles) {
    try {
      const stats = fs.lstatSync(filePath)

      // 检查符号链接
      if (stats.isSymbolicLink()) {
        const target = fs.readlinkSync(filePath)
        symlinks.push(`${filePath} -> ${target}`)
      }

      // 检查可执行权限 (owner execute bit: 0o100)
      if (stats.isFile() && (stats.mode & 0o100)) {
        executableFiles.push(`${filePath} (mode: ${(stats.mode & 0o777).toString(8)})`)
      }
    }
    catch {
      // 忽略无法访问的文件
    }
  }

  console.warn('\n========== Unix 权限和符号链接验证 (issue #17) ==========')
  console.warn(`找到 ${executableFiles.length} 个可执行文件:`)
  executableFiles.slice(0, 10).forEach(f => console.warn(`  - ${f}`))
  if (executableFiles.length > 10) {
    console.warn(`  ... 还有 ${executableFiles.length - 10} 个`)
  }

  console.warn(`\n找到 ${symlinks.length} 个符号链接:`)
  symlinks.slice(0, 10).forEach(s => console.warn(`  - ${s}`))
  if (symlinks.length > 10) {
    console.warn(`  ... 还有 ${symlinks.length - 10} 个`)
  }
  console.warn('==========================================================\n')

  return {
    executableFiles,
    symlinks,
    executableCount: executableFiles.length,
    symlinkCount: symlinks.length,
  }
}

async function download(version: SdkVersion, expect: ExpectStatic): Promise<void> {
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

  // 验证 Unix 权限和符号链接 (issue #17)
  const verification = verifyUnixPermissionsAndSymlinks(targetDir)

  // 在 Unix 系统上，native SDK 应该包含可执行文件
  if (process.platform !== 'win32') {
    // native SDK 中应该有可执行文件（如 llvm-ar, clang, hdc 等）
    expect(verification.executableCount).toBeGreaterThan(0)
    console.warn(`✓ 验证通过: 找到 ${verification.executableCount} 个可执行文件`)

    // 符号链接验证（仅在 Linux 上强制要求，macOS SDK 可能不包含符号链接）
    if (process.platform === 'linux') {
      expect(verification.symlinkCount).toBeGreaterThan(0)
      console.warn(`✓ 验证通过: 找到 ${verification.symlinkCount} 个符号链接`)
    }
    else if (verification.symlinkCount > 0) {
      console.warn(`✓ 验证通过: 找到 ${verification.symlinkCount} 个符号链接`)
    }
    else {
      console.warn(`ℹ 符号链接数量为 0（macOS SDK 可能不包含符号链接，这是正常的）`)
    }
  }

  await downloader.clean()
  expect(fs.existsSync(cacheDir)).toBe(false)
}

describe.sequential('should download the SDK', (it) => {
  it.todo('should download the SDK API10', async ({ expect }) => {
    await download(SdkVersion.API10, expect)
    expect(fs.existsSync(path.join(process.cwd(), 'target', 'download', SdkVersion.API10))).toBe(true)
    fs.rmSync(path.join(process.cwd(), 'target', 'download', SdkVersion.API10), { recursive: true, force: true })
  }, 20 * 60 * 1000)

  it.todo('should download the SDK API11', async ({ expect }) => {
    await download(SdkVersion.API11, expect)
    expect(fs.existsSync(path.join(process.cwd(), 'target', 'download', SdkVersion.API11))).toBe(true)
    fs.rmSync(path.join(process.cwd(), 'target', 'download', SdkVersion.API11), { recursive: true, force: true })
  }, 20 * 60 * 1000)

  it.todo('should download the SDK API12', async ({ expect }) => {
    await download(SdkVersion.API12, expect)
    expect(fs.existsSync(path.join(process.cwd(), 'target', 'download', SdkVersion.API12))).toBe(true)
    fs.rmSync(path.join(process.cwd(), 'target', 'download', SdkVersion.API12), { recursive: true, force: true })
  // Timeout: 20 min
  }, 20 * 60 * 1000)

  it.todo('should download the SDK API13', async ({ expect }) => {
    await download(SdkVersion.API13, expect)
    expect(fs.existsSync(path.join(process.cwd(), 'target', 'download', SdkVersion.API13))).toBe(true)
    fs.rmSync(path.join(process.cwd(), 'target', 'download', SdkVersion.API13), { recursive: true, force: true })
  }, 20 * 60 * 1000)

  it.todo('should download the SDK API14', async ({ expect }) => {
    await download(SdkVersion.API14, expect)
    expect(fs.existsSync(path.join(process.cwd(), 'target', 'download', SdkVersion.API14))).toBe(true)
    fs.rmSync(path.join(process.cwd(), 'target', 'download', SdkVersion.API14), { recursive: true, force: true })
  }, 20 * 60 * 1000)

  it.todo('should download the SDK API15', async ({ expect }) => {
    await download(SdkVersion.API15, expect)
    expect(fs.existsSync(path.join(process.cwd(), 'target', 'download', SdkVersion.API15))).toBe(true)
    fs.rmSync(path.join(process.cwd(), 'target', 'download', SdkVersion.API15), { recursive: true, force: true })
  }, 20 * 60 * 1000)

  it.todo('should download the SDK API18', async ({ expect }) => {
    await download(SdkVersion.API18, expect)
    expect(fs.existsSync(path.join(process.cwd(), 'target', 'download', SdkVersion.API18))).toBe(true)
    fs.rmSync(path.join(process.cwd(), 'target', 'download', SdkVersion.API18), { recursive: true, force: true })
  }, 20 * 60 * 1000)

  it.sequential('should download the SDK API20', async ({ expect }) => {
    await download(SdkVersion.API20, expect)
    expect(fs.existsSync(path.join(process.cwd(), 'target', 'download', SdkVersion.API20))).toBe(true)
    fs.rmSync(path.join(process.cwd(), 'target', 'download', SdkVersion.API20), { recursive: true, force: true })
  }, 20 * 60 * 1000)
}, 20 * 60 * 1000 * 10)
