import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { like } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { detectSource } from '@mimir/shared'
import { db } from '../db/client.js'
import { settings } from '../db/schema.js'
import { assemble, resetAssembly } from '../plugins/host.js'
import { env } from '../env.js'
import { getAuthCookie, makeClient } from './helpers.js'

/**
 * 注册表与设置页的一致性断言。
 *
 * ## 这一条防的正是这次重构的起因
 *
 * 改动之前，设置页的插件清单是**前端手写的数组**，与 `plugins/leg/index.ts`
 * 的真实注册表没有连接：加一个通道要改两处，而界面上的「待开发」条目
 * 连文件路径都是手写的（`.trellis/spec/project/decisions.md` D-030）。
 *
 * 所以这里断言的是三件「两处各说各话」会立刻暴露的事：
 *
 *   1. 描述符里写的文件路径**真实存在**
 *   2. `leg` 的描述符 id 集合与注册表的实现 id 集合一致
 *   3. 抓取来源识别（`shared` 的 `detectSource`）与注册的抓取器不漂移
 *
 * 第 3 条尤其重要：它保证「界面说这是 GitHub」与「实际走了 GitHub 抓取」
 * 永远是同一件事。
 */

let client: ReturnType<typeof makeClient>

beforeAll(async () => {
  client = makeClient(await getAuthCookie())
})

const repoRoot = resolve(env.repoRoot)

