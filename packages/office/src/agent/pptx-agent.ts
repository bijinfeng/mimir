import type { EditParagraph, EditRun } from '../../vendor/packages/pptx-ops/src/types.js'
import { OP_DOCS, opGuide, opGuideCatalog } from '../../vendor/packages/pptx-ops/src/op-docs.js'
import {
  elementDurableId,
  matchesElementRef,
  slideDurableId,
} from '../../vendor/packages/pptx-engine/src/identity.js'
import {
  editableElements,
  textOfElement,
  type PptxEditSession,
  type PptxSessionCheckpoint,
} from '../pptx.js'

/** The small set backed by Mimir's existing, patch-preserving PPTX executor. */
export const PPTX_EXECUTABLE_OPS = [
  'setText',
  'setFont',
  'deleteSlide',
  'duplicateSlide',
  'addBlankSlide',
  'moveSlide',
  'findReplace',
] as const
export const PPTX_AGENT_OPS = Object.entries(OP_DOCS)
  .filter(([, doc]) => doc.aiCallable !== false && !doc.pending)
  .map(([name]) => name)

export interface PptxAgentHandle {
  format: 'pptx'
  documentId: string
  getVersion(): number
  getContext(): Record<string, unknown>
  freezeSelection(roundId?: string): Record<string, unknown>
  execute(
    tool: string,
    args: unknown,
    options: { expectedVersion?: number; roundId?: string; signal?: AbortSignal },
  ): Promise<unknown>
  undoRound(roundId: string): boolean
  dispose(): void
}

export interface PptxHostApply {
  (request: {
    documentId: string
    bytes: Uint8Array
    expectedVersion: number
    ops: unknown[]
    signal?: AbortSignal
  }): Promise<{
    bytes: Uint8Array
    records: unknown[]
    version: number
    sampleData?: boolean
  }>
}

type RecordValue = Record<string, unknown>
type AgentResult = {
  ok: boolean
  changed?: boolean
  version: number
  summary?: string
  error?: string
  data?: unknown
}

function record(value: unknown): RecordValue {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('参数必须是对象')
  return value as RecordValue
}

function integer(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0)
    throw new Error(`${name} 必须是非负整数`)
  return value
}

function string(value: unknown, name: string): string {
  if (typeof value !== 'string') throw new Error(`${name} 必须是字符串`)
  return value
}

/** Matches the upstream XML 1.0 guard before any local or hosted mutation. */
function assertXmlSafe(value: unknown): void {
  if (typeof value === 'string') {
    for (const char of value) {
      const codePoint = char.codePointAt(0)!
      if (
        (codePoint < 0x20 && codePoint !== 0x09 && codePoint !== 0x0a && codePoint !== 0x0d) ||
        codePoint === 0xfffe ||
        codePoint === 0xffff ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff)
      ) {
        throw new Error('文字包含 XML 1.0 不允许的控制字符')
      }
    }
  } else if (Array.isArray(value)) value.forEach(assertXmlSafe)
  else if (value && typeof value === 'object') Object.values(value).forEach(assertXmlSafe)
}

function slideIndex(value: unknown, session: PptxEditSession): number {
  if (typeof value === 'string' && /^s_\d+$/.test(value)) {
    const id = Number(value.slice(2))
    const found = session
      .slides()
      .findIndex((slide) => Number(slide.path.match(/slide(\d+)\.xml$/)?.[1]) === id)
    if (found >= 0) return found
  }
  const index = integer(value, 'slide')
  if (!session.slides()[index]) throw new Error('幻灯片序号已失效')
  return index
}

function resolveTarget(
  op: RecordValue,
  session: PptxEditSession,
): { slide: number; elementId?: string } {
  const target = record(op.target)
  const slide = slideIndex(target.slide, session)
  if (target.el === undefined) return { slide }
  const elementId = string(target.el, 'target.el')
  const slides = session.slides()
  const element = slides[slide]?.elements.find((item) => matchesElementRef(item, elementId))
  if (!element) {
    throw new Error('元素 ID 已失效，请重新 read_slide')
  }
  return { slide, elementId: element.id }
}

