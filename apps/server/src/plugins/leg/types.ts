/**
 * 检索通道（leg）的接口。
 *
 * 这是本项目第一个定型的接缝——它有两个实现（keyword / substring），
 * 形状是从两者的共同点反推出来的，不是凭想象设计的。
 *
 * 设计要点：通道只负责**召回并排序**，不做融合、不做重排、不取正文。
 * 这样每个通道实现只关心自己的检索逻辑，融合策略的改动不影响它们。
 */

/** 通道产出的单条命中：文档 id + 名次（从 1 开始） */
export interface RankedHit {
  id: string
  /** 名次从 1 开始。RRF 的公式是 weight/(k+rank)，用 0 起始会算错。 */
  rank: number
}

export interface LegContext {
  /** 原始查询串，未分词 */
  query: string
  /** 每个通道各取多少候选再融合 */
  limit: number
  /** 可选的过滤条件 */
  kind?: string
  tag?: string
}

export interface RetrievalLeg {
  /** 会写进结果的 matchedBy，前端据此标注「这条为什么被选中」 */
  readonly name: string
  /**
   * 融合时的权重。有词边界语义的通道应当高于兜底通道。
   * 具体数值是经验值，等真实语料进来后按效果调。
   */
  readonly weight: number
  /** 召回并排序。返回空数组表示没有命中，不是错误。 */
  run(ctx: LegContext): Promise<RankedHit[]>
}
