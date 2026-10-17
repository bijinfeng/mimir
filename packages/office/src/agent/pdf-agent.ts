import { pdfBatchArgsSchema } from '@mimir/shared'
import { PDF_LOCAL_TOOLS } from './pdf-local-agent.js'
import { PDF_CONTENT_TOOLS } from './pdf-content-agent.js'
import { searchPdfText, type PdfTextIndex } from '../editors/pdf-text.js'
import { withRotation, type PdfPageRef } from '../editors/pdf-pages.js'

/** Only these upstream operations currently share Mimir's manual page executor. */
export const PDF_PAGE_AGENT_OPS = ['rotatePages', 'deletePage', 'setPageOrder'] as const

export interface PdfAgentSnapshot {
  bytes: Uint8Array
  pages: readonly PdfPageRef[]
  activePage: number
  dirty: boolean
}

export interface PdfAgentHooks {
  snapshot(): PdfAgentSnapshot | null
  applyPages(pages: PdfPageRef[]): void
  gotoPage(index: number): void
  textIndex(): Promise<PdfTextIndex>
  insertText(
    input: PdfAgentTextInsert,
    expectedVersion: number,
    signal?: AbortSignal,
  ): Promise<PdfPendingTextInsert>
  pendingTextInserts(): readonly PdfPendingTextInsert[]
  replaceTextInserts(
    inserts: readonly PdfPendingTextInsert[],
    expectedVersion: number,
    signal?: AbortSignal,
  ): Promise<void>
  contentTool?(
    tool: string,
    args: Record<string, unknown>,
    version: number,
    signal?: AbortSignal,
    manual?: boolean,
  ): Promise<{ changed: boolean; data?: unknown }>
  captureState(): unknown
  restoreState(state: unknown): void
}

export interface PdfAgentTextInsert {
  pageIndex: number
  x?: number
  y?: number
  origin?: [number, number]
  text: string
  fontSize: number
  color: [number, number, number]
}

/** A block added since the last save. Coordinates use the displayed page's top-left. */
export interface PdfPendingTextInsert {
  id: string
  pageIndex: number
  x: number
  y: number
  text: string
  fontSize: number
  color: [number, number, number]
}

interface AgentResult {
  ok: boolean
  changed: boolean
  version: number
  summary?: string
  error?: string
  data?: unknown
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('参数必须是对象')
  return value as Record<string, unknown>
}

function pageNumber(value: unknown, total: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > total)
    throw new Error(`页号必须在 1–${total} 之间`)
  return value - 1
}

function pageNumbers(value: unknown, total: number): number[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > total)
    throw new Error('pages 必须是非空页号数组')
  const pages = value.map((entry) => pageNumber(entry, total))
  if (new Set(pages).size !== pages.length) throw new Error('pages 不能包含重复页号')
  return pages
}

function applyPageOp(pages: PdfPageRef[], raw: unknown): PdfPageRef[] {
  const op = record(raw)
  switch (op.op) {
    case 'rotatePages': {
      if (op.dir !== 90 && op.dir !== -90 && op.dir !== 180)
        throw new Error('rotatePages.dir 只能是 90、-90 或 180')
      const targets = new Set(pageNumbers(op.pages, pages.length))
      return pages.map((page, index) =>
        targets.has(index) ? withRotation(page, op.dir as number) : page,
      )
    }
    case 'deletePage': {
      if (pages.length <= 1) throw new Error('PDF 至少保留一页')
      const index = pageNumber(op.page, pages.length)
      return pages.filter((_, position) => position !== index)
    }
    case 'setPageOrder': {
      if (op.order === null) throw new Error('恢复文件页序须由手动撤销执行')
      const order = pageNumbers(op.order, pages.length)
      if (order.length !== pages.length) throw new Error('页序必须包含当前全部页面')
      return order.map((position) => pages[position]!)
    }
    default:
      throw new Error(`PDF 操作 ${String(op.op)} 尚未接入执行器`)
  }
}

/** Live page handle: manual commands and Agent publish into the same PdfEditor state. */
export class PdfAgentHandle {
  readonly format = 'pdf'
  private version = 1
  private disposed = false
  private textCache: { version: number; value: Promise<PdfTextIndex> } | null = null
  private readonly rounds = new Map<string, { beforeState: unknown; afterVersion: number }>()

  constructor(
    readonly documentId: string,
    private readonly hooks: PdfAgentHooks,
  ) {}

  getVersion(): number {
    return this.version
  }

