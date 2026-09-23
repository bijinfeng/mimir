import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { detectSource } from '@mimir/shared'
import { assemble } from '../plugins/host.js'
import { env } from '../env.js'
import { getAuthCookie, makeClient } from './helpers.js'

/**
 * 注册表与设置页的一致性断言。
 *
 * ## 这一条防的正是这次重构的起因
 *
 * 改动之前，设置页的插件清单是**前端手写的数组**，与 `plugins/leg/index.ts`
 * 的真实注册表没有连接：加一个通道要改两处，而界面上的「待开发」条目
 * 连文件路径都是手写的（`docs/DECISIONS.md` D-030）。
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
  it('四条接缝都有实现，且 id 不重复（重复会在注册时抛错）', () => {
    const { seams } = assemble()

    expect(seams.leg.implementations().length).toBeGreaterThanOrEqual(2)
    expect(seams.parser.implementations().length).toBeGreaterThanOrEqual(1)
    expect(seams.capturer.implementations().length).toBeGreaterThanOrEqual(3)
    expect(seams.provider.implementations().length).toBeGreaterThanOrEqual(1)
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
      models: unknown[]
      probes: unknown[]
    }>('/api/config')

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.settings)).toBe(true)
    expect(Array.isArray(res.body.plugins)).toBe(true)
    expect(Array.isArray(res.body.models)).toBe(true)

    // 密钥类键的值必须是 null——绝不下发浏览器
    const secrets = res.body.settings.filter((entry) => entry.type === 'secret')
    expect(secrets.length).toBeGreaterThan(0)
    for (const secret of secrets) {
      expect(secret.value).toBeNull()
    }
  })

  it('模型角色状态永远齐全，且不可用时给出原因', async () => {
    const res = await client.get<{
      models: {
        role: string
        label: string
        model: string
        ready: boolean
        reason: string | null
      }[]
    }>('/api/config')

    const roles = res.body.models.map((item) => item.role)
    // 测试环境没有配模型密钥，所以这四个角色都应当存在且带原因
    expect(roles).toEqual(expect.arrayContaining(['chat', 'reasoning', 'summarize', 'embed']))

    // 不写成 if/else + expect（vitest 的条件断言规则会拦）：把不变量直接写出来
    const inconsistent = res.body.models.filter(
      (item) => (item.ready && item.reason !== null) || (!item.ready && !item.reason),
    )
    expect(
      inconsistent.map((item) => `${item.role}: ready=${item.ready} reason=${item.reason}`),
      '就绪状态与原因必须一致（ready 为真则原因为 null，为假则必须有原因）',
    ).toEqual([])
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
   * 这一性质的可执行记录。真正把关的是镜像构建（`docs/TECH.md` §8.4）。
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
