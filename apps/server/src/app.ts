import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { auth } from './auth.js'
import { env } from './env.js'
import { errorBody, HttpError } from './lib/http.js'
import { requireAuth } from './middleware/auth.js'
import { captureRoute } from './routes/capture.js'
import { chatRoute, conversationsRoute } from './routes/conversations.js'
import { documentsRoute, foldersRoute, maintenanceRoute, tagsRoute } from './routes/documents.js'
import { exportRoute } from './routes/export.js'
import { mountStatic } from './lib/static.js'
import { searchRoute } from './routes/search.js'
import type { AppEnv } from './types.js'

export function createApp() {
  const app = new Hono<AppEnv>()

  if (env.nodeEnv !== 'test') {
    app.use('*', logger())
  }

  // 开发时前端在 :5173，正式部署由同一个服务提供静态资源，跨源只在开发期存在
  app.use(
    '/api/*',
    cors({
      origin: env.webOrigin,
      credentials: true,
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
    }),
  )

  /** 不需要登录：健康检查 + 认证端点本身 */
  app.get('/healthz', (c) => c.json({ ok: true }))

  app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw))

  /** 以下全部需要登录 */
  const api = new Hono<AppEnv>()
  api.use('*', requireAuth)
  api.route('/documents', documentsRoute)
  api.route('/folders', foldersRoute)
  api.route('/tags', tagsRoute)
  api.route('/search', searchRoute)
  api.route('/conversations', conversationsRoute)
  api.route('/chat', chatRoute)
  api.route('/capture', captureRoute)
  api.route('/export', exportRoute)
  api.route('/maintenance', maintenanceRoute)

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
