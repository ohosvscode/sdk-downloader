# @arkts/sdk-downloader

Simple function to download the ArkTS SDK, streaming, simple, easy to use, and support resume download, fast ⚡️

## Features 🚀

- ↩️ Resume download ✅
- ⬇ Download Progress, tar extract progress and zip extract progress tracking ✅
- 🧵 HTTP/HTTPS support ✅
- 🔗 Support cancel download ✅
- 🧹 Clean the cache directory after the download is complete ✨
- 👂 Support listen events when download, tar extract and zip extract

## Install 📦

```bash
pnpm add @arkts/sdk-downloader
```

## Usage 🚀

```ts
import { createDownloader } from '@arkts/sdk-downloader'

const downloader = await createDownloader({
  url: {
    os: SdkOS.MacOS,
    version: SdkVersion.API15,
    arch: SdkArch.ARM,
  },
  cacheDir: 'target/.cache',
  targetDir: 'target',
  resumeDownload: true,
})

await downloader.startDownload(/** Override request options */)
await downloader.checkSha256()
await downloader.extractTar()
await downloader.extractZip()
await downloader.clean()
```

## Author 🤝

- [Naily Zero](https://github.com/groupguanfang)
- QQ: 1203970284
- Email: zero@naily.cc
- WeChat: gcz-zero

## License 📄

MIT