  getContext(): Record<string, unknown> {
    const snapshot = this.hooks.snapshot()
    return {
      documentId: this.documentId,
      version: this.version,
      pageCount: snapshot?.pages.length ?? 0,
      currentPage: snapshot ? snapshot.activePage + 1 : 0,
      dirty: snapshot?.dirty ?? false,
      pageRotations: snapshot?.pages.map((page) => page.rotation) ?? [],
    }
  }

  freezeSelection(): Record<string, unknown> {
    const snapshot = this.hooks.snapshot()
    return { page: snapshot ? snapshot.activePage + 1 : 0, version: this.version }
  }

  markManualChange(): void {
    if (this.disposed) return
    this.version++
    this.textCache = null
    // A manual edit must never be removed by an earlier Agent round rollback.
    this.rounds.clear()
  }

  dispose(): void {
    this.disposed = true
    this.rounds.clear()
    this.textCache = null
  }

  private result(
    ok: boolean,
    changed: boolean,
    summary?: string,
    error?: string,
    data?: unknown,
  ): AgentResult {
    return { ok, changed, version: this.version, summary, error, data }
  }

  private indexed(): Promise<PdfTextIndex> {
    if (this.textCache?.version === this.version) return this.textCache.value
    const value = this.hooks.textIndex()
    this.textCache = { version: this.version, value }
    return value
  }

