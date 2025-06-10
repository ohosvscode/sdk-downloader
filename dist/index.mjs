import fs from "node:fs";
import Stream from "node:stream";
import { effect, signal } from "alien-signals";
import progress from "progress-stream";
import * as tar from "tar";
import * as unzipper from "unzipper";
import http from "node:http";
import https from "node:https";

//#region src/errors/download.ts
var DownloadError = class extends Error {
	constructor(code, options) {
		super(options?.message);
		this.code = code;
		this.cause = options?.cause;
	}
};
(function(_DownloadError) {
	let Code = /* @__PURE__ */ function(Code$1) {
		Code$1["DownloadFailed"] = "DOWNLOAD_FAILED";
		Code$1["ZipExtractionFailed"] = "ZIP_EXTRACTION_FAILED";
		return Code$1;
	}({});
	_DownloadError.Code = Code;
})(DownloadError || (DownloadError = {}));

//#endregion
//#region src/enums/sdk.ts
let SdkVersion = /* @__PURE__ */ function(SdkVersion$1) {
	SdkVersion$1["API10"] = "4.0.0";
	SdkVersion$1["API11"] = "4.1.0";
	SdkVersion$1["API12"] = "5.0.0";
	SdkVersion$1["API13"] = "5.0.1";
	SdkVersion$1["API14"] = "5.0.2";
	SdkVersion$1["API15"] = "5.0.3";
	SdkVersion$1["API18"] = "5.1.0";
	return SdkVersion$1;
}({});
let SdkArch = /* @__PURE__ */ function(SdkArch$1) {
	SdkArch$1[SdkArch$1["X86"] = 0] = "X86";
	SdkArch$1[SdkArch$1["ARM"] = 1] = "ARM";
	return SdkArch$1;
}({});
let SdkOS = /* @__PURE__ */ function(SdkOS$1) {
	SdkOS$1[SdkOS$1["MacOS"] = 0] = "MacOS";
	SdkOS$1[SdkOS$1["Windows"] = 1] = "Windows";
	SdkOS$1[SdkOS$1["Linux"] = 2] = "Linux";
	return SdkOS$1;
}({});
const urls = {
	[SdkVersion.API10]: {
		[SdkArch.X86]: {
			[SdkOS.MacOS]: "https://mirrors.huaweicloud.com/harmonyos/os/4.0-Release/ohos-sdk-mac-public.tar.gz",
			[SdkOS.Windows]: "https://mirrors.huaweicloud.com/harmonyos/os/4.0-Release/ohos-sdk-windows_linux-public.tar.gz",
			[SdkOS.Linux]: "https://mirrors.huaweicloud.com/harmonyos/os/4.0-Release/ohos-sdk-windows_linux-public.tar.gz"
		},
		[SdkArch.ARM]: {
			[SdkOS.MacOS]: "https://mirrors.huaweicloud.com/harmonyos/os/4.0-Release/L2-SDK-MAC-M1-PUBLIC.tar.gz",
			[SdkOS.Windows]: "https://mirrors.huaweicloud.com/harmonyos/os/4.0-Release/ohos-sdk-windows_linux-public.tar.gz",
			[SdkOS.Linux]: null
		}
	},
	[SdkVersion.API11]: {
		[SdkArch.X86]: {
			[SdkOS.MacOS]: "https://mirrors.huaweicloud.com/harmonyos/os/4.1-Release/ohos-sdk-mac-public-signed.tar.gz",
			[SdkOS.Windows]: "https://mirrors.huaweicloud.com/harmonyos/os/4.1-Release/ohos-sdk-windows_linux-public.tar.gz",
			[SdkOS.Linux]: "https://mirrors.huaweicloud.com/harmonyos/os/4.1-Release/ohos-sdk-windows_linux-public.tar.gz"
		},
		[SdkArch.ARM]: {
			[SdkOS.MacOS]: "https://mirrors.huaweicloud.com/harmonyos/os/4.1-Release/L2-SDK-MAC-M1-PUBLIC.tar.gz",
			[SdkOS.Windows]: "https://mirrors.huaweicloud.com/harmonyos/os/4.1-Release/ohos-sdk-windows_linux-public.tar.gz",
			[SdkOS.Linux]: null
		}
	},
	[SdkVersion.API12]: {
		[SdkArch.X86]: {
			[SdkOS.MacOS]: "https://mirrors.huaweicloud.com/harmonyos/os/5.0.0-Release/ohos-sdk-mac-public.tar.gz",
			[SdkOS.Windows]: "https://mirrors.huaweicloud.com/harmonyos/os/5.0.0-Release/ohos-sdk-windows_linux-public.tar.gz",
			[SdkOS.Linux]: "https://mirrors.huaweicloud.com/harmonyos/os/5.0.0-Release/ohos-sdk-windows_linux-public.tar.gz"
		},
		[SdkArch.ARM]: {
			[SdkOS.MacOS]: "https://mirrors.huaweicloud.com/harmonyos/os/5.0.0-Release/L2-SDK-MAC-M1-PUBLIC.tar.gz",
			[SdkOS.Windows]: "https://mirrors.huaweicloud.com/harmonyos/os/5.0.0-Release/ohos-sdk-windows_linux-public.tar.gz",
			[SdkOS.Linux]: null
		}
	},
	[SdkVersion.API13]: {
		[SdkArch.X86]: {
			[SdkOS.MacOS]: "https://mirrors.huaweicloud.com/harmonyos/os/5.0.1-Release/ohos-sdk-mac-public.tar.gz",
			[SdkOS.Windows]: "https://mirrors.huaweicloud.com/harmonyos/os/5.0.1-Release/ohos-sdk-windows_linux-public.tar.gz",
			[SdkOS.Linux]: "https://mirrors.huaweicloud.com/harmonyos/os/5.0.1-Release/ohos-sdk-windows_linux-public.tar.gz"
		},
		[SdkArch.ARM]: {
			[SdkOS.MacOS]: "https://mirrors.huaweicloud.com/harmonyos/os/5.0.1-Release/L2-SDK-MAC-M1-PUBLIC.tar.gz",
			[SdkOS.Windows]: "https://mirrors.huaweicloud.com/harmonyos/os/5.0.1-Release/ohos-sdk-windows_linux-public.tar.gz",
			[SdkOS.Linux]: null
		}
	},
	[SdkVersion.API14]: {
		[SdkArch.X86]: {
			[SdkOS.MacOS]: "https://mirrors.huaweicloud.com/harmonyos/os/5.0.2-Release/ohos-sdk-mac-public.tar.gz",
			[SdkOS.Windows]: "https://mirrors.huaweicloud.com/harmonyos/os/5.0.2-Release/ohos-sdk-windows_linux-public.tar.gz",
			[SdkOS.Linux]: "https://mirrors.huaweicloud.com/harmonyos/os/5.0.2-Release/ohos-sdk-windows_linux-public.tar.gz"
		},
		[SdkArch.ARM]: {
			[SdkOS.MacOS]: "https://mirrors.huaweicloud.com/harmonyos/os/5.0.2-Release/L2-SDK-MAC-M1-PUBLIC.tar.gz",
			[SdkOS.Windows]: "https://mirrors.huaweicloud.com/harmonyos/os/5.0.2-Release/ohos-sdk-windows_linux-public.tar.gz",
			[SdkOS.Linux]: null
		}
	},
	[SdkVersion.API15]: {
		[SdkArch.X86]: {
			[SdkOS.MacOS]: "https://mirrors.huaweicloud.com/harmonyos/os/5.0.3-Release/ohos-sdk-mac-public.tar.gz",
			[SdkOS.Windows]: "https://mirrors.huaweicloud.com/harmonyos/os/5.0.3-Release/ohos-sdk-windows_linux-public.tar.gz",
			[SdkOS.Linux]: "https://mirrors.huaweicloud.com/harmonyos/os/5.0.3-Release/ohos-sdk-windows_linux-public.tar.gz"
		},
		[SdkArch.ARM]: {
			[SdkOS.MacOS]: "https://mirrors.huaweicloud.com/harmonyos/os/5.0.3-Release/L2-SDK-MAC-M1-PUBLIC.tar.gz",
			[SdkOS.Windows]: "https://mirrors.huaweicloud.com/harmonyos/os/5.0.3-Release/ohos-sdk-windows_linux-public.tar.gz",
			[SdkOS.Linux]: null
		}
	},
	[SdkVersion.API18]: {
		[SdkArch.X86]: {
			[SdkOS.MacOS]: "https://mirrors.huaweicloud.com/harmonyos/os/5.1.0-Release/ohos-sdk-mac-public.tar.gz",
			[SdkOS.Windows]: "https://mirrors.huaweicloud.com/harmonyos/os/5.1.0-Release/ohos-sdk-windows_linux-public.tar.gz",
			[SdkOS.Linux]: "https://mirrors.huaweicloud.com/harmonyos/os/5.1.0-Release/ohos-sdk-windows_linux-public.tar.gz"
		},
		[SdkArch.ARM]: {
			[SdkOS.MacOS]: "https://mirrors.huaweicloud.com/harmonyos/os/5.1.0-Release/L2-SDK-MAC-M1-PUBLIC.tar.gz",
			[SdkOS.Windows]: "https://mirrors.huaweicloud.com/harmonyos/os/5.1.0-Release/ohos-sdk-windows_linux-public.tar.gz",
			[SdkOS.Linux]: null
		}
	}
};
function getSdkUrl(version, arch, os) {
	const url = urls[version];
	return (url?.[arch])?.[os] ?? null;
}
function getSdkUrls() {
	return urls;
}

