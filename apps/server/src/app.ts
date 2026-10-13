import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { auth } from './auth.js'
import { env } from './env.js'
import { errorBody, HttpError } from './lib/http.js'
import { fnosAuthRequest, fnosAuthResponse } from './lib/fnos-gateway.js'
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
import { mountStatic } from './lib/static.js'
import { localSessionPayload, localTokenMatches } from './services/local-mode.js'
import { searchRoute } from './routes/search.js'
import { statsRoute } from './routes/stats.js'
import type { AppEnv } from './types.js'

async function handleAuth(request: Request): Promise<Response> {
  if (!env.fnosSocket) return auth.handler(request)
  const gatewayRequest = fnosAuthRequest(request)
  if (!gatewayRequest) return new Response('Invalid origin', { status: 403 })
  return fnosAuthResponse(await auth.handler(gatewayRequest), gatewayRequest)
}

export function createApp() {
  const app = new Hono<AppEnv>()

  if (env.nodeEnv !== 'test') {
    app.use('*', logger())
  }

  // 开发时前端在 :5173，正式部署由同一个服务提供静态资源，跨源只在开发期存在
  if (!env.fnosSocket) {
    app.use(
      '/api/*',
      cors({
        origin: env.webOrigin,
        credentials: true,
        allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type'],
        // 原件的 Range 请求要能读到这几个响应头，否则前端拿不到长度与类型
        exposeHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges', 'Content-Disposition'],
      }),
    )
  }

  /** 不需要登录：健康检查 + 认证端点本身 */
  app.get('/healthz', (c) => c.json({ ok: true }))

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

  // 只在生产模式下由同一个进程提供前端。
  // 显式判断 NODE_ENV 而不是「dist 目录存不存在」——后者会让测试的行为
  // 取决于本地是否跑过构建，属于隐藏依赖。
  if (env.nodeEnv === 'production') {
    if (mountStatic(app)) {
      console.log('已挂载前端静态资源')
    } else {
      console.warn('未找到前端构建产物（apps/web/dist），只提供 API')
    }
  }

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
          message: env.nodeEnv === 'production' ? '服务端错误' : String(error),
        },
      },
      500,
    )
  })

  return app
}

export type AppType = ReturnType<typeof createApp>
