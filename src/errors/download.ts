export interface DownloadErrorOptions {
  message?: string
  cause?: unknown
}

export class DownloadError extends Error {
  constructor(public code: DownloadError.Code, options?: DownloadErrorOptions) {
    super(options?.message)
    this.cause = options?.cause
  }
}

export namespace DownloadError {
  export enum Code {
    DownloadFailed = 'DOWNLOAD_FAILED',
    ZipExtractionFailed = 'ZIP_EXTRACTION_FAILED',
  }
}
