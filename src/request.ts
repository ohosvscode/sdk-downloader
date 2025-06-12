import type http from 'node:http'
import type { ResolvedDownloadOptions } from './options'
import { Buffer } from 'node:buffer'
import { DownloadError } from './errors/download'

export function makeRequest(resolvedOptions: ResolvedDownloadOptions, startByte?: number, extraOptions?: http.RequestOptions): Promise<http.IncomingMessage> {
  return new Promise<http.IncomingMessage>((resolve, reject) => {
    resolvedOptions.requester.get(resolvedOptions.url, {
      method: 'GET',
      headers: startByte
        ? {
            Range: `bytes=${startByte}-`,
          }
        : undefined,
      ...extraOptions,
    }, (res) => {
      if (res.statusCode === 416 || res.statusCode === 206) {
        resolve(res)
      }
      else if (res.statusCode !== 200) {
        reject(new DownloadError(DownloadError.Code.DownloadFailed, { cause: res }))
      }
      else {
        resolve(res)
      }
    }).on('error', err => reject(err))
  })
}

export function makeSha256Request(resolvedOptions: ResolvedDownloadOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    resolvedOptions.requester.get(`${resolvedOptions.url}.sha256`, (res) => {
      if (res.statusCode !== 200 && res.statusCode !== 201)
        reject(new DownloadError(DownloadError.Code.DownloadFailed, { cause: res.statusCode }))

      const chunks: Buffer[] = []
      res.on('data', (chunk) => {
        chunks.push(chunk)
      })
      res.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf-8'))
      })
    })
  })
}
