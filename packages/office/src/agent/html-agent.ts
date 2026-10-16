import {
  buildParseMap,
  type ParseMap,
} from '../../vendor/apps/html/src/renderer/document/parse-map.js'
import {
  applyPatches,
  validatePatchSet,
  type Patch,
} from '../../vendor/apps/html/src/renderer/document/patch.js'
import { compileOps, type HtmlOp } from '../../vendor/apps/html/src/renderer/document/ops.js'

export const HTML_AGENT_TOOL_NAMES = [
  'get_outline',
  'read_source',
  'apply_ops',
  'ask_clarification',
  'plan_page',
  'write_document',
] as const
export const HTML_OP_NAMES = [
  'str_replace',
  'replace_element',
  'set_inner_html',
  'set_text',
  'insert_html',
  'remove',
  'move',
  'set_attr',
  'set_style',
  'set_tag',
  'set_text_node',
  'wrap_text',
  'unwrap',
] as const
export interface HtmlAgentDocument {
  text: string
  map: ParseMap
  version: number
}
export interface HtmlAgentResult {
  ok: boolean
  changed: boolean
  version: number
  summary?: string
  error?: string
  data?: unknown
}
export interface HtmlPageBrief {
  title: string
  tone: string
  audience: string
  sections: Array<{ title: string; purpose: string }>
}
export interface HtmlClarificationQuestion {
  id: string
  label: string
  description?: string
  options: string[]
  multi?: boolean
}
export interface HtmlAgentHooks {
  applyPatches(patches: Patch[], highlight: boolean): void
  replaceDoc(text: string, highlight: boolean): void
  onDocument(document: HtmlAgentDocument): void
  getSelectedSid(): number | null
  askClarification?(
    questions: HtmlClarificationQuestion[],
  ): Promise<{ answers: string; cancelled?: boolean }>
  planPage?(input: {
    mode: 'new' | 'redesign' | 'restyle' | 'extract'
    instruction: string
    notes?: string
    currentSource: string
    signal?: AbortSignal
  }): Promise<HtmlPageBrief>
  confirmBrief?(brief: HtmlPageBrief, mode: string): Promise<HtmlPageBrief | null>
  writeDocument?(input: {
    kind: 'design' | 'content'
    instruction: string
    brief?: HtmlPageBrief
    title?: string
    plan?: string
    context?: string
    signal?: AbortSignal
    onDelta?: (text: string) => void
  }): Promise<{ html: string; complete: boolean; keptPartial?: boolean }>
}

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const integer = (value: unknown): value is number => Number.isSafeInteger(value)
const string = (value: unknown): value is string => typeof value === 'string'

/** Validate model JSON before handing it to the upstream typed compiler. */
export function validateHtmlOp(value: unknown): value is HtmlOp {
  if (!object(value) || !string(value.op)) return false
  const sid = integer(value.sid)
  switch (value.op) {
    case 'str_replace':
      return (
        string(value.old) &&
        !!value.old &&
        string(value.new) &&
        (value.sid === undefined || sid) &&
        (value.replace_all === undefined || typeof value.replace_all === 'boolean')
      )
    case 'replace_element':
    case 'set_inner_html':
      return sid && string(value.html)
    case 'set_text':
      return sid && string(value.text)
    case 'insert_html':
      return (
        sid &&
        string(value.html) &&
        ['before', 'after', 'prepend', 'append'].includes(String(value.position))
      )
    case 'remove':
    case 'unwrap':
      return sid
    case 'move':
      return sid && integer(value.ref_sid) && ['before', 'after'].includes(String(value.position))
    case 'set_attr':
      return sid && string(value.name) && (string(value.value) || value.value === null)
    case 'set_style':
      return (
        sid &&
        object(value.styles) &&
        Object.values(value.styles).every((item) => string(item) || item === null)
      )
    case 'set_tag':
      return sid && string(value.tag)
    case 'set_text_node':
      return sid && integer(value.index) && value.index >= 0 && string(value.text)
    case 'wrap_text':
      return (
        sid &&
        integer(value.index) &&
        value.index >= 0 &&
        integer(value.start) &&
        integer(value.end) &&
        value.start >= 0 &&
        value.end > value.start &&
        string(value.tag) &&
        (value.attrs === undefined ||
          (object(value.attrs) && Object.values(value.attrs).every(string)))
      )
    default:
      return false
  }
}

function lineAt(text: string, offset: number): number {
  let line = 1
  for (let i = 0; i < Math.min(offset, text.length); i++) if (text[i] === '\n') line++
  return line
}