function hostedOps(ops: unknown[], session: PptxEditSession): unknown[] {
  return ops.map((raw) => {
    const op = structuredClone(record(raw))
    if (op.target && typeof op.target === 'object' && !Array.isArray(op.target)) {
      const target = op.target as RecordValue
      if (typeof target.el === 'string' && target.slide !== undefined) {
        const index = slideIndex(target.slide, session)
        const slides = session.slides()
        const element = slides[index]?.elements.find((item) =>
          matchesElementRef(item, target.el as string),
        )
        if (element) {
          const durable = elementDurableId(element)
          if (!durable) throw new Error('目标元素没有可持久定位的 ID，无法送往宿主')
          target.el = durable
        }
      }
    }
    return op
  })
}

function paragraphsOf(value: unknown): EditParagraph[] {
  if (!Array.isArray(value) || value.length > 1000)
    throw new Error('paragraphs 必须是至多 1000 项的数组')
  return value.map((item, paraIndex) => {
    const para = record(item)
    if (!Array.isArray(para.runs) || para.runs.length > 1000)
      throw new Error('runs 必须是至多 1000 项的数组')
    const runs: EditRun[] = para.runs.map((raw, runIndex) => {
      const run = record(raw)
      const text = string(run.text, 'runs[].text')
      if (text.length > 100_000) throw new Error('单条文字过长')
      const output: EditRun = { text, srcRun: runIndex }
      for (const key of ['bold', 'italic', 'underline', 'strike'] as const) {
        if (run[key] !== undefined) {
          if (typeof run[key] !== 'boolean') throw new Error(`${key} 必须是布尔值`)
          output[key] = run[key]
        }
      }
      if (run.fontSize !== undefined) {
        if (typeof run.fontSize !== 'number' || run.fontSize <= 0 || run.fontSize > 400)
          throw new Error('fontSize 必须是 0–400 pt')
        output.fontSize = run.fontSize
      }
      if (run.fontFamily !== undefined) output.fontFamily = string(run.fontFamily, 'fontFamily')
      if (run.color !== undefined) {
        const color = string(run.color, 'color')
        if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error('color 必须是 #RRGGBB')
        output.color = color
      }
      return output
    })
    const result: EditParagraph = { runs, srcPara: paraIndex }
    if (para.align !== undefined) {
      if (!['left', 'center', 'right', 'justify'].includes(String(para.align)))
        throw new Error('align 无效')
      result.align = para.align as EditParagraph['align']
    }
    return result
  })
}

function elementText(session: PptxEditSession, slide: number, id: string) {
  const element = session.slides()[slide]?.elements.find((item) => item.id === id)
  const text = element ? textOfElement(element) : null
  if (!text) throw new Error('目标元素没有可编辑文字')
  return text
}

