import { serve, type ServerType } from '@hono/node-server'
import type { Hono } from 'hono'
import type { AppEnv } from '../../types.js'

export interface TcpListener {
  kind: 'tcp'
  host?: string
  port: number
}

export interface ListeningServer {
  server: ServerType
  origin: string
  port: number
}

/** 起一个 TCP listener；port=0 时从回调里读 OS 分配的实际端口。 */
export function listenTcp(app: Hono<AppEnv>, listener: TcpListener): Promise<ListeningServer> {
  return new Promise((resolve, reject) => {
    const hostname = listener.host
    const server = serve(
      { fetch: app.fetch, port: listener.port, ...(hostname ? { hostname } : {}) },
      (info) => {
        server.off('error', reject)
        const host = hostname ?? '127.0.0.1'
        resolve({
          server,
          origin: `http://${host}:${info.port}`,
          port: info.port,
        })
      },
    )
    server.once('error', reject)
  })
}
