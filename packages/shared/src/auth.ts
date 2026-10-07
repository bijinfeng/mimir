import { z } from 'zod'

/**
 * 登录页需要的**公开**状态。
 *
 * ## 为什么需要它
 *
 * 登录页要区分「首次注册」与「日常登录」两种形态：库里还没有账号时显示注册
 * 表单，已经有账号时只显示登录（注册入口直接隐藏）。
 *
 * 在这之前前端是靠「先尝试登录，401 就改试注册」来猜的，代价很具体：
 * **密码打错时会显示「该邮箱已被使用」，而不是「密码错误」**——因为它把
 * 401 当成「还没有账号」，接着去注册，注册又回「已存在」。两个错误信息叠在
 * 一起，用户完全不知道刚才发生了什么。
 *
 * 由服务端明确告知状态，这个猜测就不需要了；两种形态也才能各自做对
 * （注册要二次确认密码、登录不要）。
 *
 * 这个端点**不需要鉴权**（登录页在登录前就要调它），所以它只能暴露
 * 「有没有账号」这一个布尔值，绝不能暴露任何用户信息。
 */
export const authSetupStateSchema = z.object({
  /** 库里一个账号都没有 —— 登录页应当显示「首次注册」 */
  needsSetup: z.boolean(),
  /**
   * 预填用的凭据，**只在非生产环境**返回（见 services/bootstrap.ts）。
   *
   * 它把密码明文交给一个不需要鉴权的端点，生产环境下等于任何人访问这个
   * 接口就能拿到你的密码——那不是便利，是漏洞。
   * 开发环境里它来自 `.env`（本来就在本地），目的是省掉每次手打密码。
   */
  prefill: z
    .object({
      email: z.string(),
      password: z.string(),
    })
    .nullable(),
  /**
   * 这个宿主是不是运行在**本地模式**（D-100）。
   *
   * 登录页要据此说清一件事：本地模式的凭据是宿主生成、不公开的
   * （桌面壳靠本机令牌直接进入），所以在这里填密码登录**不会成功**。
   * 不告诉用户的话，他看到的只是一个「密码怎么都不对」的表单。
   *
   * 它同样在登录之前就要能读到，所以只能暴露这一个布尔值。
   */
  localMode: z.boolean(),
})
export type AuthSetupState = z.infer<typeof authSetupStateSchema>

/**
 * 首次注册的入参。
 *
 * 刻意**不含 `confirmPassword`**：校验两次输入是否一致是界面的事，
 * 服务端只需要拿到一个密码。把它放进契约会让人以为服务端也在校验，
 * 而它其实没有——那是一种更隐蔽的错。
 */
export const signUpInputSchema = z.object({
  email: z.string().trim().email('请输入有效的邮箱').max(200),
  password: z.string().min(8, '密码至少 8 位').max(200),
  name: z.string().trim().min(1).max(100).optional(),
})
export type SignUpInput = z.infer<typeof signUpInputSchema>