/** Owns the live source and version shared by direct typing, manual commands and AI. */
export class HtmlAgentHandle {
  readonly format = 'html'
  private doc: HtmlAgentDocument
  private readonly snapshots = new Map<string, { before: string; afterVersion: number }>()
  private readonly drafts = new Map<string, { text: string; baseVersion: number }>()
  constructor(
    readonly documentId: string,
    text: string,
    private readonly hooks: HtmlAgentHooks,
  ) {
    this.doc = { text, version: 1, map: buildParseMap(text, 1, null) }
  }
  getVersion(): number {
    return this.doc.version
  }
  getDocument(): HtmlAgentDocument {
    return this.doc
  }
  getContext(): Record<string, unknown> {
    return {
      documentId: this.documentId,
      version: this.doc.version,
      selectedSid: this.hooks.getSelectedSid(),
      outline: this.outline(3),
      sourceLength: this.doc.text.length,
    }
  }
  freezeSelection(): { sid: number | null; version: number } {
    return { sid: this.hooks.getSelectedSid(), version: this.doc.version }
  }
  setManualText(text: string): void {
    if (text !== this.doc.text) this.setDocument(text)
  }
  beginDraft(roundId: string): void {
    this.drafts.set(roundId, { text: '', baseVersion: this.doc.version })
  }
  appendDraft(roundId: string, delta: string): void {
    const draft = this.drafts.get(roundId)
    if (!draft) return
    if (draft.text.length + delta.length > 200_000) throw new Error('HTML 草稿超过 200000 字符限制')
    draft.text += delta
  }
  getDraft(roundId: string): string | null {
    return this.drafts.get(roundId)?.text ?? null
  }
  discardDraft(roundId: string): void {
    this.drafts.delete(roundId)
  }
  async commitDraft(
    roundId: string,
    options: { expectedVersion?: number; allowPartial?: boolean } = {},
  ): Promise<HtmlAgentResult> {
    const draft = this.drafts.get(roundId)
    if (!draft) return this.result(false, false, undefined, '没有可提交的 HTML 草稿。')
    if (
      draft.baseVersion !== this.doc.version ||
      (options.expectedVersion !== undefined && options.expectedVersion !== this.doc.version)
    )
      return this.result(false, false, undefined, '文档已改变，草稿未应用。')
    const html = draft.text.trim()
    if (
      !options.allowPartial &&
      (!/<!doctype\s|<html[\s>]/i.test(html) || !/<\/html>\s*$/i.test(html))
    )
      return this.result(false, false, undefined, 'HTML 草稿不完整，画布未修改。')
    this.drafts.delete(roundId)
    if (html === this.doc.text) return this.result(true, false, '页面没有变化。')
    if (!this.snapshots.has(roundId))
      this.snapshots.set(roundId, { before: this.doc.text, afterVersion: this.doc.version })
    this.hooks.replaceDoc(html, true)
    this.setDocument(html)
    this.snapshots.get(roundId)!.afterVersion = this.doc.version
    return this.result(
      true,
      true,
      options.allowPartial
        ? '用户已保留部分 HTML 草稿，页面尚不完整；请检查后手动保存。'
        : '完整 HTML 页面已写入画布，请手动保存。',
    )
  }
  private setDocument(text: string): void {
    const version = this.doc.version + 1
    this.doc = { text, version, map: buildParseMap(text, version, this.doc.map) }
    this.hooks.onDocument(this.doc)
  }
  private result(
    ok: boolean,
    changed: boolean,
    summary?: string,
    error?: string,
    data?: unknown,
  ): HtmlAgentResult {
    return {
      ok,
      changed,
      version: this.doc.version,
      ...(summary ? { summary } : {}),
      ...(error ? { error } : {}),
      ...(data === undefined ? {} : { data }),
    }
  }
  private outline(depth: number, fromSid?: number): string {
    const root = fromSid === undefined ? null : this.doc.map.bySid.get(fromSid)
    if (fromSid !== undefined && !root) return `sid ${fromSid} 不存在，请重新读取大纲。`
    const entries = this.doc.map.elements.filter((entry) =>
      root
        ? entry.range[0] >= root.range[0] &&
          entry.range[1] <= root.range[1] &&
          entry.depth - root.depth <= depth
        : entry.depth <= depth,
    )
    return (
      entries
        .slice(0, 100)
        .map(
          (entry) =>
            `L${lineAt(this.doc.text, entry.range[0])} sid=${entry.sid} ${'  '.repeat(Math.max(0, entry.depth - 1))}<${entry.tag}> ${this.doc.text
              .slice(entry.inner[0], entry.inner[1])
              .replace(/<[^>]*>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 60)}`,
        )
        .join('\n') + (entries.length > 100 ? '\n…（更多元素，请缩小范围）' : '')
    )
  }
  applyOps(
    rawOps: unknown,
    options: {
      expectedVersion?: number
      roundId?: string
      summary?: string
      highlight?: boolean
    } = {},
  ): HtmlAgentResult {
    if (options.expectedVersion !== undefined && options.expectedVersion !== this.doc.version)
      return this.result(false, false, undefined, '文档已改变，请重新读取源码。')
    if (
      !Array.isArray(rawOps) ||
      rawOps.length < 1 ||
      rawOps.length > 40 ||
      !rawOps.every(validateHtmlOp)
    )
      return this.result(false, false, undefined, '操作参数无效。')
    const compiled = compileOps(this.doc.text, this.doc.map, rawOps)
    if (compiled.errors.length)
      return this.result(
        false,
        false,
        undefined,
        compiled.errors.map((error) => `第 ${error.index + 1} 项：${error.message}`).join('；'),
      )
    const invalid = validatePatchSet(
      {
        patches: compiled.patches,
        baseVersion: this.doc.version,
        origin: 'ai',
        label: options.summary ?? 'HTML 编辑',
      },
      this.doc.version,
      this.doc.text.length,
    )
    if (invalid) return this.result(false, false, undefined, `补丁未应用：${invalid.kind}`)
    const next = applyPatches(this.doc.text, compiled.patches)
    if (next === this.doc.text) return this.result(true, false, '源码没有变化。')
    if (options.roundId && !this.snapshots.has(options.roundId))
      this.snapshots.set(options.roundId, { before: this.doc.text, afterVersion: this.doc.version })
    this.hooks.applyPatches(compiled.patches, options.highlight ?? true)
    this.setDocument(next)
    if (options.roundId) this.snapshots.get(options.roundId)!.afterVersion = this.doc.version
    return this.result(true, true, options.summary ?? `已应用 ${rawOps.length} 项 HTML 编辑。`)
  }
  async execute(
    tool: string,
    args: unknown,
    options: { expectedVersion?: number; roundId?: string; signal?: AbortSignal } = {},
  ): Promise<HtmlAgentResult> {
    if (options.signal?.aborted) return this.result(false, false, undefined, '已取消。')
    if (options.expectedVersion !== undefined && options.expectedVersion !== this.doc.version)
      return this.result(false, false, undefined, '文档已改变，请重新读取源码。')
    const input = object(args) ? args : {}
    if (tool === 'get_outline') {
      if (
        input.from_sid !== undefined &&
        (!integer(input.from_sid) || !this.doc.map.bySid.has(input.from_sid))
      )
        return this.result(false, false, undefined, '元素已变化，请重新读取大纲。')
      return this.result(true, false, undefined, undefined, {
        outline: this.outline(
          integer(input.depth) ? Math.min(12, Math.max(0, input.depth)) : 3,
          integer(input.from_sid) ? input.from_sid : undefined,
        ),
      })
    }
    if (tool === 'read_source') {
      let source = this.doc.text
      let firstLine = 1
      if (input.sid !== undefined) {
        if (!integer(input.sid)) return this.result(false, false, undefined, 'sid 必须是整数。')
        const entry = this.doc.map.bySid.get(input.sid)
        if (!entry) return this.result(false, false, undefined, '元素已变化，请重新读取大纲。')
        firstLine = lineAt(source, entry.range[0])
        source = source.slice(entry.range[0], entry.range[1])
      } else {
        const lines = source.split('\n')
        const start = integer(input.start_line) ? Math.max(1, input.start_line) : 1
        const end = integer(input.end_line)
          ? Math.min(lines.length, Math.max(start, input.end_line))
          : Math.min(lines.length, start + 199)
        firstLine = start
        source = lines.slice(start - 1, end).join('\n')
      }
      const page = integer(input.page) ? Math.max(0, input.page) : 0
      const offset = page * 12000
      const slice = source.slice(offset, (page + 1) * 12000)
      const pageFirstLine = firstLine + (source.slice(0, offset).match(/\n/g)?.length ?? 0)
      return this.result(true, false, undefined, undefined, {
        source: slice
          .split('\n')
          .map((line, i) => `${pageFirstLine + i}| ${line}`)
          .join('\n'),
        page,
        hasMore: (page + 1) * 12000 < source.length,
      })
    }
    if (tool === 'apply_ops')
      return this.applyOps(input.ops, {
        ...options,
        summary: string(input.summary) ? input.summary : undefined,
      })
    if (tool === 'ask_clarification') {
      const questions = input.questions
      if (
        !Array.isArray(questions) ||
        questions.length < 1 ||
        questions.length > 4 ||
        !questions.every(
          (question) =>
            object(question) &&
            string(question.id) &&
            string(question.label) &&
            Array.isArray(question.options) &&
            question.options.length > 0 &&
            question.options.length <= 5 &&
            question.options.every(string),
        )
      )
        return this.result(false, false, undefined, '问题格式无效。')
      if (!this.hooks.askClarification)
        return this.result(false, false, undefined, '当前界面没有可用的用户问答入口。')
      const response = await this.hooks.askClarification(questions as HtmlClarificationQuestion[])
      if (response.cancelled) return this.result(false, false, undefined, '用户跳过了问题。')
      return this.result(true, false, undefined, undefined, { answers: response.answers })
    }
    if (tool === 'plan_page') {
      if (
        !['new', 'redesign', 'restyle', 'extract'].includes(String(input.mode)) ||
        !string(input.instruction) ||
        !input.instruction.trim()
      )
        return this.result(false, false, undefined, '页面规划需要模式和用户要求。')
      if (!this.hooks.planPage || !this.hooks.confirmBrief)
        return this.result(false, false, undefined, '页面规划服务或确认入口尚未就绪。')
      const version = this.doc.version
      try {
        const mode = input.mode as 'new' | 'redesign' | 'restyle' | 'extract'
        const brief = await this.hooks.planPage({
          mode,
          instruction: input.instruction.slice(0, 4000),
          notes: string(input.notes) ? input.notes.slice(0, 2000) : undefined,
          currentSource: this.doc.text.slice(0, 8000),
          signal: options.signal,
        })
        if (this.doc.version !== version)
          return this.result(false, false, undefined, '规划期间文档已改变，未写入画布。')
        const confirmed = await this.hooks.confirmBrief(brief, mode)
        if (!confirmed) return this.result(false, false, undefined, '用户取消了页面规划。')
        if (mode === 'restyle' || mode === 'extract')
          return this.result(true, false, '已确认页面提纲；当前源码未改变。', undefined, {
            brief: confirmed,
          })
        if (!this.hooks.writeDocument)
          return this.result(false, false, undefined, '页面写作服务尚未就绪。')
        const written = await this.hooks.writeDocument({
          kind: 'design',
          instruction: input.instruction,
          brief: confirmed,
          signal: options.signal,
        })
        if (options.signal?.aborted)
          return this.result(false, false, undefined, '页面写作已取消，画布未修改。')
        if (!written.complete && !written.keptPartial)
          return this.result(false, false, undefined, '页面生成未完成，画布未修改。')
        const roundId = options.roundId ?? `page-${version}`
        this.beginDraft(roundId)
        this.appendDraft(roundId, written.html)
        const result = await this.commitDraft(roundId, {
          expectedVersion: version,
          allowPartial: !written.complete && written.keptPartial,
        })
        if (!result.ok) this.discardDraft(roundId)
        return result
      } catch (error) {
        return this.result(
          false,
          false,
          undefined,
          error instanceof Error ? error.message : '页面规划失败。',
        )
      }
    }
    if (tool === 'write_document') {
      if (!string(input.plan) || !input.plan.trim())
        return this.result(false, false, undefined, '长文写作需要计划。')
      if (!this.hooks.writeDocument)
        return this.result(false, false, undefined, '页面写作服务尚未就绪。')
      const version = this.doc.version
      try {
        const written = await this.hooks.writeDocument({
          kind: 'content',
          instruction: input.plan.slice(0, 4000),
          plan: input.plan.slice(0, 4000),
          title: string(input.title) ? input.title.slice(0, 200) : undefined,
          context: string(input.context) ? input.context.slice(0, 8000) : undefined,
          signal: options.signal,
        })
        if (options.signal?.aborted)
          return this.result(false, false, undefined, '页面写作已取消，画布未修改。')
        if (!written.complete && !written.keptPartial)
          return this.result(false, false, undefined, '页面生成未完成，画布未修改。')
        const roundId = options.roundId ?? `document-${version}`
        this.beginDraft(roundId)
        this.appendDraft(roundId, written.html)
        const result = await this.commitDraft(roundId, {
          expectedVersion: version,
          allowPartial: !written.complete && written.keptPartial,
        })
        if (!result.ok) this.discardDraft(roundId)
        return result
      } catch (error) {
        return this.result(
          false,
          false,
          undefined,
          error instanceof Error ? error.message : '页面写作失败。',
        )
      }
    }
    return this.result(false, false, undefined, `HTML 工具 ${tool} 尚未接入。`)
  }
  undoRound(roundId: string): boolean {
    const snapshot = this.snapshots.get(roundId)
    if (!snapshot || snapshot.afterVersion !== this.doc.version) return false
    this.hooks.replaceDoc(snapshot.before, false)
    this.setDocument(snapshot.before)
    this.snapshots.delete(roundId)
    return true
  }
}
