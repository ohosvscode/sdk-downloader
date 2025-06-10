import type { DownloadOptions } from './options'
import { Downloader } from './core/downloader'

/**
 * Download the ArkTS SDK.
 *
 * @param options - The options for the download.
 */
export async function download(options: DownloadOptions): Promise<void> {
  const downloader = new Downloader(options)
  return downloader.execute()
}
