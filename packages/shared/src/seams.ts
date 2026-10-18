import type { RetrievalScope } from './retrieval.js'
import type {
  FetchedModelsResult,
  FetchModelsInput,
  ModelRole,
  ProviderInstance,
  ProviderPreset,
  ProviderModel,
  ModelRoleStatus,
} from './config.js'

/**
 * 五条接缝的**运行接口**（与 `plugin.ts` 的声明相对）。
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
 * | `storage` | 相对路径 → 字节 | 不管业务语义（笔记/头像/快照） |
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

/**
 * 文本类输入。内容本身就是字符串——抓取器产出的都是这一类。
 *
 * `html-fragment` 与 `html` 的区别是**要不要找正文**：
 * 一整个网页需要 Readability 从导航与广告里挑出 article，
 * 而 feed 的 `content:encoded` 给的**已经是正文片段**——再跑一遍
 * Readability 只会把它当「太短，不是一篇文章」而丢掉（实测：
 * 两行的片段返回 null，于是整条退化成裸 HTML）。
 * 所以它们是两种输入，不是同一种带个开关。
 */
export type TextParseType = 'html' | 'html-fragment' | 'markdown' | 'text'

/**
 * 字节类输入。Office 文档是 ZIP 容器，必须先拿到**字节**才能取出里面的 XML。
 *
 * 命名按**容器格式**而不是扩展名：`.docx` / `.xlsx` / `.pptx` 是三种不同的
 * OOXML 包（`word/document.xml` / `xl/sharedStrings.xml` / `ppt/slides/*.xml`），
 * 提取逻辑各不相同，所以它们是三种输入类型，而不是一个「office」加一个提示字段。
 *
 * 旧版二进制格式（`.doc` / `.xls` / `.ppt`）**不在这里**：它们不是 ZIP，
 * 需要另一套解析（OLE 复合文档），收益远小于代价。
 */
export type BinaryParseType = 'docx' | 'xlsx' | 'pptx' | 'pdf'

/** parser 能接受的输入类型。抓取器声明自己产出什么，宿主据此选实现 */
export type ParseInputType = TextParseType | BinaryParseType

export interface TextParseInput {
  type: TextParseType
  /** 与 type 对应的内容 */
  content: string
  /** 来源地址，用于解析相对链接 */
  baseUrl?: string
}

export interface BinaryParseInput {
  type: BinaryParseType
  /** 原件字节。**不是 base64 字符串**——那会把体积撑大 33% 再解回来 */
  data: Uint8Array
  /** 原文件名。用在失败信息里（「这份 docx 里没有可提取的文字」） */
  filename?: string
}

/**
 * 判别联合而不是「一个接口带两个可选字段」。
 *
 * 后者会让每个实现都写 `input.content!` 或 `input.data!`，而 TypeScript 帮不上忙
 * ——正是这个项目里那些「静默出错」的形态。判别联合让「你是哪种输入」
 * 在类型层面成立，实现只需过一道 `isTextParseInput`。
 */
export type ParseInput = TextParseInput | BinaryParseInput