  async execute(
    tool: string,
    args: unknown,
    options: {
      expectedVersion?: number
      roundId?: string
      signal?: AbortSignal
      manual?: boolean
    } = {},
  ): Promise<AgentResult> {
    try {
      if (this.disposed) throw new Error('PDF 画布已关闭')
      if (options.signal?.aborted) throw new Error('操作已取消')
      if (options.expectedVersion !== undefined && options.expectedVersion !== this.version)
        throw new Error('PDF 画布版本已变化，请重新读取')
      const snapshot = this.hooks.snapshot()
      if (!snapshot) throw new Error('PDF 原件尚未读取完成')
      const input: Record<string, unknown> =
        tool === 'apply_ops' ? pdfBatchArgsSchema.parse(args) : record(args)

      if (tool === 'goto_page') {
        const page = pageNumber(input.page, snapshot.pages.length)
        this.hooks.gotoPage(page)
        return this.result(true, false, `已跳到第 ${page + 1} 页`)
      }

      if (tool === 'list_inserted_text') {
        const page = input.page === undefined ? null : pageNumber(input.page, snapshot.pages.length)
        const inserts = this.hooks
          .pendingTextInserts()
          .filter((insert) => page === null || insert.pageIndex === page)
          .map((insert) => ({
            id: insert.id,
            page: insert.pageIndex + 1,
            x: insert.x,
            y: insert.y,
            text: insert.text,
            font_size: insert.fontSize,
          }))
        return this.result(true, false, undefined, undefined, { inserts })
      }

      if (tool === 'read_pages' || tool === 'search_text') {
        const startingVersion = this.version
        const index = await this.indexed()
        if (this.disposed || options.signal?.aborted) throw new Error('读取已取消')
        if (this.version !== startingVersion) throw new Error('PDF 画布版本已变化，请重新读取')
        if (tool === 'read_pages') {
          const start = pageNumber(input.start, snapshot.pages.length)
          const end = input.end === undefined ? start : pageNumber(input.end, snapshot.pages.length)
          if (end < start || end - start >= 10) throw new Error('一次最多读取连续 10 页')
          const selected = index.pages.slice(start, end + 1)
          const content = selected
            .map((page, offset) => `[Page ${start + offset + 1}]\n${page.text}`)
            .join('\n\n')
          return this.result(true, false, undefined, undefined, {
            text: content.slice(0, 24_000),
            truncated: content.length > 24_000,
            pagesWithText: selected.filter((page) => page.text.trim()).length,
          })
        }
        if (typeof input.query !== 'string' || !input.query.trim() || input.query.length > 200)
          throw new Error('query 必须是 1–200 字符的文字')
        const matches = searchPdfText(index, input.query, { matchCase: false, wholeWord: false })
        return this.result(true, false, undefined, undefined, {
          total: matches.length,
          matches: matches
            .slice(0, 30)
            .map((match) => ({ page: match.page + 1, text: match.text })),
        })
      }

      if (
        (PDF_CONTENT_TOOLS as readonly string[]).includes(tool) ||
        (PDF_LOCAL_TOOLS as readonly string[]).includes(tool) ||
        (tool === 'apply_ops' &&
          Array.isArray(input.ops) &&
          (this.hooks.pendingTextInserts().length > 0 ||
            input.ops.some(
              (op) =>
                op &&
                typeof op === 'object' &&
                !PDF_PAGE_AGENT_OPS.includes(op.op as (typeof PDF_PAGE_AGENT_OPS)[number]),
            )))
      ) {
        if (
          [
            'add_visual_signature',
            'transform_visual_signature',
            'delete_visual_signature',
          ].includes(tool) &&
          !options.manual
        )
          throw new Error('视觉签名仅可由用户手动创建和调整')
        if (!this.hooks.contentTool) throw new Error('PDF 内容执行器尚未连接')
        const startingVersion = this.version
        const checkpoint = options.roundId ? this.rounds.get(options.roundId) : undefined
        const beforeState = checkpoint ? undefined : this.hooks.captureState()
        const result = await this.hooks.contentTool(
          tool,
          input,
          startingVersion,
          options.signal,
          options.manual,
        )
        if (this.disposed || options.signal?.aborted || this.version !== startingVersion)
          throw new Error('PDF 画布已变化，结果未应用')
        if (result.changed) {
          if (options.roundId && !checkpoint)
            this.rounds.set(options.roundId, { beforeState, afterVersion: startingVersion + 1 })
          this.version++
          if (checkpoint) checkpoint.afterVersion = this.version
          this.textCache = null
          if (options.manual) this.rounds.clear()
        }
        return this.result(
          true,
          result.changed,
          result.changed ? '已更新 PDF 画布，尚未保存' : undefined,
          undefined,
          result.data,
        )
      }

      if (tool === 'insert_text') {
        const pageIndex = pageNumber(input.page, snapshot.pages.length)
        if (input.origin !== undefined && !options.manual)
          throw new Error('Agent 插入文字须提供页面左上角起算的 x/y 坐标')
        if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 10_000)
          throw new Error('text 必须是 1–10000 字符的文字')
        const origin =
          Array.isArray(input.origin) &&
          input.origin.length === 2 &&
          input.origin.every((value) => typeof value === 'number' && Number.isFinite(value))
            ? (input.origin as [number, number])
            : undefined
        if (
          !origin &&
          (typeof input.x !== 'number' ||
            !Number.isFinite(input.x) ||
            typeof input.y !== 'number' ||
            !Number.isFinite(input.y))
        )
          throw new Error('x/y 必须是页面左上角起算的有限坐标')
        const fontSize = input.font_size === undefined ? 14 : input.font_size
        if (
          typeof fontSize !== 'number' ||
          !Number.isFinite(fontSize) ||
          fontSize <= 0 ||
          fontSize > 500
        )
          throw new Error('font_size 必须在 0–500 pt 之间')
        const colorValue = input.color === undefined ? '#000000' : input.color
        if (typeof colorValue !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(colorValue))
          throw new Error('color 必须是 #RRGGBB')
        const color = [1, 3, 5].map((at) => parseInt(colorValue.slice(at, at + 2), 16) / 255) as [
          number,
          number,
          number,
        ]
        const startingVersion = this.version
        const checkpoint = options.roundId ? this.rounds.get(options.roundId) : undefined
        const beforeState = checkpoint ? undefined : this.hooks.captureState()
        const inserted = await this.hooks.insertText(
          {
            pageIndex,
            x: origin ? undefined : (input.x as number),
            y: origin ? undefined : (input.y as number),
            origin,
            text: input.text,
            fontSize,
            color,
          },
          startingVersion,
          options.signal,
        )
        if (this.disposed || options.signal?.aborted || this.version !== startingVersion)
          throw new Error('PDF 画布已变化，插入结果未应用')
        if (options.roundId && !checkpoint)
          this.rounds.set(options.roundId, { beforeState, afterVersion: startingVersion + 1 })
        this.version++
        if (checkpoint) checkpoint.afterVersion = this.version
        this.textCache = null
        if (options.manual) this.rounds.clear()
        return this.result(true, true, `已在第 ${pageIndex + 1} 页插入文字`, undefined, {
          id: inserted.id,
        })
      }

      if (
        tool === 'edit_inserted_text' ||
        tool === 'move_inserted_text' ||
        tool === 'delete_inserted_text'
      ) {
        if (typeof input.id !== 'string' || !/^T[a-zA-Z0-9-]{1,80}$/.test(input.id))
          throw new Error('id 必须是待保存插字的标识')
        const inserts = this.hooks.pendingTextInserts()
        const position = inserts.findIndex((insert) => insert.id === input.id)
        if (position < 0) throw new Error('找不到这段待保存文字；保存后请使用原文编辑工具')
        const current = inserts[position]!
        let next: PdfPendingTextInsert[]
        if (tool === 'delete_inserted_text') {
          next = inserts.filter((insert) => insert.id !== input.id)
        } else if (tool === 'edit_inserted_text') {
          if (
            input.text === undefined &&
            input.font_size === undefined &&
            input.color === undefined
          )
            throw new Error('请至少提供 text、font_size 或 color')
          const nextText = input.text === undefined ? current.text : input.text
          if (typeof nextText !== 'string' || !nextText.trim() || nextText.length > 10_000)
            throw new Error('text 必须是 1–10000 字符的文字')
          const fontSize = input.font_size === undefined ? current.fontSize : input.font_size
          if (
            typeof fontSize !== 'number' ||
            !Number.isFinite(fontSize) ||
            fontSize <= 0 ||
            fontSize > 500
          )
            throw new Error('font_size 必须在 0–500 pt 之间')
          const colorValue = input.color
          if (
            colorValue !== undefined &&
            (typeof colorValue !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(colorValue))
          )
            throw new Error('color 必须是 #RRGGBB')
          const color =
            colorValue === undefined
              ? current.color
              : ([1, 3, 5].map(
                  (offset) => parseInt(colorValue.slice(offset, offset + 2), 16) / 255,
                ) as [number, number, number])
          next = [...inserts]
          next[position] = { ...current, text: nextText, fontSize, color }
        } else {
          const absolute = input.x !== undefined || input.y !== undefined
          const relative = input.dx !== undefined || input.dy !== undefined
          if (absolute === relative) throw new Error('请提供 x/y 或 dx/dy，不能混用')
          for (const value of [input.x, input.y, input.dx, input.dy])
            if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value)))
              throw new Error('位置参数必须是有限数字')
          const x = absolute
            ? ((input.x as number | undefined) ?? current.x)
            : current.x + ((input.dx as number | undefined) ?? 0)
          const y = absolute
            ? ((input.y as number | undefined) ?? current.y)
            : current.y + ((input.dy as number | undefined) ?? 0)
          if (x < 0 || y < 0) throw new Error('插入位置不能超出页面左上角')
          next = [...inserts]
          next[position] = { ...current, x, y }
        }
        const startingVersion = this.version
        const checkpoint = options.roundId ? this.rounds.get(options.roundId) : undefined
        const beforeState = checkpoint ? undefined : this.hooks.captureState()
        await this.hooks.replaceTextInserts(next, startingVersion, options.signal)
        if (this.disposed || options.signal?.aborted || this.version !== startingVersion)
          throw new Error('PDF 画布已变化，插字修改未应用')
        if (options.roundId && !checkpoint)
          this.rounds.set(options.roundId, { beforeState, afterVersion: startingVersion + 1 })
        this.version++
        if (checkpoint) checkpoint.afterVersion = this.version
        this.textCache = null
        if (options.manual) this.rounds.clear()
        return this.result(
          true,
          true,
          `已${tool === 'edit_inserted_text' ? '编辑' : tool === 'move_inserted_text' ? '移动' : '删除'}待保存文字 ${input.id}`,
        )
      }

      if (tool === 'apply_ops') {
        if (!Array.isArray(input.ops) || input.ops.length < 1 || input.ops.length > 30)
          throw new Error('PDF 页面操作批次必须包含 1–30 项')
        if (input.dry_run !== undefined && typeof input.dry_run !== 'boolean')
          throw new Error('dry_run 必须是布尔值')
        let pages = [...snapshot.pages]
        for (const raw of input.ops) pages = applyPageOp(pages, raw)
        if (options.signal?.aborted) throw new Error('操作已取消')
        if (options.expectedVersion !== undefined && options.expectedVersion !== this.version)
          throw new Error('PDF 画布版本已变化，请重新读取')
        if (input.dry_run === true) return this.result(true, false, '页面操作预检通过')
        if (options.roundId && !this.rounds.has(options.roundId))
          this.rounds.set(options.roundId, {
            beforeState: this.hooks.captureState(),
            afterVersion: this.version + 1,
          })
        this.hooks.applyPages(pages)
        this.version++
        const checkpoint = options.roundId ? this.rounds.get(options.roundId) : undefined
        if (checkpoint) checkpoint.afterVersion = this.version
        this.textCache = null
        return this.result(true, true, `已执行 ${input.ops.length} 项页面操作`)
      }
      throw new Error(`PDF 工具 ${tool} 尚未接入执行器`)
    } catch (cause) {
      return this.result(
        false,
        false,
        undefined,
        cause instanceof Error ? cause.message : String(cause),
      )
    }
  }

  undoRound(roundId: string): boolean {
    const checkpoint = this.rounds.get(roundId)
    if (!checkpoint || this.disposed || checkpoint.afterVersion !== this.version) return false
    this.rounds.delete(roundId)
    this.hooks.restoreState(checkpoint.beforeState)
    this.version++
    this.textCache = null
    return true
  }
}
