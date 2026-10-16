import type { Editor } from '@tiptap/core'
import type { JSONContent } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import {
  blockIndexRange,
  runOps,
  usesBlockIndexes,
  validateOps,
  type FrontmatterAccess,
  type MdOp,
} from './markdown-ops.js'
import '../editors/markdown-dialect.js'

export interface MarkdownAgentResult {
  ok: boolean
  changed: boolean
  version: number
  summary?: string
  error?: string
  data?: unknown
}

export interface MarkdownAgentServices {
  fetchImage(url: string, signal?: AbortSignal): Promise<{ dataUrl: string; mimeType: string }>
  generateImage(
    prompt: string,
    signal?: AbortSignal,
  ): Promise<{ dataUrl: string; mimeType: string }>
  uploadImage(file: File): Promise<{ url: string; name: string }>
  writeDocument(
    input: { plan: string; title?: string; context?: string },
    signal?: AbortSignal,
    onDelta?: (text: string) => void,
  ): Promise<string | { markdown: string; keptPartial: true }>
  readFrontmatter(): Promise<string>
  writeFrontmatter(yaml: string, expectedYaml: string): Promise<string>
}

interface FrozenSelection {
  from: number
  to: number
  startIndex: number
  endIndex: number
  text: string
}
interface Round {
  content: JSONContent
  version: number
  dirtyBefore: boolean
  selection: FrozenSelection
  frontmatterBefore?: string
  frontmatterAfter?: string
}

function validRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}
function integer(value: unknown, name: string, min: number, max: number): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max)
    throw new Error(`${name} 必须在 ${min}–${max} 之间`)
  return value as number
}
function string(value: unknown, name: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new Error(`${name} 不能为空且不能超过 ${max} 字符`)
  return value.trim()
}
function isBlank(editor: Editor): boolean {
  const doc = editor.state.doc
  return (
    doc.childCount === 1 && doc.firstChild?.type.name === 'paragraph' && !doc.firstChild.textContent
  )
}
function blockMarkdown(editor: Editor, start: number, end: number): string {
  const content: JSONContent[] = []
  editor.state.doc.forEach((node, _pos, index) => {
    if (index >= start && index <= end) content.push(node.toJSON() as JSONContent)
  })
  return editor.markdown?.serialize({ type: 'doc', content }) ?? ''
}
function selectionOf(editor: Editor): FrozenSelection {
  const { from, to } = editor.state.selection
  const { startIndex, endIndex } = blockIndexRange(editor.state.doc, from, to)
  return {
    from,
    to,
    startIndex,
    endIndex,
    text: from === to ? '' : editor.state.doc.textBetween(from, to, '\n').slice(0, 4000),
  }
}
function contextOf(editor: Editor, version: number, frozen?: FrozenSelection) {
  const blocks: Array<{ index: number; type: string; text: string }> = []
  editor.state.doc.forEach((node, _pos, index) =>
    blocks.push({
      index,
      type: node.type.name === 'heading' ? `h${node.attrs.level}` : node.type.name,
      text: node.textContent.slice(0, 200),
    }),
  )
  return {
    version,
    blocks: blocks.slice(0, 200),
    blockCount: blocks.length,
    selection: frozen ?? selectionOf(editor),
    markdown: editor.getMarkdown().slice(0, 8000),
  }
}
function imageFile(dataUrl: string, mimeType: string): File {
  if (!/^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/s.test(dataUrl))
    throw new Error('图片服务返回了无效的图片')
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  if (base64.length > 12_000_000) throw new Error('图片超过 8 MB 限制')
  const bytes = Uint8Array.from(atob(base64), (part) => part.charCodeAt(0))
  const ext = mimeType === 'image/jpeg' ? 'jpg' : mimeType.slice(6)
  return new File([bytes], `agent-image.${ext}`, { type: mimeType })
}

