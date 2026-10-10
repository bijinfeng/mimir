import { toSearchText } from '@mimir/tokenizer'

/**
 * 分块器（M1-B，`.trellis/spec/project/architecture.md` §4.9）。
 *
 * ## 三条硬要求，每条对应一类静默错误
 *
 * | 要求 | 违反它的后果 |
 * |---|---|
 * | **确定性** | 同样输入切出不同的块 → 每次重建索引产生新 chunk id，向量表持续膨胀（且不报错） |
 * | **偏移可逆**：`body.slice(start, end) === content` | 引用跳不回原文位置。切错一个字符高亮就偏了，而且没有任何症状 |
 * | **按结构切** | 代码块被从中间切开 → 语义破碎；标题不是边界 → 一节的内容跨块，`heading` 完全错 |
 *
 * ## 切法（文档里定稿的顺序）
 *
 * 按行扫描 → 围栏代码块整体作为一个不可分单元 → 标题行开启新的一节 →
 * 累积段落直到 `size` → 超长段落按句末标点再切 → 仍超长则硬切。
 * `overlap` 从**上一块尾部**按句边界回退若干字符作为本块的开头。
 *
 * ## 实现分两步，先把「因果」拆开
 *
 *   1. **切单元**：扫描出行级结构（段落 / 代码块 / 标题），每个单元带真实的
 *      `[start, end)` 偏移与所属标题路径
 *   2. **成块**：贪心地把单元攒成不超过 `size` 的块；超长的单元单独切分；
 *      最后统一加 overlap 与「区间连续化」
 *
 * 第二步的「区间连续化」（每块的 end 推到下一块的 start）是**覆盖完整的落点**：
 * 段落之间那些空行不属于任何单元，若留着它们的偏移不推，各块区间的并集
 * 就等于正文减去所有空行——那条断言（§9.5）会当场抓住，但更糟的是它意味着
 * 「空行里没有内容」这件事没人保证过（将来的格式里可能是别的）。
 *
 * 偏移一律直接取自原始 body，**任何地方都不做 `trim` 后再拼**——
 * 那样偏移会与正文错位，而错位是静默的。
 */

/** 参数由宿主注入（来自设置：`parser.chunk.size` / `parser.chunk.overlap`） */
export interface ChunkOptions {
  /** 每块的目标字符数 */
  size: number
  /** 相邻块的重叠字符数 */
  overlap: number
  /**
   * 文档标题。它进每一块的 `searchText`（与 M0 的 `documents.search_text`
   * 同一条规则：`toSearchText(title, body)`）。
   *
   * 漏掉它的后果是**按标题里的词搜不到正文**——`search.test.ts` 有一条
   * 「能按词命中中文（jieba 分词生效）」当场抓到：标题是「React 组件性能优化」、
   * 正文里没有「组件」二字，于是那个词只能在标题里命中，而它不在块的检索文本里。
   */
  title?: string
}

/** 块 id 的确定性拼法。**只此一处**——重建后同一篇的同一段必须是同一个 id */
export function chunkId(documentId: string, index: number): string {
  return `${documentId}:${index}`
}

export interface Chunk {
  /** 确定性 id：`文档 id:序号` */
  id: string
  /** 从 0 开始 */
  index: number
  /** 逐字节等于 `body.slice(start, end)` */
  content: string
  /** 相对**完整正文**的字符偏移（不是相对分块） */
  start: number
  end: number
  /** 所属标题路径，如「部署 / 已知坑」。null 表示这一节还没有标题 */
  heading: string | null
  /** jieba 预分词（铁律 4）。写入时切一次，检索时零成本 */
  searchText: string
}

/** 句末标点。超长段落在这里切开，避免把一句话拦腰截断 */
const SENTENCE_ENDS = new Set(['。', '！', '？', '；', '…', '\n'])

