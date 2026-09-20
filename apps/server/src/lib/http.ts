import type { Context } from 'hono'
import type { ZodType } from 'zod'
import type { ApiError } from '@mimir/shared'

/**
 * 统一的产品级错误。抛它会被 app.onError 转成一致的 JSON 外壳，
 * 前端只需处理一种错误形状。
 */
export class HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 500,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export function errorBody(error: HttpError): ApiError {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  }
}

type ParseTarget = 'json' | 'query'

/**
 * 校验输入。不使用第三方的 hono validator 中间件——少一个依赖，
 * 而且这里能一次把「解析失败」和「业务错误」统一到同一种响应里。
 */
export async function parseInput<T>(
  c: Context,
  target: ParseTarget,
  schema: ZodType<T>,
): Promise<T> {
  const raw = target === 'json' ? await c.req.json().catch(() => ({})) : c.req.query()
  const result = schema.safeParse(raw)

  if (!result.success) {
    throw new HttpError(
      400,
      'INVALID_INPUT',
      '请求参数不合法',
      result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    )
  }

  return result.data
}