/** One handle per live note editor. Manual and Agent edits share this exact Tiptap document. */
export function createMarkdownAgentHandle(
  editor: Editor,
  documentId: string,
  options: {
    isDirty(): boolean
    onDirtyChange(dirty: boolean): void
    frontmatter?: FrontmatterAccess
    services?: MarkdownAgentServices
    flushBody?: () => Promise<boolean>
  },
) {
  let version = 0
  let disposed = false
  let frozen: FrozenSelection | null = null
  const rounds = new Map<string, Round>()
  const onTransaction = ({ transaction }: { transaction: { docChanged: boolean } }) => {
    if (transaction.docChanged) version += 1
  }
  editor.on('transaction', onTransaction)
  const live = (signal?: AbortSignal) => {
    if (disposed || editor.isDestroyed) throw new Error('笔记编辑器已关闭，请重新打开笔记')
    if (signal?.aborted) throw new Error('工具调用已停止')
  }
  const result = (summary: string, before: number, data?: unknown): MarkdownAgentResult => ({
    ok: true,
    changed: version > before,
    version,
    summary,
    ...(data === undefined ? {} : { data }),
  })
  const fail = (error: unknown): MarkdownAgentResult => ({
    ok: false,
    changed: false,
    version,
    error: error instanceof Error ? error.message : String(error),
  })
  const markRound = (roundId: string | undefined) => {
    if (roundId && !rounds.has(roundId))
      rounds.set(roundId, {
        content: editor.getJSON(),
        version,
        dirtyBefore: options.isDirty(),
        selection: frozen ?? selectionOf(editor),
      })
  }
  const finishWrite = (roundId: string | undefined) => {
    if (roundId) {
      const round = rounds.get(roundId)
      if (round) round.version = version
    }
    options.onDirtyChange(true)
  }
  const insertImage = async (
    args: Record<string, unknown>,
    mode: 'fetch' | 'generate',
    signal?: AbortSignal,
    roundId?: string,
  ): Promise<MarkdownAgentResult> => {
    if (!options.services) throw new Error('当前笔记未配置图片服务')
    const baseline = version
    const source =
      mode === 'fetch'
        ? await options.services.fetchImage(string(args.url, 'url', 2000), signal)
        : await options.services.generateImage(string(args.prompt, 'prompt', 2000), signal)
    live(signal)
    if (version !== baseline) throw new Error('下载期间笔记已修改，图片未插入')
    const file = imageFile(source.dataUrl, source.mimeType)
    const uploaded = await options.services.uploadImage(file)
    live(signal)
    if (version !== baseline) throw new Error('上传期间笔记已修改，图片未插入')
    const after =
      args.afterIndex === undefined
        ? editor.state.doc.childCount - 1
        : integer(args.afterIndex, 'afterIndex', -1, editor.state.doc.childCount - 1)
    const before = version
    markRound(roundId)
    const applied = runOps(
      editor,
      [
        {
          op: 'insertImage',
          after,
          src: uploaded.url,
          alt: typeof args.alt === 'string' ? args.alt.slice(0, 500) : uploaded.name,
        },
      ],
      { source: 'ai' },
    )
    const first = applied.results[0]
    if (!first?.ok) throw new Error(first?.error ?? '插入图片失败')
    finishWrite(roundId)
    return result('已插入图片', before, { imageUrl: uploaded.url })
  }
  return {
    format: 'markdown' as const,
    documentId,
    getVersion: () => version,
    getContext: () => {
      live()
      return contextOf(editor, version, frozen ?? undefined)
    },
    freezeSelection(roundId?: string) {
      live()
      frozen = selectionOf(editor)
      if (roundId)
        rounds.set(roundId, {
          content: editor.getJSON(),
          version,
          dirtyBefore: options.isDirty(),
          selection: frozen,
        })
      return frozen
    },
    async execute(
      tool: string,
      raw: unknown,
      execution: { expectedVersion?: number; roundId?: string; signal?: AbortSignal } = {},
    ): Promise<MarkdownAgentResult> {
      try {
        live(execution.signal)
        if (execution.expectedVersion !== undefined && execution.expectedVersion !== version)
          throw new Error('笔记已被修改，请重新读取当前画布后再编辑')
        const args = validRecord(raw)
        if (!args) throw new Error('工具参数必须是对象')
        const before = version
        const roundId = execution.roundId
        if (tool === 'get_document_context')
          return result('已读取笔记结构', before, contextOf(editor, version, frozen ?? undefined))
        if (tool === 'read_blocks') {
          const start = integer(args.startIndex, 'startIndex', 0, editor.state.doc.childCount - 1)
          const end = integer(args.endIndex, 'endIndex', start, editor.state.doc.childCount - 1)
          const offset =
            args.offset === undefined ? 0 : integer(args.offset, 'offset', 0, 1_000_000)
          const full = blockMarkdown(editor, start, end)
          return result('已读取笔记块', before, {
            markdown: full.slice(offset, offset + 24_000),
            nextOffset: offset + 24_000 < full.length ? offset + 24_000 : null,
          })
        }
        if (tool === 'read_frontmatter') {
          if (!options.services) throw new Error('当前笔记不支持 frontmatter')
          return result('已读取 frontmatter', before, {
            yaml: await options.services.readFrontmatter(),
          })
        }
        if (tool === 'apply_ops') {
          const parsed = validateOps(args.ops)
          if ('error' in parsed) throw new Error(parsed.error)
          if (parsed.ops.some((op) => op.op === 'setFrontmatter')) {
            if (parsed.ops.length !== 1 || parsed.ops[0]?.op !== 'setFrontmatter')
              throw new Error('frontmatter 元数据修改需要独立批次')
            if (!options.services) throw new Error('当前笔记不支持 frontmatter')
            if (options.flushBody && !(await options.flushBody()))
              throw new Error('正文保存失败，frontmatter 未修改')
            live(execution.signal)
            if (version !== before) throw new Error('保存期间笔记已修改，请重新读取画布')
            const oldYaml = await options.services.readFrontmatter()
            live(execution.signal)
            if (version !== before) throw new Error('读取元数据期间笔记已修改')
            markRound(roundId)
            const round = roundId ? rounds.get(roundId) : undefined
            if (round && round.frontmatterBefore === undefined) round.frontmatterBefore = oldYaml
            const writtenYaml = await options.services.writeFrontmatter(parsed.ops[0].yaml, oldYaml)
            if (round) round.frontmatterAfter = writtenYaml
            version += 1
            if (round) round.version = version
            return result('已更新笔记 frontmatter 元数据', before)
          }
          for (const op of parsed.ops) {
            if (
              op.op === 'insertImage' &&
              !/^\/(?:[^/?#]+\/)*api\/documents\/[A-Za-z0-9_-]+\/file(?:\?[^#]*)?$/.test(op.src)
            )
              throw new Error(
                'insertImage 仅接受已上传到 Mimir 的图片地址；远程图片请使用 insert_image',
              )
            if (
              op.op === 'setLink' &&
              op.href !== null &&
              !/^(https?:\/\/|mailto:|\/doc\/)/i.test(op.href)
            )
              throw new Error('链接仅支持 HTTP(S)、邮件或 Mimir 笔记地址')
          }
          if (usesBlockIndexes(parsed.ops) && execution.expectedVersion === undefined)
            throw new Error('按块索引编辑需要当前画布版本')
          if (
            frozen &&
            parsed.ops.some((op: MdOp) => 'target' in op && op.target === 'selection')
          ) {
            const { from, to } = frozen
            editor.view.dispatch(
              editor.state.tr.setSelection(
                TextSelection.between(
                  editor.state.doc.resolve(Math.min(from, editor.state.doc.content.size)),
                  editor.state.doc.resolve(Math.min(to, editor.state.doc.content.size)),
                ),
              ),
            )
          }
          markRound(roundId)
          const applied = runOps(editor, parsed.ops, {
            source: 'ai',
            frontmatter: options.frontmatter,
          })
          if (applied.applied > 0 && version > before) finishWrite(roundId)
          const lines = applied.results.map((entry, index) =>
            entry.ok
              ? `ops[${index}] ${parsed.ops[index]?.op}: ${entry.message}`
              : `ops[${index}] ${parsed.ops[index]?.op}: ${entry.error}`,
          )
          if (applied.applied < parsed.ops.length)
            return {
              ok: false,
              changed: version > before,
              version,
              error: lines.join('\n'),
              data: { applied: applied.applied, results: applied.results },
            }
          return result(lines.join('\n'), before, {
            applied: applied.applied,
            blocksChanged: applied.blocksChanged,
          })
        }
        if (tool === 'insert_image' || tool === 'generate_image') {
          return await insertImage(
            args,
            tool === 'insert_image' ? 'fetch' : 'generate',
            execution.signal,
            roundId,
          )
        }
        if (tool === 'write_document') {
          if (!options.services) throw new Error('当前笔记未配置长文写作服务')
          const plan = string(args.plan, 'plan', 8000)
          const after =
            args.afterIndex === undefined
              ? null
              : integer(args.afterIndex, 'afterIndex', -1, editor.state.doc.childCount - 1)
          if (!isBlank(editor) && after === null && args.replaceDocument !== true)
            throw new Error('已有正文需要 afterIndex，整篇重写需要 replaceDocument=true')
          const written = await options.services.writeDocument(
            {
              plan,
              ...(typeof args.title === 'string' ? { title: args.title.slice(0, 160) } : {}),
              ...(typeof args.context === 'string'
                ? { context: args.context.slice(0, 20_000) }
                : {}),
            },
            execution.signal,
          )
          const markdown = typeof written === 'string' ? written : written.markdown
          live(execution.signal)
          if (version !== before) throw new Error('写作期间笔记已被修改，新内容未插入')
          if (!markdown.trim()) throw new Error('写作服务没有返回正文')
          markRound(roundId)
          const op: MdOp =
            after === null && !isBlank(editor)
              ? {
                  op: 'replaceBlocks',
                  target: { start: 0, end: editor.state.doc.childCount - 1 },
                  markdown,
                }
              : { op: 'insertContent', after: after ?? -1, markdown }
          const applied = runOps(editor, [op], { source: 'ai' })
          const first = applied.results[0]
          if (!first?.ok) throw new Error(first?.error ?? '写入失败')
          finishWrite(roundId)
          if (typeof written !== 'string') editor.commands.focus()
          return result(
            typeof written === 'string' ? '已写入长文' : '已按选择保留部分草稿；正文尚未完成',
            before,
            { characters: markdown.length, complete: typeof written === 'string' },
          )
        }
        throw new Error(`不支持的笔记工具：${tool}`)
      } catch (error) {
        return fail(error)
      }
    },
    async undoRound(roundId: string): Promise<boolean> {
      live()
      const round = rounds.get(roundId)
      if (!round || round.version !== version) return false
      rounds.delete(roundId)
      if (round.frontmatterBefore !== undefined) {
        if (!options.services) return false
        if (!round.frontmatterAfter) return false
        await options.services.writeFrontmatter(round.frontmatterBefore, round.frontmatterAfter)
      }
      editor.commands.setContent(round.content)
      options.onDirtyChange(round.dirtyBefore)
      return true
    },
    markSaved() {
      rounds.clear()
    },
    dispose() {
      disposed = true
      editor.off('transaction', onTransaction)
      rounds.clear()
    },
  }
}
export type MarkdownAgentHandle = ReturnType<typeof createMarkdownAgentHandle>