function opRun(session: PptxEditSession, value: unknown): string {
  assertXmlSafe(value)
  const op = record(value)
  const name = string(op.op, 'op')
  if (name === 'findReplace') {
    const find = string(op.find, 'find')
    const replace = string(op.replace, 'replace')
    if (!find) throw new Error('find 不能为空')
    const caseSensitive = op.matchCase === true
    const slideFilter = op.slideIndex === undefined ? undefined : slideIndex(op.slideIndex, session)
    let count = 0
    for (let si = 0; si < session.slides().length; si++) {
      if (slideFilter !== undefined && si !== slideFilter) continue
      for (const element of editableElements(session.slides()[si]!)) {
        if (op.elementId !== undefined && !matchesElementRef(element, String(op.elementId)))
          continue
        const text = textOfElement(element)!
        const next: EditParagraph[] = text.paragraphs.map((para, pi) => ({
          srcPara: pi,
          runs: para.runs.map((run, ri) => {
            const pattern = new RegExp(
              find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
              caseSensitive ? 'g' : 'gi',
            )
            const matches = run.text.match(pattern)
            if (!matches) return { text: run.text, srcRun: ri }
            let replaced = 0
            const nextText = run.text.replace(pattern, (match) => {
              if (op.firstOnly === true && (count > 0 || replaced > 0)) return match
              replaced++
              return replace
            })
            count += replaced
            return { text: nextText, srcRun: ri }
          }),
        }))
        if (
          next.some((para, pi) =>
            para.runs.some((run, ri) => run.text !== text.paragraphs[pi]?.runs[ri]?.text),
          )
        ) {
          session.setText(si, element.id, next)
        }
        if (op.firstOnly === true && count > 0) break
      }
      if (op.firstOnly === true && count > 0) break
    }
    if (!count) throw new Error('没有找到匹配文字')
    return `替换 ${count} 处文字`
  }

  const { slide, elementId } = resolveTarget(op, session)
  switch (name) {
    case 'setText': {
      if (!elementId) throw new Error('setText 需要 target.el')
      elementText(session, slide, elementId)
      if (!session.setText(slide, elementId, paragraphsOf(op.paragraphs)))
        throw new Error('文字修改失败')
      return '已修改元素文字'
    }
    case 'setFont': {
      if (!elementId) throw new Error('setFont 需要 target.el')
      const font = record(op.font)
      const allowed = new Set([
        'bold',
        'italic',
        'underline',
        'strike',
        'fontSizePt',
        'fontFamily',
        'color',
      ])
      if (!Object.keys(font).length || Object.keys(font).some((key) => !allowed.has(key)))
        throw new Error('setFont 包含尚未支持的字体参数')
      const source = elementText(session, slide, elementId)
      const next: EditParagraph[] = source.paragraphs.map((para, pi) => ({
        srcPara: pi,
        runs: para.runs.map((run, ri) => {
          const item: EditRun = { text: run.text, srcRun: ri }
          for (const key of ['bold', 'italic', 'underline', 'strike'] as const) {
            if (font[key] !== undefined) {
              if (typeof font[key] !== 'boolean') throw new Error(`${key} 必须是布尔值`)
              item[key] = font[key]
            }
          }
          if (font.fontSizePt !== undefined) {
            if (
              typeof font.fontSizePt !== 'number' ||
              font.fontSizePt <= 0 ||
              font.fontSizePt > 400
            )
              throw new Error('fontSizePt 无效')
            item.fontSize = font.fontSizePt
          }
          if (font.fontFamily !== undefined) item.fontFamily = string(font.fontFamily, 'fontFamily')
          if (font.color !== undefined) {
            const color = string(font.color, 'color')
            if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error('color 必须是 #RRGGBB')
            item.color = color
          }
          return item
        }),
      }))
      session.setText(slide, elementId, next)
      return '已修改元素字形'
    }
    case 'deleteSlide':
      session.remove(slide)
      return '已删除幻灯片'
    case 'duplicateSlide':
      if (op.clearText !== undefined) throw new Error('clearText 尚未支持')
      session.duplicate(slide)
      return '已复制幻灯片'
    case 'addBlankSlide':
      session.insertBlank(slide)
      return '已新增空白幻灯片'
    case 'moveSlide':
      session.move(slide, slideIndex(op.to, session))
      return '已移动幻灯片'
    default:
      throw new Error(`PPTX 操作 ${name} 尚未接入；不会修改文档`)
  }
}

