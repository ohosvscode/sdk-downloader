# @arkts/sdk-downloader

Simple function to download the ArkTS SDK, streaming, simple, easy to use, and support resume download, fast ⚡️

# Install 📦

```bash
pnpm add @arkts/sdk-downloader
```

## Usage 🚀

```ts
import { download, SdkArch, SdkOS, SdkVersion } from '@arkts/sdk-downloader'

download({
  url: {
    os: SdkOS.MacOS,
    version: SdkVersion.API15,
    arch: SdkArch.ARM,
  },
  // Store the resume download file in the cache directory
  cacheDir: 'target/.cache',
  // The sdk target directory
  targetDir: 'target',
  // Whether to resume the download
  resumeDownload: true,
  // The progress callback
  onProgress: (e) => {
    console.warn(`Downloading: ${e.percentage}% ${e.network}${e.unit}`)
  },
  onTarExtracted: (entry) => {
    console.warn(`Extracting TAR file: ${entry.path}`)
  },
  onZipExtracted: (entry, total, current) => {
    console.warn(`Extracting ZIP file: ${entry.path} ${current}/${total}`)
  },
})
```

## Author 🤝

- [Naily Zero](https://github.com/groupguanfang)
- QQ: 1203970284
- Email: zero@naily.cc
- WeChat: gcz-zero

## License 📄

MIT