//#endregion
//#region src/options.ts
async function resolveDownloadOptions(options) {
	const url = typeof options.url === "string" ? options.url : getSdkUrl(options.url.version, options.url.arch, options.url.os);
	if (!url) throw new DownloadError(DownloadError.Code.DownloadFailed, { message: `Unsupported URL: ${JSON.stringify(options.url)}` });
	return {
		...options,
		url,
		requester: options.requestType === "http" ? http : https
	};
}
async function resolveRequestOptions(options) {
	const url = new URL(options.url);
	return {
		headers: options.startByte ? { Range: `bytes=${options.startByte}-` } : void 0,
		method: "GET",
		hostname: url.hostname,
		path: url.pathname,
		port: url.port,
		agent: false,
		rejectUnauthorized: true,
		servername: url.hostname
	};
}

//#endregion
//#region src/download.ts
/**
* 创建一个合并 tar 和 unzipper 的流
*/
function createTarUnzipStream(options) {
	const count = signal(0);
	const passThrough = new Stream.PassThrough();
	const tarExtractStream = tar.extract({
		C: options.tarCacheDir,
		onReadEntry: (entry) => {
			const zipExtractStream = unzipper.Extract({ path: options.targetDir }).on("error", (error) => passThrough.emit("error", new DownloadError(DownloadError.Code.ZipExtractionFailed, { cause: error }))).on("close", () => {
				options.onZipExtracted?.(entry);
				count(count() + 1);
			});
			entry.pipe(zipExtractStream);
		}
	});
	effect(() => {
		if (count() >= 5) passThrough.emit("complete");
	});
	passThrough.pipe(tarExtractStream).on("error", (error) => passThrough.emit("error", new DownloadError(DownloadError.Code.DownloadFailed, { cause: error })));
	return passThrough;
}
/**
* Download the ArkTS SDK.
*
* @param options - The options for the download.
*/
async function download(options) {
	const resolvedOptions = await resolveDownloadOptions(options);
	const requestOptions = await resolveRequestOptions(resolvedOptions);
	return new Promise((resolve, reject) => {
		const startTime = Date.now();
		let lastTime = startTime;
		let lastTransferred = 0;
		resolvedOptions.requester.get(requestOptions, (response) => {
			const totalSize = Number.parseInt(response.headers["content-length"] ?? "0", 10);
			const progressStream = progress({
				length: totalSize,
				time: 100
			}).on("progress", (progress$1) => {
				const currentTime = Date.now();
				const timeDifferenceMs = currentTime - lastTime;
				const transferredDifference = progress$1.transferred - lastTransferred;
				const speedBytesPerSecond = timeDifferenceMs > 0 ? transferredDifference / timeDifferenceMs * 1e3 : 0;
				let networkSpeed;
				let netWorkSpeedUnit;
				if (speedBytesPerSecond >= 1024 * 1024) {
					networkSpeed = Math.round(speedBytesPerSecond / (1024 * 1024) * 100) / 100;
					netWorkSpeedUnit = "MB";
				} else {
					networkSpeed = Math.round(speedBytesPerSecond / 1024 * 100) / 100;
					netWorkSpeedUnit = "KB";
				}
				const downloadProgressEvent = {
					...progress$1,
					networkSpeed,
					netWorkSpeedUnit
				};
				options.onProgress?.(downloadProgressEvent);
				lastTime = currentTime;
				lastTransferred = progress$1.transferred;
			});
			if (!fs.existsSync(options.tarCacheDir)) fs.mkdirSync(options.tarCacheDir, { recursive: true });
			const combinedStream = createTarUnzipStream(resolvedOptions);
			combinedStream.on("complete", () => {
				options.onComplete?.();
				resolve();
			});
			combinedStream.on("error", (error) => reject(new DownloadError(DownloadError.Code.DownloadFailed, { cause: error })));
			response.pipe(progressStream).pipe(combinedStream);
		});
	});
}

//#endregion
export { DownloadError, SdkArch, SdkOS, SdkVersion, download, getSdkUrl, getSdkUrls };
//# sourceMappingURL=index.mjs.map