import { z } from 'zod'

/**
 * 本地模式专有端点（D-100）。
 *
 * ## 为什么名称要单开一个端点，不复用 better-auth 的 update-user
 *
 * 本地模式没有凭据——桌面壳靠宿主注入的本机令牌直接进入，better-auth 的
 * `update-user` 要求一个真实会话，那条路径在本地模式下**必然失败**。
 * 与其在服务端拦截并重写 better-auth 的端点（等于把它的字段白名单与校验
 * 复刻一遍，漂移了还看不出来），不如把「本机用户的资料」做成一个名字
 * 诚实、语义单一的专有端点。
 *
 * 它只在 `MIMIR_LOCAL_MODE=1` 时可用；其他部署下返回 404 —— 不是 403：
 * 「这个部署里没有这个能力」比「你有权限问题」更准确。
 */

/**
 * 更新本机用户资料。
 *
 * 只收 `name`：头像走既有 `/api/avatar`（它读的是上下文里的 user，
 * 与模式无关），邮箱在本地模式里没有意义（没有登录，也就没有找回路径）。
 *
 * 长度上限与界面输入框的 `maxLength` 一致：两处不一致时，用户会先看到
 * 「输入框允许但服务端拒绝」这种自相矛盾的反馈。
 */
export const localProfileInputSchema = z.object({
  name: z.string().trim().min(1, '名称不能为空').max(60, '名称最多 60 个字符'),
})
export type LocalProfileInput = z.infer<typeof localProfileInputSchema>
