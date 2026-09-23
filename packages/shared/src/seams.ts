/**
 * 四条接缝的**运行接口**（与 `plugin.ts` 的声明相对）。
 *
 * 放在 shared 而不是各插件包里：运行时接口是宿主与插件之间的**唯一约定的形状**，
 * 它必须只有一个真相来源。放在某个插件包里，就会出现「谁的版本算数」的问题。
 *
 * 每个接口只描述**这一条接缝自己的事**，不碰数据库、不碰 HTTP、不碰别的接缝：
 *
 * | 接缝 | 输入 → 输出 | 明确不做 |
 * |---|---|---|
 * | `capturer` | URL → 原始内容 + 元数据 | 不转换格式、不写库 |
 * | `parser` | 原始内容 → 统一 Markdown | 不抓取、不写库 |
 * | `leg` | 查询 → 已排序的检索单元 id | 不融合、不取正文 |
 * | `provider` | 角色 → 模型适配器 | 不组装上下文、不调检索 |
 */

/* ── capturer：URL → 原始内容 ─────────────────────────── */

/**
 * 抓取到的**原始内容**，未转换。
 *
 * 刻意不在这一层转 Markdown：转换规则是 `parser` 接缝的职责，
 * 而抓取器的职责是「把这个站点特有的结构挖出来」。
 * 两者混在一起会让「换一个 HTML 转换器」变成改三个抓取器。
 */
export interface CaptureRaw {
  /** 入库的 kind：web | wechat | github | … */
  kind: string
  title: string
  /**
   * 正文内容。要么是 HTML（交给 parser 转），要么已经是 Markdown
   * （如 GitHub 的 README，它本来就是 md，再走一遍 HTML 转换是倒退）。
   */
  content: { type: 'html'; html: string } | { type: 'markdown'; markdown: string }
  /** 原始 HTML 快照，落盘到 RAW_DIR 供回溯。可选——GitHub 走 API 没有整页 */
  rawHtml?: string
  /** 页面里图片数量，用于界面显示「N 张图片（保留原链接）」 */
  imageCount: number
  author?: string
}

export interface Capturer {
  readonly id: string
  /** 这个实现是否处理该 URL */
  matches(url: string): boolean
  run(url: string): Promise<CaptureRaw>
}

/* ── parser：原始内容 → Markdown ──────────────────────── */

/** parser 能接受的输入类型。抓取器声明自己产出什么，宿主据此选实现 */
export type ParseInputType = 'html' | 'markdown' | 'text'

export interface ParseInput {
  type: ParseInputType
  /** 与 type 对应的内容 */
  content: string
  /** 来源地址，用于解析相对链接 */
  baseUrl?: string
}

export interface ParseResult {
  markdown: string
  /** 解析过程中发现的图片数 */
  imageCount: number
  /** 解析器实现的名（写进 trace/日志，便于排查「是哪一步挂的」） */
  parser: string
}

/**
 * 解析器。
 *
 * `accepts` 是**静态声明**，宿主在编排时按它选实现（而不是 try 一遍看谁不报错）：
 * 「这个实现处理不了这种输入」应当是一个可查询的事实，不是一次异常。
 */
export interface Parser {
  readonly id: string
  readonly accepts: readonly ParseInputType[]
  parse(input: ParseInput): Promise<ParseResult>
}

/* ── leg：查询 → 已排序的检索单元 id ──────────────────── */

/** 通道产出的单条命中：检索单元 id + 名次（从 1 开始） */
export interface RankedHit {
  id: string
  /** 名次从 1 开始。RRF 的公式是 weight/(k+rank)，用 0 起始会算错 */
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
  readonly id: string
  /**
   * 融合时的**默认**权重。有词边界语义的通道应当高于兜底通道。
   * 具体数值是经验值，可由设置覆盖（`retrieval.<id>.weight`）。
   */
  readonly defaultWeight: number
  /** 召回并排序。返回空数组表示没有命中，不是错误。 */
  run(ctx: LegContext): Promise<RankedHit[]>
}

/* ── provider：角色 → 模型适配器 ──────────────────────── */

/**
 * 模型角色。**按任务分角色，而不是按服务商分**——
 * 「摘要换一个便宜模型」是最直接的成本控制手段（`docs/TECH.md` §5.7）。
 */
export type ModelRole = 'chat' | 'reasoning' | 'summarize' | 'embed'

export const MODEL_ROLES: readonly ModelRole[] = ['chat', 'reasoning', 'summarize', 'embed']

/**
 * 一个角色的适配器实例。
 *
 * `instance` 是 `unknown`：适配器来自 TanStack AI（`@tanstack/ai` 的各种
 * `*Adapter` 类型），而契约包**不 import 那个包的运行时对象**——
 * 否则每个只知道 shared 的地方都被拖进 AI SDK。
 * 调用方在真正调 `chat()` / `embed()` 的边界断言一次，且只在那一个地方。
 */
export interface ModelAdapter {
  role: ModelRole
  model: string
  instance: unknown
}

export interface ProviderProbe {
  ok: boolean
  /** 给用户看的原因。失败时必须说清是「连不上」还是「鉴权失败」 */
  message: string
}

export interface ModelProvider {
  readonly id: string
  /** 这个角色当前是否可用（看配置，不发请求） */
  supports(role: ModelRole): Promise<boolean>
  /** 造适配器。角色不可用时抛错——调用方应当先问 supports */
  adapter(role: ModelRole): Promise<ModelAdapter>
  /** 真实调一次。只由用户显式点「测试连接」触发（`docs/TECH.md` §7.8） */
  probe(role: ModelRole): Promise<ProviderProbe>
}
