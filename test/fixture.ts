import { SdkArch, SdkOS, SdkVersion } from '../src'
import { download } from '../src'

// 基本下载示例
export const basicDownload = download({
  url: {
    os: SdkOS.MacOS,
    version: SdkVersion.API10,
    arch: SdkArch.ARM,
  },
  cacheDir: 'target/.cache',
  targetDir: 'target',
  resumeDownload: true,
  onDownloadProgress: (e) => {
    console.warn(`下载进度: ${e.percentage}% ${e.network}${e.unit}, increment: ${e.increment}`)
  },
  onTarExtracted: (entry) => {
    console.warn(`解压TAR文件完成: ${entry.path}`)
  },
  onZipExtracted: (entry) => {
    console.warn(`解压ZIP文件完成: ${entry.path}`)
  },
}) as Promise<void>
