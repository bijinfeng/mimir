import type {
  PluginDatabase,
  PluginDeclaration,
  PluginDescriptor,
  PluginSeam,
  PluginSettings,
  PluginStatus,
  DeclarationReader,
  RetrievalLeg,
  Capturer,
  Parser,
  ModelProvider,
  StorageBackend,
} from '@mimir/shared'
/**
 * 接缝注册表。**核心保持精简的结构基础**：
 *
 * 宿主的代码只会写三种操作——`register`（插件自注册）、
 * `implementations()`（编排时遍历）、`descriptors()`（设置页展示）。
 * 它不认识任何具体实现的内部，所以「加一个实现」永远是加一个文件 + 注册，
 * 而不是回来改核心。
 *
 * 形状定义在 shared（契约只有一个真相来源），这里给的是实现。
 * 两副面孔与「规划中」的语义见 `packages/shared/src/plugin.ts`。
 */
import type { Registry, RegisteredPlugin } from '@mimir/shared'

export type { Registry, RegisteredPlugin }

/**
 * 算出显示用的状态。**规则只有这一份**，各实现不自己编字符串
 * （`.trellis/spec/project/architecture.md` §7.4）：实现只声明「我依赖哪些键」、「我还有什么别的原因不能干活」。
 *
 * 这个函数刻意是**同步且廉价**的：它在 `/api/config` 每次被请求时对每条接缝
 * 跑一遍。真实探测（发一次模型调用、写一个探针对象）不在这里——那必须是
 * 用户显式触发的动作（`.trellis/spec/project/architecture.md` §7.8）。
 *
 * ## `read` 为什么是必需的参数而不是可省略的
 *
 * 它是给 `unavailable(read)` 用的：只靠 `isProvided` 回答不了
 * 「当前选中了哪个后端」。存储接缝一注册就有两个实现、而只有一个在干活，
 * 没有它设置页会把两个都显示成「可用」（`.trellis/spec/project/research.md` §10.6）。
 */
export function computeStatus(
  declaration: PluginDeclaration,
  impl: unknown,
  isProvided: (key: string) => boolean,
  read: DeclarationReader,
): PluginStatus {
  if (impl === null) {
    return { kind: 'planned', note: declaration.description }
  }

  const missing = (declaration.requires ?? []).filter((key) => !isProvided(key))
  if (missing.length > 0) {
    /**
     * **点名缺哪几项，但说标签而不是键名。**
     *
     * 必须点名：只说「需要配置」的话，用户不知道该填哪个框
     * （`plugins.test.ts` 有一条断言守着这条）。
     *
     * 但不能说键名：`storage.s3.bucket` 与界面上的「桶名」对不上，
     * 用户得自己猜是哪一个。`params` 里有每个键的 label，把键名映射过去，
     * 界面上说什么这里就说什么。查不到 label 的（插件没在 params 里声明它）
     * 退回键名——那种情况下键名是唯一能给的线索。
     */
    const labels = new Map((declaration.params ?? []).map((spec) => [spec.key, spec.label]))
    const names = missing.map((key) => labels.get(key) ?? key)
    return {
      kind: 'needs-config',
      reason: `还差：${names.join('、')}`,
    }
  }

  const blocked = declaration.unavailable?.(read)
  if (blocked) return { kind: 'unavailable', reason: blocked }

  return { kind: 'active' }
}

export function createRegistry<TImpl>(seam: PluginSeam): Registry<TImpl> {
  const entries: RegisteredPlugin<TImpl>[] = []
  const planned: PluginDeclaration[] = []

  return {
    register(declaration, impl) {
      if (declaration.seam !== seam) {
        throw new Error(`插件 ${declaration.id} 声明为 ${declaration.seam}，却注册进了 ${seam}`)
      }
      // 重复 id 直接报错而不是覆盖：覆盖会让「我明明改了插件」变成查不出的问题，
      // 而它在启动时就该暴露
      if (entries.some((entry) => entry.declaration.id === declaration.id)) {
        throw new Error(`插件 id 重复：${seam}/${declaration.id}`)
      }
      entries.push({ declaration, impl })
    },

    plan(declaration) {
      if (declaration.seam !== seam) {
        throw new Error(`插件 ${declaration.id} 声明为 ${declaration.seam}，却注册进了 ${seam}`)
      }
      planned.push(declaration)
    },

    implementations: () => entries,
    find: (id) => entries.find((entry) => entry.declaration.id === id),

    descriptors(isProvided, read) {
      return [
        ...entries.map((entry) => toDescriptor(entry.declaration, entry.impl, isProvided, read)),
        ...planned.map((declaration) => toDescriptor(declaration, null, isProvided, read)),
      ]
    },
  }
}

function toDescriptor(
  declaration: PluginDeclaration,
  impl: unknown,
  isProvided: (key: string) => boolean,
  read: DeclarationReader,
): PluginDescriptor {
  return {
    seam: declaration.seam,
    id: declaration.id,
    name: declaration.name,
    description: declaration.description,
    file: declaration.file,
    configKeys: [...declaration.configKeys],
    status: computeStatus(declaration, impl, isProvided, read),
  }
}

/**
 * 五条接缝的容器。宿主建一个它，把五条注册表交给插件注册。
 *
 * ## 类型是**具体的运行接口**，不是 `unknown`
 *
 * 每条接缝的运行接口不同（`RetrievalLeg` / `Parser` / `Capturer` /
 * `ModelProvider` / `StorageBackend`），而注册表的实现相同——所以这里用泛型收口，
 * 不为每条接缝各写一份注册表代码。
 *
 * 用具体类型而不是 `unknown` 的收益是直接的：宿主在编排时拿到的是
 * `RetrievalLeg`，`leg.run(ctx)` 有完整类型；`unknown` 会把断言散布到
 * 每一个使用点，而那正是「契约没有落到位」的表现。
 */
export interface SeamHost {
  leg: Registry<RetrievalLeg>
  parser: Registry<Parser>
  capturer: Registry<Capturer>
  provider: Registry<ModelProvider>
  storage: Registry<StorageBackend>
}

export function createSeamHost(): SeamHost {
  return {
    leg: createRegistry<RetrievalLeg>('leg'),
    parser: createRegistry<Parser>('parser'),
    capturer: createRegistry<Capturer>('capturer'),
    provider: createRegistry<ModelProvider>('provider'),
    storage: createRegistry<StorageBackend>('storage'),
  }
}

export type { PluginDatabase, PluginSettings }
