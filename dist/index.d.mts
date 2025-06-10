import Stream from "node:stream";
import progress from "progress-stream";
import * as tar from "tar";

//#region src/enums/sdk.d.ts
declare enum SdkVersion {
  API10 = "4.0.0",
  API11 = "4.1.0",
  API12 = "5.0.0",
  API13 = "5.0.1",
  API14 = "5.0.2",
  API15 = "5.0.3",
  API18 = "5.1.0",
}
declare enum SdkArch {
  X86 = 0,
  ARM = 1,
}
declare enum SdkOS {
  MacOS = 0,
  Windows = 1,
  Linux = 2,
}
type SdkUrlStorage = Record<SdkVersion, Record<SdkArch, Record<SdkOS, string | null>>>;
declare function getSdkUrl(version: SdkVersion, arch: SdkArch, os: SdkOS): string | null;
declare function getSdkUrls(): SdkUrlStorage;
//#endregion
//#region src/options.d.ts
interface UrlOptions {
  version: SdkVersion;
  arch: SdkArch;
  os: SdkOS;
}
interface DownloadProgressEvent extends progress.Progress {
  networkSpeed: number;
  netWorkSpeedUnit: "KB" | "MB";
}
interface DownloadOptions {
  /**
  * The URL of the SDK.
  */
  url: string | UrlOptions;
  /**
  * The cache directory of the tar file.
  */
  tarCacheDir: string;
  /**
  * The target directory of the SDK.
  */
  targetDir: string;
  /**
  * The type of request to use.
  */
  requestType?: "http" | "https";
  /**
  * The start byte of the download. If not specified, the download will start from the beginning.
  */
  startByte?: number;
  /**
  * The callback function to be called when the download progress changes.
  *
  * @param e - The progress event.
  */
  onProgress?(e: DownloadProgressEvent): void | Promise<void>;
  /**
  * The callback function to be called when the tar file is extracted.
  *
  * @param entry - The entry of the tar file.
  */
  onTarExtracted?(entry: tar.ReadEntry): void | Promise<void>;
  /**
  * The callback function to be called when the zip file is extracted.
  *
  * @param entry - The entry of the zip file.
  */
  onZipExtracted?(entry: tar.ReadEntry): void | Promise<void>;
  /**
  * The callback function to be called when the download is complete.
  */
  onComplete?(): void | Promise<void>;
}
//#endregion
//#region src/download.d.ts
/**
* Download the ArkTS SDK.
*
* @param options - The options for the download.
*/
declare function download(options: DownloadOptions): Promise<void>;
//#endregion
//#region src/errors/download.d.ts
interface DownloadErrorOptions {
  message?: string;
  cause?: unknown;
}
declare class DownloadError extends Error {
  code: DownloadError.Code;
  constructor(code: DownloadError.Code, options?: DownloadErrorOptions);
}
declare namespace DownloadError {
  enum Code {
    DownloadFailed = "DOWNLOAD_FAILED",
    ZipExtractionFailed = "ZIP_EXTRACTION_FAILED",
  }
}
//#endregion
export { DownloadError, DownloadOptions, SdkArch, SdkOS, SdkVersion, download, getSdkUrl, getSdkUrls };
//# sourceMappingURL=index.d.mts.map