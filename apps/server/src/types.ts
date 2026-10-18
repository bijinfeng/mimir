import type { auth } from './auth.js'

/**
 * Hono 的变量类型。把 session/user 放进 context 变量而不是每处重新取，
 * 让下游 handler 拿到的是已经过鉴权的强类型对象。
 */
export interface AppEnv {
  Variables: {
    miniappDevice: import('./services/miniapp-auth.js').MiniappPrincipal
    session: typeof auth.$Infer.Session.session
    user: typeof auth.$Infer.Session.user
  }
}
