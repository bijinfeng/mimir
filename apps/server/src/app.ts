import { chatAttachmentsRoute } from './routes/chat-attachments.js'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { getAuth } from './auth.js'
import { config } from './config.js'
import { ensureServerRuntime } from './server-runtime.js'
import { errorBody, HttpError } from './lib/http.js'
import { requireAuth } from './middleware/auth.js'
import { captureRoute } from './routes/capture.js'
import { avatarRoute } from './routes/avatar.js'
import { configRoute } from './routes/config.js'
import { chatRoute, conversationsRoute } from './routes/conversations.js'
import {
  aiTextRoute,
  documentsRoute,
  foldersRoute,
  maintenanceRoute,
  tagsRoute,
} from './routes/documents.js'
import { filesRoute } from './routes/files.js'
import { exportRoute } from './routes/export.js'
import { feedsRoute } from './routes/feeds.js'
import { localRoute } from './routes/local.js'
import { authRoute } from './routes/auth.js'
import { setupRoute } from './routes/setup.js'
import { localSessionPayload, localTokenMatches } from './services/local-mode.js'
import { searchRoute } from './routes/search.js'
import { miniappRoute } from './routes/miniapp.js'
import { statsRoute } from './routes/stats.js'
import type { AppEnv } from './types.js'

async function handleAuth(request: Request): Promise<Response> {
  // fnOS 的网关适配在 runtime 层完成；core 始终直接交给 Better Auth
  return getAuth().handler(request)
}

export interface CreateAppOptions {
  /**
   * runtime 提供的静态中间件。core 不 import static.ts、不知道 WEB_DIST，
   * 也不知道部署在根路径还是 /app/mimir。
   */
  staticMiddleware?: (app: Hono<AppEnv>) => void
  /** 仅开发期跨源需要；fnOS 同源网关不传 */
  corsOrigin?: string
}

export function createApp(options: CreateAppOptions = {}) {
  // 配置已在 configureServer 中完成；这里兜底创建 DB/auth，供测试/脚本直接 createApp()
  ensureServerRuntime()

  const app = new Hono<AppEnv>()

  if (config.nodeEnv !== 'test') {
    app.use('*', logger())
  }

  // 静态资源必须在 API 路由之前挂载；中间件内部对 /api 与 /healthz 放行
  options.staticMiddleware?.(app)

  // 开发时前端在 :5173，正式部署由同一个服务提供静态资源，跨源只在开发期存在
  if (options.corsOrigin) {
    app.use(
      '/api/*',
      cors({
        origin: options.corsOrigin,
        credentials: true,
        allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type'],
        // 原件的 Range 请求要能读到这几个响应头，否则前端拿不到长度与类型
        exposeHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges', 'Content-Disposition'],
      }),
    )
  }

  /** 不需要登录：健康检查 + 认证端点本身 */
  app.get('/healthz', (c) =>
    c.json({
      ok: true,
      version: config.product.version,
      protocolVersion: config.product.protocolVersion,
    }),
  )

  /**
   * 登录页的公开状态（库里有没有账号）。
   *
   * **必须注册在下面那条 `auth.handler` 的通配之前。** Hono 按注册顺序匹配，
   * 而 `/api/auth/*` 会吞掉它后面所有同前缀的路径——反过来写的话这个端点
   * 会被 Better Auth 的 handler 接走并返回 404（实测踩过）。
   *
   * 同时它也必须在鉴权中间件之前——登录页在登录前就要调它。
   * 路径挂在 /api/auth 下而不是 /api/setup：它讲的是「认证如何初始化」，
   * 与认证端点归在一起比单开一个顶层名字更自然。
   */
  app.route('/api/auth/setup', setupRoute)

  /**
   * 自定义认证端点（用户名或邮箱登录）。
   * 同样必须在通配 `auth.handler` 之前注册——否则会被它吞掉。
   */
  app.route('/api/auth', authRoute)

  /**
   * 本地模式的会话读取（D-100）。
   *
   * `get-session` 必须**先于**通配的 `auth.handler` 注册，否则会被它接走
   * （与 setupRoute 同一条坑：Hono 按注册顺序匹配）。带本机令牌时直接返回
   * 合成会话，前端因此不需要为本地模式改一行鉴权代码；不带令牌（或不是
   * 本地模式）时原样落回 better-auth，浏览器里的密码登录一行没变。
   */
  app.get('/api/auth/get-session', async (c) => {
    if (localTokenMatches(c.req.header('cookie'))) {
      const payload = await localSessionPayload()
      if (payload) return c.json(payload)
    }
    return handleAuth(c.req.raw)
  })

  // 通配放最后：它会接走 /api/auth/ 下的其余一切
  app.on(['GET', 'POST'], '/api/auth/*', (c) => handleAuth(c.req.raw))

  app.route('/api/miniapp', miniappRoute)

  /** 以下全部需要登录 */
  const api = new Hono<AppEnv>()
  api.use('*', requireAuth)
  api.route('/documents', documentsRoute)
  // 与原件的路由同一前缀：原件是文档的一部分，不是另一类资源
  api.route('/documents', filesRoute)
  api.route('/folders', foldersRoute)
  api.route('/tags', tagsRoute)
  api.route('/search', searchRoute)
  // 内联改写：文本可能还没保存，所以不挂在某篇文档下（M1-D）
  api.route('/ai', aiTextRoute)
  api.route('/conversations', chatAttachmentsRoute)
  api.route('/conversations', conversationsRoute)
  api.route('/chat', chatRoute)
  api.route('/capture', captureRoute)
  // RSS / Atom 订阅（M1-E）：订阅关系是一类资源，收进来的文章仍在 documents
  api.route('/feeds', feedsRoute)
  api.route('/export', exportRoute)
  api.route('/maintenance', maintenanceRoute)
  api.route('/config', configRoute)
  api.route('/stats', statsRoute)
  api.route('/avatar', avatarRoute)
  // 本地模式专有端点（D-100）。非本地模式下它自己也回 404——
  // 注册与否都行，这里只注册一次，能力判断留在路由里
  api.route('/local', localRoute)

  app.route('/api', api)

  // notFound 只应该命中 /api 下的路径——其他路径要么被静态中间件接走，
  // 要么在开发模式下由 Vite 处理
  app.notFound((c) =>
    c.req.path.startsWith('/api')
      ? c.json({ error: { code: 'NOT_FOUND', message: '接口不存在' } }, 404)
      : c.text('前端资源未构建。开发时请访问 Vite 的 5173 端口。', 404),
  )

  app.onError((error, c) => {
    if (error instanceof HttpError) {
      return c.json(errorBody(error), error.status)
    }

    console.error('未处理的服务端错误：', error)
    return c.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: config.nodeEnv === 'production' ? '服务端错误' : String(error),
        },
      },
      500,
    )
  })

  return app
}

export type AppType = ReturnType<typeof createApp>