describe('插件注册表', () => {
  it('五条接缝都有实现，且 id 不重复（重复会在注册时抛错）', () => {
    const { seams } = assemble()

    expect(seams.leg.implementations().length).toBeGreaterThanOrEqual(2)
    expect(seams.parser.implementations().length).toBeGreaterThanOrEqual(1)
    expect(seams.capturer.implementations().length).toBeGreaterThanOrEqual(3)
    expect(seams.provider.implementations().length).toBeGreaterThanOrEqual(1)
    // 存储一注册就有两个：本地与 S3。**「复数实现」正是这条接缝存在的理由**，
    // 只有本地一个时它本来就不该被抽出来（D-031 的判据）
    expect(seams.storage.implementations().length).toBeGreaterThanOrEqual(2)
  })

  /**
   * 存储接缝与另外四条有一处本质不同：**它是单数的**。
   *
   * 未被选中的那个后端不能显示成「可用」——那会让设置页说
   * 「两个存储后端都可用」，而实际只有一个是真相（`.trellis/spec/project/research.md` §10.6）。
   * 这条断言守的是 `unavailable(read)` 真的读到了 `storage.backend`：
   * 如果哪天有人把 read 参数去掉、退回只用 `isProvided`，这里会红。
   *
   * ## 断言里体现了 `computeStatus` 的判定顺序
   *
   * `requires` 先于 `unavailable`。所以测试环境里没配 S3 时它报
   * `needs-config`（缺桶名与凭据），而不是 `unavailable`（未选中）——
   * **这是对的**：用户此刻要做的事是「填配置」，不是「切换后端」。
   * 只有配齐之后，`unavailable` 那层才有机会说话。
   */
  it('只有一个存储后端是「可用」，其余如实报告原因', async () => {
    const { descriptors } = assemble()
    const plugins = await descriptors()

    const storage = plugins.filter((plugin) => plugin.seam === 'storage')
    expect(storage.length).toBeGreaterThanOrEqual(2)

    const active = storage.filter((plugin) => plugin.status.kind === 'active')
    expect(
      active.map((plugin) => plugin.id),
      '存储后端必须恰好有一个处于可用状态（当前选中的那个）',
    ).toHaveLength(1)

    /**
     * 未选中的那些必须给出**一个说得通的原因**，且不能也是 active。
     *
     * 两种合法原因：
     *  - `needs-config`：缺配置（`requires` 先判定，见上）
     *  - `unavailable`：配齐了但没选中，理由里会说「当前未选中（正在用 X）」
     *
     * 不合法的是 `active`（上面已断言）与 `planned`（两个实现都在代码里）。
     *
     * 理由**非空**也要断言：一个空字符串的 reason 在界面上会渲染成
     * 一条没有内容的提示，看起来像渲染坏了。
     */
    const others = storage.filter((plugin) => plugin.id !== active[0]?.id)
    const shape = others.map((plugin) => ({
      id: plugin.id,
      kind: plugin.status.kind,
      // 两种状态都带 reason，其余没有。统一取出来比较，避免条件断言
      reason:
        plugin.status.kind === 'needs-config' || plugin.status.kind === 'unavailable'
          ? plugin.status.reason
          : '',
    }))

    expect(
      shape.map((item) => item.kind),
      '未选中的后端只能是 needs-config 或 unavailable（不能也是 active）',
    ).toEqual(['needs-config'])

    /**
     * 缺配置时必须**点名是哪一个**，而不是只说「需要配置」。
     *
     * 但断言的是**界面上的标签**（「桶名」），不是键名（`storage.s3.bucket`）：
     * 用户看到的表单里写的是前者。说键名等于让他自己去做一次映射——
     * 而这条断言的意图本来就是「用户能不能照着去填」。
     */
    const reason = shape[0]?.reason ?? ''
    expect(reason, '缺配置的理由要说清缺几项').toContain('还差')
    expect(reason, '要点出用户能对上的字段名').toContain('桶名')
    expect(reason, '不该把内部键名念给用户听').not.toContain('storage.s3.')
  })

  it('默认选中本地后端（新部署与测试环境都是它）', async () => {
    const { descriptors } = assemble()
    const plugins = await descriptors()

    const active = plugins.find(
      (plugin) => plugin.seam === 'storage' && plugin.status.kind === 'active',
    )
    expect(active?.id).toBe('local')
  })

  /**
   * **这条是「未选中」那个新状态的直接断言**，也是这次改动给契约
   * 加 `read` 参数的全部理由（`.trellis/spec/project/research.md` §10.6）。
   *
   * 把 S3 配齐（但 `storage.backend` 仍是 local），它必须显示
   * 「当前未选中（正在用 local）」而不是「可用」——否则设置页会同时
   * 显示两个可用后端，而其中只有一个在真正承接写入。
   *
   * 为什么要写这个测试：`isProvided` 判据在这里会给出**错误答案**
   * （三个键都配了 → 认为它可用）。回退到只用 `isProvided` 的实现
   * 会让这条红，而那正是要拦住的退化。
   */
  it('配齐但未选中的后端报「当前未选中」，不是「可用」', async () => {
    // 用一个新的 client 而不是外层的那个：这条测试会改设置并重置装配，
    // 复用同一个 client 会让两者纠缠
    const storageClient = makeClient(await getAuthCookie())

    const configured = await storageClient.patch('/api/config/settings', {
      values: {
        'storage.s3.bucket': 'test-bucket',
        'storage.s3.accessKeyId': 'AKIATEST',
        'storage.s3.secretAccessKey': 'secret-for-test-only',
      },
    })
    expect(configured.status).toBe(200)

    // 设置改了要丢掉装配缓存，否则 descriptors 读的还是上一次的快照
    resetAssembly()

    try {
      const { descriptors } = assemble()
      const plugins = await descriptors()

      const s3 = plugins.find((plugin) => plugin.seam === 'storage' && plugin.id === 's3')
      expect(s3, 's3 描述符必须存在').toBeDefined()

      // 三个键都配齐了，所以这里**不该**出现 needs-config
      expect(s3?.status.kind, '三个键都配齐了，所以不该是 needs-config；它必须报「未选中」').toBe(
        'unavailable',
      )

      /**
       * 理由从状态里取出来单独断言，而不是写成 `if (kind === 'unavailable')`。
       * 那个写法会被 vitest 的 `no-conditional-expect` 拦下——而它拦得对：
       * 条件断言在 kind 不是 unavailable 时会**静默跳过**，
       * 于是这条测试在最该失败的时候反而是绿的。
       */
      const reason = s3?.status.kind === 'unavailable' ? s3.status.reason : ''
      /**
       * 理由是**「正在用谁」这个新信息**。
       *
       * 第一版写的是「当前未选中（正在用 local）」，而那一行的徽标
       * 已经写着「未选中」——前半句是在复述旁边看得见的东西。
       * 所以现在只说后半句，而断言守的是它必须说出来：
       * 不知道「现在用的是谁」，用户就无法判断该不该切。
       */
      expect(reason, '要说出当前实际在用哪个后端').toContain('local')
      expect(reason, '不该复述旁边徽标已写的「未选中」').not.toContain('未选中')

      // 而 local 仍然可用（它就是被选中的那个）
      const local = plugins.find((plugin) => plugin.seam === 'storage' && plugin.id === 'local')
      expect(local?.status.kind).toBe('active')
    } finally {
      // 清理：删掉覆盖行，回落到默认（不这么做会污染后面的测试）
      await db.delete(settings).where(like(settings.key, 'storage.s3.%'))
      resetAssembly()
    }
  })

  it('描述符里的 file 路径在仓库里真实存在', async () => {
    const { descriptors } = assemble()
    const plugins = await descriptors()

    const missing = plugins
      .map((plugin) => plugin.file)
      // 「规划中」的条目允许写占位符——那些文件本来就还没建
      .filter((file) => file !== '—' && !file.startsWith('（'))
      .filter((file) => !existsSync(resolve(repoRoot, file)))

    // 报出具体是哪个文件，而不是只说「有不存在的路径」
    expect(missing, `这些描述符指向了不存在的文件：${missing.join('、')}`).toEqual([])
  })

  it('leg 的描述符 id 与注册的通道 id 一一对应', async () => {
    const { seams, descriptors } = assemble()
    const plugins = await descriptors()

    const declared = plugins
      .filter((plugin) => plugin.seam === 'leg')
      .map((plugin) => plugin.id)
      .toSorted()
    const registered = seams.leg
      .implementations()
      .map(({ declaration }) => declaration.id)
      .toSorted()

    expect(declared).toEqual(registered)
  })

  it('每个实现声明的 configKeys 都在键表里注册过', async () => {
    const { descriptors } = assemble()
    const plugins = await descriptors()

    // 请求一次 /api/config 拿到键表（它是设置页的唯一数据源）
    const res = await client.get<{ settings: { key: string }[] }>('/api/config')
    expect(res.status).toBe(200)
    const known = new Set(res.body.settings.map((entry) => entry.key))

    const unknown = plugins.flatMap((plugin) =>
      plugin.configKeys.filter((key) => !known.has(key)).map((key) => `${plugin.id} → ${key}`),
    )

    expect(unknown, `这些 configKeys 没有对应的键定义：${unknown.join('、')}`).toEqual([])
  })
})