/** 一行是不是围栏代码块的开头（``` 或 ~~~），返回围栏字符 */
function fenceMarker(line: string): string | null {
  const match = line.match(/^\s{0,3}(`{3,}|~{3,})/)
  if (!match) return null
  return match[1]![0]!
}

/** 一行是不是 ATX 标题，返回层级与文本 */
function headingOf(line: string): { level: number; text: string } | null {
  const match = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/)
  if (!match) return null
  return { level: match[1]!.length, text: match[2]!.trim() }
}

/**
 * 「当前标题路径」的小状态机。
 *
 * 标题是**天然的边界**，而分块要知道自己属于哪一节。用层级栈而不是
 * 「记住最后一个标题」：`## 部署` 下的 `### 已知坑` 命中时，
 * `heading` 应当是「部署 / 已知坑」，而不是只有「已知坑」——
 * 后者丢掉了它属于哪一节，而模型的上下文里那正是有用的部分。
 */
class HeadingPath {
  private readonly stack: { level: number; text: string }[] = []

  push(level: number, text: string): void {
    // 同级或更深的旧标题出栈：`## A` 之后又来个 `## B`，A 那一节已经结束
    while (this.stack.length > 0 && this.stack[this.stack.length - 1]!.level >= level) {
      this.stack.pop()
    }
    this.stack.push({ level, text })
  }

  current(): string | null {
    if (this.stack.length === 0) return null
    return this.stack.map((item) => item.text).join(' / ')
  }
}

/** 扫描出的一个结构单元 */
interface Unit {
  start: number
  end: number
  /** 这一单元所属的标题路径（在它开始时的值） */
  heading: string | null
  /** 代码块：不可再切分（切在代码中间没有语义） */
  atomic: boolean
}

/** 按行扫描出结构单元。**偏移直接取自 body**，不 trim、不拼回 */
function scanUnits(body: string): Unit[] {
  const units: Unit[] = []
  const headings = new HeadingPath()

  let inFence: string | null = null
  let fenceStart = 0
  /** 当前累积的段落（连续的非空行） */
  let blockStart: number | null = null
  let blockHeading: string | null = null
  let blockEnd = 0

  const flushBlock = (): void => {
    if (blockStart === null) return
    units.push({ start: blockStart, end: blockEnd, heading: blockHeading, atomic: false })
    blockStart = null
  }

  let lineStart = 0
  while (lineStart <= body.length) {
    const newline = body.indexOf('\n', lineStart)
    const lineEnd = newline === -1 ? body.length : newline
    const line = body.slice(lineStart, lineEnd)
    const nextStart = newline === -1 ? body.length + 1 : newline + 1

    if (inFence !== null) {
      // 代码块内：只有闭合围栏才结束整块
      if (line.trimStart().startsWith(inFence) && line.trim().replace(/[`~]/g, '') === '') {
        inFence = null
        units.push({ start: fenceStart, end: lineEnd, heading: blockHeading, atomic: true })
      }
      lineStart = nextStart
      continue
    }

    const fence = fenceMarker(line)
    if (fence !== null) {
      // 围栏开始：先把累积的段落冲掉，代码块整体成为一个单元
      flushBlock()
      inFence = fence
      fenceStart = lineStart
      blockHeading = headings.current()
      lineStart = nextStart
      continue
    }

    const heading = headingOf(line)
    if (heading) {
      flushBlock()
      headings.push(heading.level, heading.text)
      blockStart = lineStart
      blockHeading = headings.current()
      blockEnd = lineEnd
      lineStart = nextStart
      continue
    }

    if (line.trim() === '') {
      // 空行 = 段落边界。空行本身不进任何单元，最后统一由「连续化」补上
      flushBlock()
      lineStart = nextStart
      continue
    }

    if (blockStart === null) {
      blockStart = lineStart
      blockHeading = headings.current()
    }
    blockEnd = lineEnd
    lineStart = nextStart
  }

  // 未闭合的围栏也当作一个块（作者忘了写结尾的 ```）
  if (inFence !== null) {
    units.push({ start: fenceStart, end: body.length, heading: blockHeading, atomic: true })
  }
  flushBlock()

  return units
}

/** 在 `[from, to]` 区间里找最后一个句边界（含标点之后的那个位置） */
function lastSentenceBreak(body: string, from: number, to: number): number | null {
  for (let i = to - 1; i >= from; i -= 1) {
    if (SENTENCE_ENDS.has(body[i]!)) return i + 1
  }
  return null
}

/**
 * 把正文切成块。
 *
 * 返回的块按顺序、每块的 `[start, end)` 是它在原始正文里的真实区间。
 * 相邻块允许重叠，各块的区间**并集恒等于整个正文**（§9.5 的覆盖断言）。
 */
export function chunkText(body: string, options: ChunkOptions, documentId: string): Chunk[] {
  if (body.length === 0) return []

  const size = Math.max(1, Math.floor(options.size))
  const overlap = Math.max(0, Math.floor(Math.min(options.overlap, size - 1)))
  /** 检索文本带上标题（与 M0 的 documents.search_text 同一条规则） */
  const searchTextOf = (content: string): string => toSearchText(options.title ?? '', content)

  /**
   * 第一步：把单元攒成「核心块」（互不重叠、按顺序）。
   *
   * 一个单元自身超过 size 时在这里就地切开（优先句边界，其次硬切）——
   * 切出来的片段仍是核心块。
   */
  interface Core {
    start: number
    end: number
    heading: string | null
  }

  const cores: Core[] = []
  let current: Core | null = null

  /** 第一步：扫描出行级结构单元（唯一的 body 扫描，偏移全部直接取自 body） */
  const units = scanUnits(body)

  /**
   * 可以成为某一块**起点**的位置（升序）。
   *
   * 有它才能把 overlap 落在安全的地方：单元的起点 + 非原子单元内部的句边界。
   * **代码块内部没有落点**——从代码中间开始一块等于把代码切给了两个块，
   * 而那正是「按结构切」要避免的。回退时找不到落点就不重叠，
   * 宁可少一点上下文，也不切碎不可分单元。
   */
  const landingPoints: number[] = []
  for (const unit of units) {
    landingPoints.push(unit.start)
    if (!unit.atomic) {
      for (let i = unit.start; i < unit.end; i += 1) {
        if (SENTENCE_ENDS.has(body[i]!)) landingPoints.push(i + 1)
      }
    }
  }
  landingPoints.sort((a, b) => a - b)

  /** 在 [from, limit] 里找最大的落点。找不到返回 null */
  const lastLanding = (from: number, limit: number): number | null => {
    let found: number | null = null
    for (const point of landingPoints) {
      if (point > limit) break
      if (point >= from) found = point
    }
    return found
  }

  const emitCore = (): void => {
    if (current === null) return
    if (current.end > current.start) cores.push(current)
    current = null
  }

  /** 超长片段按句边界切，仍超长则硬切 */
  const splitOversized = (unit: Unit): void => {
    let cursor = unit.start
    while (cursor < unit.end) {
      const hardEnd = Math.min(cursor + size, unit.end)
      const breakAt =
        hardEnd < unit.end ? (lastSentenceBreak(body, cursor, hardEnd) ?? hardEnd) : unit.end
      const end = breakAt > cursor ? breakAt : hardEnd
      const candidate: Core = { start: cursor, end, heading: unit.heading }
      if (end < unit.end) cores.push(candidate)
      else {
        // 最后一段：交给主循环继续累积（它之后可能还有标题等单元）
        current = candidate
        return
      }
      cursor = end
    }
  }

  for (const unit of units) {
    /**
     * 标题是**硬边界**：块的归属必须唯一。
     *
     * 若只按 size 累积，`## 已知坑` 这一节可能被并进上一节的块里——
     * 那个块的 `heading` 会写着「部署」，而它明明标注的是「部署 / 已知坑」。
     * 「把标题一起带进上下文」的承诺就此落空，而谁也不会发现。
     */
    const headingChanged = current !== null && current.heading !== unit.heading
    if (current === null || headingChanged || unit.end - current.start > size) {
      if (current !== null) emitCore()
      current = { start: unit.start, end: unit.end, heading: unit.heading }
    } else {
      // 还装得下：继续累积（同一节内）
      current.end = Math.max(current.end, unit.end)
    }

    if (current !== null && current.end - current.start > size) {
      if (unit.atomic) {
        // 超长代码块：不可再切，整块保留（宁可超出 size 也不切碎代码）
        emitCore()
      } else {
        current = null
        splitOversized(unit)
      }
    }
  }
  emitCore()

  if (cores.length === 0) return []

  /**
   * 第二步：加 overlap 并把区间连续化。
   *
   * - **连续化**：每块的 end 推到下一块的 start（末块推到正文末尾）。
   *   段落间的空行由此落进前一块，各块区间的并集恒等于 `[0, body.length)`
   * - **overlap**：第 i 块（i > 0）的起点按句边界回退，回退量不超过
   *   `overlap`、且不越过前一块的起点（否则会与更前面的块重叠）
   */
  const chunks: Chunk[] = []

  for (let i = 0; i < cores.length; i += 1) {
    const core = cores[i]!
    let start = core.start

    if (i > 0 && overlap > 0) {
      const previous = cores[i - 1]!
      const back = Math.max(previous.start, core.start - overlap)
      // 落点必须**落在上一块区间内**，且不越过 `back`。找不到落点
      // （比如上一块整段是代码块内部）就不重叠——见 landingPoints 的注释
      const point = lastLanding(back, core.start - 1)
      if (point !== null) start = point
    }

    const next = cores[i + 1]
    const end = next ? Math.max(next.start, core.end) : body.length
    chunks.push({
      id: chunkId(documentId, i),
      index: i,
      content: body.slice(start, end),
      start,
      end,
      heading: core.heading,
      searchText: searchTextOf(body.slice(start, end)),
    })
  }

  return chunks
}
