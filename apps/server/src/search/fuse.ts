/**
 * 加权 RRF（Reciprocal Rank Fusion）。
 *
 * 为什么用 RRF 而不是把分数相加：不同召回通道的分数不可比——
 * ts_rank_cd 落在 0~1 但分布诡异，BM25 经常 >10。直接加权求和会让
 * 分数尺度大的通道单方面主导。RRF 只看**名次**，天然免疫尺度问题。
 *
 * 公式：score = Σ weight_i / (k + rank_i)，rank 从 1 开始。
 */

export interface RankedItem {
  id: string
  rank: number
}

export interface FusionChannel {
  /** 通道名，会写进结果的 matchedBy，用于前端标注「这条为什么被选中」 */
  name: string
  items: RankedItem[]
  weight: number
}

/** RRF 的 k。60 是原论文取值，作用是压低头部名次的绝对优势，避免单一通道霸屏。 */
export const RRF_K = 60

export interface FusedItem {
  id: string
  score: number
  matchedBy: string[]
}

/**
 * 融合多个通道的排序结果。
 * 同一个 id 出现在多个通道时会获得叠加分数——这正是混合检索的价值：
 * 关键词和向量都认可的文档，排序应当高于只有一个通道认可的。
 */
export function fuse(channels: FusionChannel[], k = RRF_K): FusedItem[] {
  const scores = new Map<string, number>()
  const matchedBy = new Map<string, Set<string>>()

  for (const channel of channels) {
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
