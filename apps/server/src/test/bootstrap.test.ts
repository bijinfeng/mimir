import { describe, expect, it } from 'vitest'
import { decideOwnerAction } from '../services/bootstrap.js'

/**
 * 所有者账号引导的决策逻辑。
 *
 * 这是**纯函数**，所以四条分支可以逐个断言——这很重要，因为其中两条是
 * 破坏性的：
 *
 *  - `create` 会占掉「唯一用户」的名额，之后别人再也注册不进来
 *  - `update-password` 改的是登录凭据，弄错了用户就登不进去了
 *
 * 「邮箱不一致时不动别人的账号」那条尤其容易在手工测试中被走过：
 * 环境碰巧匹配时根本不会进那个分支。
 */
describe('所有者账号引导的决策', () => {
  const base = { ownerEmail: 'me@example.com' }

  it('库空 → 创建', () => {
    expect(decideOwnerAction({ ...base, existingEmail: null, passwordMatches: null })).toEqual({
      kind: 'create',
    })
  })

  it('邮箱一致且密码已匹配 → 什么都不做', () => {
    expect(
      decideOwnerAction({ ...base, existingEmail: 'me@example.com', passwordMatches: true }),
    ).toEqual({ kind: 'noop' })
  })

  it('邮箱一致但密码不同 → 同步密码（这是「忘记密码」的找回路径）', () => {
    expect(
      decideOwnerAction({ ...base, existingEmail: 'me@example.com', passwordMatches: false }),
    ).toEqual({ kind: 'update-password' })
  })

  it('邮箱不一致 → 不动别人的账号', () => {
    // 这条是四条里最要紧的：静默替换掉别人的账号是破坏性的，
    // 而且对方很可能已经在用（他在这个库里存了东西）
    expect(
      decideOwnerAction({
        ...base,
        existingEmail: 'someone-else@example.com',
        passwordMatches: true,
      }),
    ).toEqual({
      kind: 'skip',
      reason: 'email-mismatch',
      existingEmail: 'someone-else@example.com',
    })
  })

  it('账号存在但没有凭据记录 → 补一条密码', () => {
    // 手工往 user 表插过行、或从旧版本迁移过来时会出现这种状态。
    // 不补的话那个账号永远登不进去，而报错只说「密码错误」
    expect(
      decideOwnerAction({ ...base, existingEmail: 'me@example.com', passwordMatches: null }),
    ).toEqual({ kind: 'update-password' })
  })

  it('邮箱不一致时，无论密码是否匹配都不动它', () => {
    // 两种 passwordMatches 取值都必须落到 skip —— 免得有人以为
    // 「密码不匹配就该改」而把别人的账号改掉
    for (const passwordMatches of [true, false, null] as const) {
      expect(
        decideOwnerAction({
          ...base,
          existingEmail: 'someone-else@example.com',
          passwordMatches,
        }).kind,
      ).toBe('skip')
    }
  })
})