/** 文本实现的入口断言。字节实现（docx 等）对称地判 `!isTextParseInput` */
export function isTextParseInput(input: ParseInput): input is TextParseInput {
  return (
    input.type === 'html' ||
    input.type === 'html-fragment' ||
    input.type === 'markdown' ||
    input.type === 'text'
  )
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

/**
 * 向量通道需要的两样东西（M1-C）。
 *
 * 合在一个对象里而不是两个可选字段：**要么全有、要么全没有**。
 * 命中「模型名有了但造向量的路没打通」这种半截状态的实现，
 * 会在运行期才失败——而那时表现成「语义搜不到」，看起来像库里没有相关内容。
 */
export interface EmbedPort {
  /** 把一段文本变成向量。查不到时由宿主的实现抛错（见 `LegContext.embedQuery`） */
  of(text: string): Promise<number[]>
  /** 向量表里该查哪个模型的行（`chunk_embeddings.model`） */
  model: string
  /** 该模型的实际维度。查询按它筛选，与模型名一起决定用哪批行 */
  dimension: number
}

export interface LegContext {
  retrievalScope?: RetrievalScope
  /** 原始查询串，未分词 */
  query: string
  /** 每个通道各取多少候选再融合 */
  limit: number
  /** 可选的过滤条件 */
  kind?: string
  tag?: string
  /**
   * 向量通道的输入端口（M1-C，`.trellis/spec/project/architecture.md` §4.11）。
   *
   * 为什么是端口而不是让通道自己去调模型：向量通道需要向量，而
   * 「配了哪个 embedding 模型、密钥在哪、怎么发请求」是 `provider` 接缝
   * 的知识（§7.4 的「宿主不认识具体实现」）。通道只声明「我要什么」，
   * 造它的事情在宿主。
   *
   * 没有可用模型时宿主**不会注册这个通道**（就绪性由注册表算出来），
   * 所以实现可以假定它存在；可选是为了让不含向量通道的路径能构造出
   * 不含它的上下文。
   */
  embed?: EmbedPort
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
  /** 耗时。用它区分「慢」与「不通」——两者对用户的下一步动作不同 */
  tookMs: number | null
}

/**
 * 模型提供方（一条接缝，不是一家服务商）。
 *
 * ## 为什么是「族」而不是「一家」
 *
 * 实现只管**协议**：OpenAI 兼容端点怎么调、`/models` 怎么拉、错误怎么读。
 * 「DeepSeek 的 baseURL 是什么」是**数据**（预设目录里一行），
 * 所以加一家服务商不需要写代码，加一个协议才需要。
 *
 * ## 谁解析角色绑定
 *
 * **实现自己解析**，宿主只问「给我对话角色的适配器」。
 * 角色绑定、供应商查找、密钥解密都是模型域的内部形状——
 * 让宿主来解析就是把形状知识漏到宿主里（`.trellis/spec/project/architecture.md` §7.4
 * 的「宿主不认识具体实现」）。
 */
export interface ModelProvider {
  readonly id: string
  /** 配置全貌：供应商列表 + 角色状态 + 预设目录。设置页与 `/api/config` 用它 */
  overview(): Promise<ProviderOverview>
  /** 这个角色当前是否可用（看配置，不发请求） */
  supports(role: ModelRole): Promise<boolean>
  /** 造适配器。角色不可用时抛错——调用方应当先问 supports */
  adapter(role: ModelRole): Promise<ModelAdapter>
  /** 角色级真实调用。只由用户显式触发（`.trellis/spec/project/architecture.md` §7.8） */
  probe(role: ModelRole): Promise<ProviderProbe>
  /**
   * 向端点拉模型清单。**纯读：结果不写配置**（D-080）。
   *
   * 早先它是「拉取并写回」，于是拉取只能发生在供应商已保存之后——
   * 而创建表单里用户还没保存任何东西。现在界面拿着结果进草稿、
   * 随保存一起提交，拉取与手改就是同一份草稿。
   */
  fetchModels(input: FetchModelsInput): Promise<FetchedModelsResult>
  /**
   * 供应商级探测：真的发一次最小请求。
   *
   * 与角色级探测的区别是**它不依赖角色绑定**——新建供应商、还没绑定角色时
   * 就要能验证它通不通，否则用户得先绑一个可能不对的角色才能测。
   */
  probeProvider(providerId: string, modelId?: string): Promise<ProviderProbe>
}

/**
 * 模型配置全貌。它是 `overview()` 的返回，也是设置页「模型」分区的全部数据。
 *
 * `roles` 里的 `ready`/`reason` 由实现算——「哪个供应商缺密钥」「哪个角色
 * 绑到了不存在的供应商」这类判断属于模型域，不该让宿主或前端复刻一遍。
 */
export interface ProviderOverview {
  providers: ProviderInstance[]
  roles: ModelRoleStatus[]
  presets: ProviderPreset[]
}

export type { ModelRole, ProviderInstance, ProviderPreset, ProviderModel }

/* ── storage：相对路径 → 字节 ─────────────────────────── */

/**
 * 存储接缝。
 *
 * ## key 的形状：相对 `DATA_DIR` 的 POSIX 路径
 *
 * ```
 * vault/2026/09/组件性能优化-a1b2c3d4.md     笔记（真相）
 * vault/.trash/<时间戳>-名字.md              回收站
 * raw/<hash>/index.html                      抓取原始快照
 * avatars/<userId>.webp                      头像（不属于内容，见 D-036）
 * ```
 *
 * 三个前缀对应原来的三个目录，于是有两件好处：
 *
 *  1. **本地后端下 key 与磁盘路径一一对应**——`data/` 仍然是备份、git 与
 *     外部编辑器（Typora / Obsidian）的单位，换成这个接缝没有搬动任何文件
 *  2. 换 S3 时同一批 key 直接变成桶内对象名，**没有任何调用方需要改**
 *
 * ## 为什么是「一个根 + 前缀」而不是「三个独立的根」
 *
 * 三个目录各自独立配置时，「新增第四个存储位置」要在每个部署文件里各加一行，
 * 而漏掉哪一行**不报错**——只是数据静静地落到容器可写层（TECH §10 记的
 * 「生产环境头像不落盘」就是它的真实症状）。收成一个根之后，
 * 这类不一致在结构上不可能发生。
 *
 * ## 明确不做的事
 *
 * | 不做 | 原因 |
 * |---|---|
 * | `stat` / mtime | 笔记时间来自 frontmatter，不用文件时间。S3 的 `LastModified` 因此不必暴露 |
 * | 预签名 URL | 它是**吞吐**手段，不是访问控制。头像的「私人资源」性质要求服务端转发（D-036） |
 * | 分块 / 流式上传 | 单用户笔记在 KB 量级，一次写完 |
 * | 目录概念 | 对象存储没有目录。`list` 直接给文件 key，不返回中间层 |
 */
export interface StorageBackend {
  readonly id: string

  /**
   * 读一个 key。**不存在时抛错**，由调用方决定这意味着什么——
   * 对「读笔记」是异常，对「探测三种头像扩展名」是正常分支。
   */
  read(key: string): Promise<Uint8Array>

  /** 写。父前缀不存在时自动创建（本地是 mkdir，S3 本来就不需要） */
  write(key: string, data: string | Uint8Array): Promise<void>

  /**
   * 删。**幂等**：key 不存在也算成功。
   *
   * 它的语义是「让这个 key 不存在」，而一个本来就不存在的 key 已经满足它了。
   * 头像删除要依次清掉三种扩展名、笔记删除要容忍文件已被手工删掉，
   * 两处都需要这个性质——否则调用方各自写一遍「忽略不存在的错误」。
   */
  remove(key: string): Promise<void>

  /**
   * 移动。**要么成功，要么没动过。**
   *
   * 这条保证在两个后端上的实现完全不同，也是这个接缝最值得注意的地方：
   *
   * | 后端 | 做法 | 原子性 |
   * |---|---|---|
   * | 本地 | `rename(2)` | 有（文件系统保证） |
   * | S3 | 复制 + 删除 | **无**（对象存储没有跨 key 的原子操作） |
   *
   * S3 上的失败模式是「复制成功、删除失败」→ 同一个笔记有两个文件。
   * 顺序必须是**先复制后删除**（任何时刻都不丢数据），
   * 而重复文件由 `reindexVault` 的「同一 id 多个路径」检测兜住
   * （`.trellis/spec/project/research.md` §10.3a）。
   */
  move(from: string, to: string): Promise<void>

  /**
   * 递归列出前缀下的**文件** key。顺序不保证。
   *
   * 不返回「目录」——对象存储里没有目录，返回中间层会让两个后端的语义分叉。
   * 跳过隐藏项（`.trash`、`.` 开头的路径段）是**调用方**的策略，
   * 不是存储层的事实：存储层只管存取，不知道什么叫回收站。
   */
  list(prefix: string): Promise<string[]>

  /**
   * 真实探测一次：写一个探针 key → 读回 → 删掉。
   *
   * **只由用户显式触发的「测试连接」调用**，理由与模型探测完全相同
   * （`.trellis/spec/project/architecture.md` §7.8）：存储配错会在最坏的时刻才暴露，而自动探测
   * 是每次进设置页都发一次真实写入。
   *
   * 可选——不是每个后端都值得做（本地后端配错的唯一可能是磁盘没了）。
   */
  probe?(): Promise<StorageProbe>
}

export interface StorageProbe {
  ok: boolean
  /** 给用户看的原因。失败时必须说清是「连不上」「鉴权失败」还是「桶不存在」 */
  message: string
}