describe('抓取来源识别（两处必须一致）', () => {
  it('shared 的 detectSource 与注册的抓取器判定相同', async () => {
    const { seams } = assemble()
    const cases = [
      'https://mp.weixin.qq.com/s/abc',
      'https://github.com/TanStack/ai',
      'https://example.dev/post',
    ]

    for (const url of cases) {
      const sharedKind = detectSource(url)?.kind
      const registered = seams.capturer.implementations().find(({ impl }) => impl.matches(url))
        ?.declaration.id

      // 界面边打边显示用 shared 那份，服务端抓取用注册表那份。
      // 两者不同 = 用户看到「GitHub」却走了网页抓取
      expect(sharedKind, `${url} 的判定不一致`).toBe(registered)
    }
  })

  it('/api/capture/detect 也走同一套判定', async () => {
    const res = await client.get<{ source: { kind: string; label: string; note: string } | null }>(
      `/api/capture/detect?url=${encodeURIComponent('https://github.com/TanStack/ai')}`,
    )

    expect(res.status).toBe(200)
    expect(res.body.source?.kind).toBe('github')
    // label 与 note 来自描述符——它们不再是写死的文案
    expect(res.body.source?.label).toBe('GitHub 仓库')
    expect(res.body.source?.note.length).toBeGreaterThan(0)
  })

  it('非法链接返回 null 而不是抛错', async () => {
    const res = await client.get<{ source: unknown }>('/api/capture/detect?url=not-a-url')
    expect(res.status).toBe(200)
    expect(res.body.source).toBeNull()
  })
})

