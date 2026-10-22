import { createAdaptorServer, type ServerType } from '@hono/node-server'

export interface UnixListener {
  kind: 'unix'
  path: string
}

export interface UnixListeningServer {
  server: ServerType
  origin: string
}

/**
 * 私有的 Unix Socket 网关（fnOS）。core 只拿到一个 fetch 函数，不知道 socket。
 *
 * 失效 socket 的清理由宿主（fnOS 的 `cmd/main`）负责；这里只负责 listen，
 * 遇到 EADDRINUSE 明确报错，不删除活动 socket。
 */
export function listenUnix(
  fetch: (request: Request) => Response | Promise<Response>,
  listener: UnixListener,
): Promise<UnixListeningServer> {
  return new Promise((resolve, reject) => {
    const server = createAdaptorServer({ fetch })
    server.once('error', reject)
    server.listen(listener.path, () => {
      server.off('error', reject)
      resolve({ server, origin: 'http://localhost' })
    })
  })
}
