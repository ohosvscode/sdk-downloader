import type http from 'node:http'
import type { ResolvedDownloadOptions } from './options'
import { Buffer } from 'node:buffer'
import { DownloadError } from './errors/download'

export function makeRequest(resolvedOptions: ResolvedDownloadOptions, startByte?: number): Promise<http.IncomingMessage> {
  return new Promise<http.IncomingMessage>((resolve, reject) => {
    const url = new URL(resolvedOptions.url)

    resolvedOptions.requester.get({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      searchParams: url.searchParams,
      username: url.username,
      password: url.password,
      method: 'GET',
      headers: startByte
        ? {
            Range: `bytes=${startByte}-`,
          }
        : undefined,
    }, (res) => {
      if (res.statusCode === 416 || res.statusCode === 206) {
        resolve(res)
      }
      else if (res.statusCode !== 200) {
        reject(new DownloadError(DownloadError.Code.DownloadFailed, { cause: res.statusCode }))
      }
      else {
        resolve(res)
      }
    }).on('error', err => reject(err))
  })
}

export function makeSha256Request(url: string, resolvedOptions: ResolvedDownloadOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = new URL(resolvedOptions.url)

    resolvedOptions.requester.get({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}.sha256`,
      searchParams: url.searchParams,
      username: url.username,
      password: url.password,
      method: 'GET',
    }, (res) => {
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