describe('/api/config 的形状', () => {
  it('回三块：settings / plugins / models，且密钥不下发', async () => {
    const res = await client.get<{
      settings: { key: string; type: string; value: unknown }[]
      plugins: unknown[]
      modelConfig: { roles: unknown[] }
      probes: unknown[]
    }>('/api/config')

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.settings)).toBe(true)
    expect(Array.isArray(res.body.plugins)).toBe(true)
    expect(Array.isArray(res.body.modelConfig.roles)).toBe(true)

    // 密钥类键的值必须是 null——绝不下发浏览器
    const secrets = res.body.settings.filter((entry) => entry.type === 'secret')
    expect(secrets.length).toBeGreaterThan(0)
    for (const secret of secrets) {
      expect(secret.value).toBeNull()
    }
  })

  /**
   * S3 的 Secret Access Key 是**结构化配置之外的密钥**，容易漏掉。
   *
   * 它走的是 `secret` 类型（不是 json 里的字段），所以上面那条通用断言
   * 已经覆盖它。这里再点名一次是因为它是这次改动新增的密钥，
   * 而「新增一个密钥」正是最容易忘掉下半句（下沉前剔除）的时刻。
   */
  it('存储密钥不下发浏览器', async () => {
    const res = await client.get<{
      settings: { key: string; type: string; value: unknown }[]
    }>('/api/config')

    const secret = res.body.settings.find((entry) => entry.key === 'storage.s3.secretAccessKey')
    expect(secret, 'storage.s3.secretAccessKey 必须注册进键表').toBeDefined()
    expect(secret?.type).toBe('secret')
    expect(secret?.value).toBeNull()
  })

  it('模型角色状态永远齐全，且不可用时给出原因', async () => {
    const res = await client.get<{
      modelConfig: {
        roles: {
          role: string
          label: string
          model: string
          ready: boolean
          reason: string | null
        }[]
      }
    }>('/api/config')

    const roles = res.body.modelConfig.roles.map((item) => item.role)
    // 测试环境没有配模型密钥，所以这四个角色都应当存在且带原因
    expect(roles).toEqual(expect.arrayContaining(['chat', 'reasoning', 'summarize', 'embed']))

    // 不写成 if/else + expect（vitest 的条件断言规则会拦）：把不变量直接写出来
    const inconsistent = res.body.modelConfig.roles.filter(
      (item) => (item.ready && item.reason !== null) || (!item.ready && !item.reason),
    )
    expect(
      inconsistent.map((item) => `${item.role}: ready=${item.ready} reason=${item.reason}`),
      '就绪状态与原因必须一致（ready 为真则原因为 null，为假则必须有原因）',
    ).toEqual([])
  })

  /**
   * 拉取模型是**纯读**（D-080）：它不写配置，所以创建表单里也能用。
   * 两条不花网络的失败路径把它的边界说清楚——真发请求的部分由
   * 浏览器实测覆盖（假端点那次验证过合并规则与类型提示）。
   */
  it('拉取模型：没有密钥时拒绝，且不改动配置', async () => {
    const before = await client.get<{ modelConfig: { providers: unknown[] } }>('/api/config')

    const res = await client.request<{ error: { message: string } }>('/api/config/fetch-models', {
      method: 'POST',
      body: JSON.stringify({
        providerId: null,
        baseUrl: 'https://example.dev/v1',
        apiKeyDraft: null,
      }),
    })

    expect(res.status).toBe(400)
    expect(res.body.error.message).toContain('密钥')

    const after = await client.get<{ modelConfig: { providers: unknown[] } }>('/api/config')
    expect(after.body.modelConfig.providers).toEqual(before.body.modelConfig.providers)
  })

  it('拉取模型：地址不是 http(s) 时拒绝', async () => {
    const res = await client.request<{ error: { message: string } }>('/api/config/fetch-models', {
      method: 'POST',
      body: JSON.stringify({ providerId: null, baseUrl: 'ftp://nope', apiKeyDraft: 'k' }),
    })

    expect(res.status).toBe(400)
    expect(res.body.error.message).toContain('http')
  })
})

