import { keywordLeg } from './keyword.js'
import { substringLeg } from './substring.js'
import type { RetrievalLeg } from './types.js'

/**
 * 已启用的检索通道。
 *
 * 融合层只认 RetrievalLeg 这个形状，不关心有几个通道、分别是什么。
 * M1 加向量通道时，只需在这里补一行——`search/index.ts` 不用改。
 *
 * 顺序有意义：先注册的先算。但目前是并行执行的（见 search/index.ts），
 * 所以顺序只影响日志可读性。
 */
export const retrievalLegs: RetrievalLeg[] = [keywordLeg, substringLeg]

export type { LegContext, RankedHit, RetrievalLeg } from './types.js'
