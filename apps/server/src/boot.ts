import { recoverChatAttachments, collectChatAttachments } from './services/chat-attachments.js'
import { createApp, type CreateAppOptions } from './app.js'
import { config } from './config.js'
import { ensureServerRuntime } from './server-runtime.js'
import { runMigrations } from './db/migrate.js'
import { ensureOwnerAccount, hasAnyUser } from './services/bootstrap.js'
import { seedDefaultLibrary } from './services/seed.js'
import { recoverMiniappOperations } from './services/miniapp-operations.js'

/**
 * 启动前的准备 + 路由装配。**两个入口共用这一份**：
 *
 *   src/index.ts  生产入口。起 `@hono/node-server`，自己监听端口
 *   src/dev.ts    开发入口。Vite 的 dev-server 插件自己监听端口，
 *                 它只要一个带 `fetch` 的应用
 *
 * 两处准备的顺序不能变：
 *
 *  1. 配置错误要在**启动早期**暴露，而不是运行到一半才发现。只配了
 *     OWNER_EMAIL 没配 OWNER_PASSWORD 是典型的一种——静默忽略一半会让人查很久
 *  2. **库要先于账号存在**：SQLite 路径在这里自动应用迁移（幂等，journal
 *     记账，重跑是空操作）——新克隆环境 `pnpm dev` 直接可用，桌面端将来
 *     也依赖这一行为。Postgres 路径保持手动 `pnpm db:migrate`（生产习惯，
 *     迁移节奏由部署方控制），库没建好时下面的建号会失败并被捕获告警
 *  3. 所有者账号要在**能接受请求之前**建好。反过来会有一个短暂窗口：服务
 *     已经在收请求，但账号还没建好——此时登录会得到「密码错误」，
 *     而它其实是「马上就好」。窗口只有几十毫秒，表现却是随机的登录失败
 *
 * 4. 默认内容（知识库 + 产品说明）在**账号之后**补齐：它的另一个入口是
 *    建号钩子（`auth.ts`），那条路只对新建的账号有效——本次改动之前
 *    就建过号的实例要靠这里（见 `ensureDefaultContent`）
 */
export async function boot(options: CreateAppOptions = {}) {
  ensureServerRuntime()
  if (config.database.kind === 'sqlite') {
    await runMigrations(config.migrations)
  }
  const owner = await ensureOwnerAccount({ failClosed: Boolean(config.auth.failClosedOwner) })
  if (config.auth.failClosedOwner && owner.skipped) {
    throw new Error('fnOS 所有者账号与数据库中已有账号不一致，拒绝启动')
  }
  await ensureDefaultContent()
  if (config.miniappEnabled) await recoverMiniappOperations()

  await recoverChatAttachments()
  if (config.nodeEnv !== 'test') {
    const timer = setInterval(() => {
      void collectChatAttachments().catch((error) => console.warn('会话附件清理失败', error))
    }, 60_000)
    timer.unref()
  }
  return createApp(options)
}

/**
 * 已有实例的默认内容补齐。
 *
 * `seedDefaultLibrary` 的另一个入口是建号钩子（`auth.ts`），它只对
 * **新建的账号**有效——本次改动之前就建过号的实例不会再经过那个钩子，
 * 于是永远看不到默认知识库。这里补上那一条路。
 *
 * 三道闸门让它在各种环境下都不会做错事：
 *
 *  1. **没有账号就不播**——播种是给「已经能用这个产品的人」看的；
 *     全新部署在主人注册之前不该在数据目录里长出内容
 *     （那条路由建号钩子在注册瞬间完成）
 *  2. **已播过就不播**——`seed.defaultContent` 标记，在 `seed.ts` 里查。
 *     这条是「用户删掉了默认知识库，重启后它不该回来」的落点
 *  3. **失败不阻断启动**——默认内容是附赠，服务起不来才是事故
 *     （与 `ensureOwnerAccount` 的失败处理同一条规矩）
 */
async function ensureDefaultContent(): Promise<void> {
  // 测试环境跳过：集成测试有自己的账号与库准备流程，而它们到处是
  // 「库里有几篇文档」这类断言——自动多出两行会让它们以难以定位的方式失败
  // （与 `ensureOwnerAccount` 跳过测试同一条理由）
  if (config.nodeEnv === 'test') return

  try {
    if (!(await hasAnyUser())) return
    const result = await seedDefaultLibrary()
    if (result.libraryCreated || result.documentCreated) {
      console.log(
        `[seed] 已为已有实例补齐默认内容（库：${result.libraryCreated}，说明：${result.documentCreated}）`,
      )
    }
  } catch (error) {
    console.warn('[seed] 默认内容补齐失败（不影响启动与使用）：', error)
  }
}