describe('构建配置（防 D-023 那个坑）', () => {
  /**
   * workspace 包以**源码**发布（`exports` 指向 `src/index.ts`），而 Node 不能
   * 执行 node_modules 里的 .ts。所以它们必须被编译进服务端产物。
   *
   * 漏掉的症状是生产容器启动报 `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`，
   * 而**本地开发完全正常**——这个坑在 Docker 构建时才暴露（D-023 记的就是它）。
   *
   * ## 机制变了，这条断言也跟着变
   *
   * 原先的构建（tsdown）需要一份**手写的** `alwaysBundle` 列表，所以那时守的是
   * 「列表有没有漏」——手写的列表一定会漏，而漏了不报错。
   *
   * 现在换成 Vite 的 SSR 构建：它对**链接的 workspace 包默认内联**，
   * 所以这件事从「记得维护一份列表」变成了**结构性质**。这比手写列表可靠，
   * 但并不意味着不用守——把它改成 external 只需要一行配置，而那正是不该有的一行。
   */
  it('构建配置没有把 workspace 包排除在外（那会让生产启动失败）', () => {
    const config = readFileSync(resolve(repoRoot, 'apps/server/vite.config.ts'), 'utf8')

    // 去掉注释再找：注释里出现 `external` 是允许的（本项目的注释密度很高）
    const code = config.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

    // 用数组断言而不是 `expect(bool, '原因')`：本项目的 vitest 规则只允许
    // 单参数 expect（`valid-expect`），而失败时能看懂的信息必须留下——
    // 所以把「哪里不对」写成被断言的值本身
    const externalized = code.match(/external[\s\S]{0,200}@mimir\/[^\s'"]*/g) ?? []

    expect(
      externalized,
      '@mimir/* 被标记为 external 了。它们以源码发布，必须编译进产物，否则生产容器启动会报 ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING',
    ).toEqual([])
  })

  /**
   * 更强的版本：真的去产物里找没编译进来的 workspace import。
   *
   * 只在**已经构建过**时运行（`pnpm check` 不包含构建步骤，而在这里跑一次
   * `vite build` 太慢）。所以它不是把关的那一道，而是「构建过就该是干净的」
   * 这一性质的可执行记录。真正把关的是镜像构建（`.trellis/spec/project/architecture.md` §8.4）。
   */
  it('已构建的产物里没有未编译的 workspace import', () => {
    const distDir = resolve(repoRoot, 'apps/server/dist')
    if (!existsSync(distDir)) return

    const offenders: string[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (entry.name.endsWith('.js')) {
          const text = readFileSync(full, 'utf8')
          for (const match of text.matchAll(/from\s+"(@mimir\/[^"]+)"/g)) {
            offenders.push(`${entry.name} → ${match[1]}`)
          }
        }
      }
    }
    walk(distDir)

    expect(
      offenders,
      `这些产物还在 import 未编译的 workspace 包源码：${offenders.join('、')}`,
    ).toEqual([])
  })
})