export function createPptxAgentHandle(
  session: PptxEditSession,
  documentId: string,
  currentSelection: () => { slideIndex: number; elementId: string | null },
  onChange: () => void,
  hostApply?: PptxHostApply,
): PptxAgentHandle {
  let disposed = false
  const selections = new Map<string, Record<string, unknown>>()
  const rounds = new Map<string, { before: PptxSessionCheckpoint; latestVersion: number }>()
  const result = (partial: Omit<AgentResult, 'version'>): AgentResult => ({
    ...partial,
    version: session.version(),
  })
  const assertActive = (signal?: AbortSignal) => {
    if (disposed) throw new Error('PPTX 编辑器已关闭')
    if (signal?.aborted) throw new Error('操作已取消')
  }
  return {
    format: 'pptx',
    documentId,
    getVersion: () => session.version(),
    getContext: () => ({
      format: 'pptx',
      documentId,
      version: session.version(),
      slideCount: session.slides().length,
      availableOps: hostApply ? PPTX_AGENT_OPS : PPTX_EXECUTABLE_OPS,
      slides: session.slides().map((slide, index) => ({
        index,
        id: slideDurableId(slide),
        elements: slide.elements.map((element) => ({
          id: elementDurableId(element) ?? element.id,
          type: element.type,
          text:
            textOfElement(element)
              ?.paragraphs.map((para) => para.runs.map((run) => run.text).join(''))
              .join('\n') ?? null,
        })),
      })),
      selection: currentSelection(),
    }),
    freezeSelection(roundId) {
      const current = currentSelection()
      const slides = session.slides()
      const element = slides[current.slideIndex]?.elements.find(
        (item) => item.id === current.elementId,
      )
      const selection = {
        slideIndex: current.slideIndex,
        elementId: element ? (elementDurableId(element) ?? element.id) : null,
        version: session.version(),
      }
      if (roundId) selections.set(roundId, selection)
      return selection
    },
    async execute(tool, args, options) {
      try {
        assertActive(options.signal)
        if (options.expectedVersion !== undefined && options.expectedVersion !== session.version())
          throw new Error('画布版本已变化，请重新读取')
        if (tool === 'read_slide') {
          const input = record(args)
          const frozen = options.roundId ? selections.get(options.roundId) : undefined
          const index =
            input.slide === undefined
              ? ((frozen?.slideIndex as number | undefined) ?? currentSelection().slideIndex)
              : slideIndex(input.slide, session)
          const slide = session.slides()[index]
          if (!slide) throw new Error('幻灯片序号已失效')
          return result({
            ok: true,
            changed: false,
            data: {
              index,
              id: slideDurableId(slide),
              path: slide.path,
              elements: slide.elements.map((element) => ({
                id: elementDurableId(element) ?? element.id,
                type: element.type,
                text:
                  textOfElement(element)?.paragraphs.map((para) => ({
                    runs: para.runs.map((run) => ({
                      text: run.text,
                      bold: run.bold,
                      italic: run.italic,
                      fontSize: run.fontSize,
                      color: run.color,
                    })),
                  })) ?? null,
              })),
            },
          })
        }
        if (tool === 'load_guide') {
          const group = record(args).group
          const guide = group === undefined ? undefined : opGuide(string(group, 'group'))
          if (group !== undefined && !guide) throw new Error('PPTX 操作指南组无效')
          return result({
            ok: true,
            changed: false,
            data:
              group === undefined
                ? {
                    catalog: opGuideCatalog(),
                    supportedOps: hostApply ? PPTX_AGENT_OPS : PPTX_EXECUTABLE_OPS,
                  }
                : { group, guide },
          })
        }
        if (tool !== 'apply_ops') throw new Error(`PPTX 工具 ${tool} 尚未接入；不会修改文档`)
        const input = record(args)
        if (!Array.isArray(input.ops) || input.ops.length < 1 || input.ops.length > 50)
          throw new Error('ops 必须包含 1–50 项')
        assertXmlSafe(input.ops)
        const batchVersion = session.version()
        const batch = session.checkpoint()
        const roundId = options.roundId
        const newRound = roundId && !rounds.has(roundId) ? batch : null
        const summaries: string[] = []
        const needsHost = input.ops.some(
          (op) =>
            !PPTX_EXECUTABLE_OPS.includes(record(op).op as (typeof PPTX_EXECUTABLE_OPS)[number]),
        )
        if (needsHost) {
          if (!hostApply) throw new Error('此 PPTX 操作需要宿主执行器，当前未接入；不会修改文档')
          const expectedVersion = session.version()
          const response = await hostApply({
            documentId,
            bytes: await session.save(),
            expectedVersion,
            ops: hostedOps(input.ops, session),
            signal: options.signal,
          })
          assertActive(options.signal)
          if (session.version() !== expectedVersion)
            throw new Error('宿主处理期间画布已变化，请重新读取')
          if (response.version !== expectedVersion + 1) throw new Error('宿主返回的画布版本无效')
          await session.replaceFromHost(response.bytes)
          summaries.push(`宿主执行 ${response.records.length} 项 PPTX 操作`)
          if (response.sampleData) summaries.push('图表含示例数据，必须向用户说明它不是实际数据')
        } else {
          try {
            for (const op of input.ops) {
              assertActive(options.signal)
              summaries.push(opRun(session, op))
            }
          } catch (cause) {
            if (session.version() !== (options.expectedVersion ?? batchVersion))
              session.restore(batch)
            throw cause
          }
        }
        if (roundId) {
          const existing = rounds.get(roundId)
          rounds.set(roundId, {
            before: existing?.before ?? newRound!,
            latestVersion: session.version(),
          })
        }
        onChange()
        return result({ ok: true, changed: true, summary: summaries.join('；') })
      } catch (cause) {
        return result({
          ok: false,
          changed: false,
          error: cause instanceof Error ? cause.message : String(cause),
        })
      }
    },
    undoRound(roundId) {
      const round = rounds.get(roundId)
      if (!round || disposed || round.latestVersion !== session.version()) return false
      session.restore(round.before)
      rounds.delete(roundId)
      onChange()
      return true
    },
    dispose() {
      disposed = true
      rounds.clear()
      selections.clear()
    },
  }
}
