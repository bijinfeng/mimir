import type { PluginHost } from '@mimir/shared'
import { createKeywordLeg } from './keyword.js'
import { createSubstringLeg } from './substring.js'

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
 * （`docs/TECH.md` §7.5）。实现给 `defaultWeight` 作为初始猜测——
 * 有词边界语义的通道高于兜底通道。
 */
export function install(host: PluginHost): void {
  host.leg(
    {
      seam: 'leg',
      id: 'keyword',
      name: '关键词（jieba 分词）',
      description: '词级召回，有词边界语义。三个通道里精度最高，是主力',
      file: 'plugins/leg/src/keyword.ts',
      configKeys: ['retrieval.keyword.weight'],
      params: [
        {
          key: 'retrieval.keyword.weight',
          label: '关键词通道权重',
          description: '有词边界语义的通道，权重应当高于兜底通道',
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
      name: '子串兜底',
      description: '不受分词结果影响。词级通道切错了它还能捞回来，代价是精度低',
      file: 'plugins/leg/src/substring.ts',
      configKeys: ['retrieval.substring.weight'],
      params: [
        {
          key: 'retrieval.substring.weight',
          label: '子串兜底权重',
          description:
            '没有词边界语义，所以低于关键词通道。调高它会更容易捞回分词切错的段落，代价是噪声',
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
}
