/**
 * 加权 RRF（Reciprocal Rank Fusion）。
 *
 * 为什么用 RRF 而不是把分数相加：不同召回通道的分数不可比——
 * `ts_rank_cd` 落在 0~1 但分布诡异，BM25 经常 >10。直接加权求和会让
 * 分数尺度大的通道单方面主导。RRF 只看**名次**，天然免疫尺度问题。
 *
 * 公式：score = Σ weight_i / (k + rank_i)，rank 从 1 开始。
 *
 * **融合算法属于编排，不属于任何一条通道**：通道只产出「已排序的 id 列表」，
 * 怎么合并它们是核心的决定。所以它在 core 里，而不在某个 leg 实现里——
 * 换一个通道不该能改变融合语义。
 */

export interface RankedItem {
  id: string
  /** 名次从 1 开始。用 0 起始会让 weight/(k+rank) 算错 */
  rank: number
}

export interface FusionChannel {
  /** 通道 id，会写进结果的 `matchedBy`，前端据此标注「这条为什么被选中」 */
  name: string
  items: readonly RankedItem[]
  weight: number
}

/** RRF 的 k 默认值。作用与出处见 `docs/TECH.md` §4.2；实际取值由设置决定 */
export const DEFAULT_RRF_K = 60

export interface FusedItem {
  id: string
  score: number
  matchedBy: string[]
}

/**
 * 融合多个通道的排序结果。
 *
 * 同一个 id 出现在多个通道时会获得**叠加**分数——这正是混合检索的价值：
 * 关键词和向量都认可的段落，排序应当高于只有一个通道认可的。
 *
 * 权重为 0 的通道不参与（等于临时禁用），但它的命中仍会出现在
 * `matchedBy` 之外——那是刻意的：权重 0 表示「不靠它排序」，
 * 而不是「假装它没跑过」。要看它跑了没有，看 `SearchResponse.channels`。
 */
export function fuse(channels: readonly FusionChannel[], k = DEFAULT_RRF_K): FusedItem[] {
  const scores = new Map<string, number>()
  const matchedBy = new Map<string, Set<string>>()

  for (const channel of channels) {
    if (channel.weight === 0) continue

    for (const item of channel.items) {
      const contribution = channel.weight / (k + item.rank)
      scores.set(item.id, (scores.get(item.id) ?? 0) + contribution)

      const sources = matchedBy.get(item.id) ?? new Set<string>()
      sources.add(channel.name)
      matchedBy.set(item.id, sources)
    }
  }

  return [...scores.entries()]
    .map(([id, score]) => ({
      id,
      score,
      matchedBy: [...(matchedBy.get(id) ?? [])].toSorted(),
    }))
    .toSorted((a, b) => b.score - a.score)
}

/**
 * 把无界的相关性分数折叠到 [0,1]。
 *
 * 通道自己的分数（`ts_rank_cd` 之外还有 BM25，常 >10）**不能**直接当
 * 相关性展示或参与后续加权：尺度大的通道会淹没别的项。这条借自
 * WeKnora 的生产实践（`RESEARCH.md` §1.2）。
 *
 * 注意它**不用于 RRF**——RRF 只看名次，这正是选它的理由。
 * 这个函数是给「展示分数」与「rerank 前的候选打分」用的。
 */
export function foldScore(score: number, max: number): number {
  if (max <= 0) return 0
  return Math.min(1, Math.max(0, score / max))
}
