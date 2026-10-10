import type { PluginHost } from '@mimir/shared'
import { createKeywordLeg } from './keyword.js'
import { createSubstringLeg } from './substring.js'
import { createVectorLeg } from './vector.js'

/**
 * 检索通道插件包。
 *
 * ## 一个包装两个实现，而不是两个包
 *
 * 拆包的依据是**依赖与发布边界**，不是「一个实现一个包」：
 * 这两个通道共用同一套依赖（drizzle 的 sql 模板、分词包），
 * 也总是一起被替换（换检索栈）与一起被测试。把它们拆成两个包
 * 只会让 `pnpm install` 多两次解析，而没有任何隔离收益。
 *
 * 将来加向量通道时：如果它需要的依赖与这两个完全不同（比如 pgvector 的
 * 查询辅助库），那时再拆一个包是有理由的。**按依赖边界拆，不按数量拆。**
 *
 * ## 权重来自设置，默认值来自实现
 *
 * 每个实现自己声明 `retrieval.<id>.weight`，用户可以在设置页调
 * （`.trellis/spec/project/architecture.md` §7.5）。实现给 `defaultWeight` 作为初始猜测——
 * 有词边界语义的通道高于兜底通道。
 */
export function install(host: PluginHost): void {
  host.leg(
    {
      seam: 'leg',
      id: 'keyword',
      name: '关键词匹配',
      description: '按词匹配，适合查找明确的名称或术语',
      file: 'plugins/leg/src/keyword.ts',
      configKeys: ['retrieval.keyword.weight'],
      params: [
        {
          key: 'retrieval.keyword.weight',
          label: '关键词通道权重',
          description: '提高后，关键词匹配的结果更容易排在前面',
          group: 'retrieval',
          type: 'number',
          envName: null,
          defaultValue: 1,
          rebuild: 'none',
          validate: (value) => {
            const n = Number(value)
            if (!Number.isFinite(n)) return '必须是数字'
            if (n < 0 || n > 10) return '必须在 0 到 10 之间'
            return null
          },
        },
      ],
    },
    createKeywordLeg(host.db),
  )

  host.leg(
    {
      seam: 'leg',
      id: 'substring',
      name: '文本片段匹配',
      description: '按文字片段匹配，可补足关键词未命中的内容',
      file: 'plugins/leg/src/substring.ts',
      configKeys: ['retrieval.substring.weight'],
      params: [
        {
          key: 'retrieval.substring.weight',
          label: '子串兜底权重',
          description: '提高后，包含查询片段的结果更容易排在前面',
          group: 'retrieval',
          type: 'number',
          envName: null,
          defaultValue: 0.6,
          rebuild: 'none',
          validate: (value) => {
            const n = Number(value)
            if (!Number.isFinite(n)) return '必须是数字'
            if (n < 0 || n > 10) return '必须在 0 到 10 之间'
            return null
          },
        },
      ],
    },
    createSubstringLeg(host.db),
  )

  host.leg(
    {
      seam: 'leg',
      id: 'vector',
      name: '语义匹配',
      description: '按意思相近程度匹配，需先配置向量化模型',
      file: 'plugins/leg/src/vector.ts',
      configKeys: ['retrieval.vector.weight', 'model.embed.dimensions'],
      /**
       * **就绪性 = 配了向量化模型**（D-080 的「用途」声明到这里的落点）。
       *
       * 判据不是「`model.embed.dimensions` 有值」——那个键有默认值 1024，
       * 永远非空。真正的判据是「角色绑定里 embed 指向了哪个模型」，
       * 而那是模型域的形状（`model.config` 的一段 JSON），
       * 所以从那里读。
       *
       * 未就绪时这条通道不出现在编排里（core 按状态过滤），
       * 于是 `hybrid` 通道集里没有它、`channels` 里也没有它——
       * 「为什么没走向量」在界面上看得到原因（`reason`）。
       */
      unavailable: (read) => {
        const config = read.get('model.config')
        if (!config || typeof config !== 'object') return '还没有配置向量化模型'
        const roles = (
          config as { roles?: Record<string, { providerId?: string; model?: string } | null> }
        ).roles
        const binding = roles?.embed
        if (!binding?.model) return '还没有给「向量化」角色绑定模型（设置 › 模型 › 任务分配）'
        return null
      },
      params: [
        {
          key: 'retrieval.vector.weight',
          label: '向量通道权重',
          description: '提高后，语义相近的结果更容易排在前面',
          group: 'retrieval',
          type: 'number',
          envName: null,
          defaultValue: 1.2,
          rebuild: 'none',
          validate: (value) => {
            const n = Number(value)
            if (!Number.isFinite(n)) return '必须是数字'
            if (n < 0 || n > 10) return '必须在 0 到 10 之间'
            return null
          },
        },
      ],
    },
    createVectorLeg(host.db),
  )
}
