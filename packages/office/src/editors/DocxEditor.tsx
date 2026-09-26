/**
 * docx 的原件编辑器。
 *
 * ## 一条路：vendored 引擎 + 补丁式保存
 *
 * 1. 宿主给原件字节（`io.load`）
 * 2. vendored 的 GenOffice 引擎解析 → ProseMirror 文档 → Tiptap 渲染
 * 3. 用户编辑 → `pmDocToSavePlan` 生成补丁 → **只把改动的块写回**
 * 4. 新字节交回宿主（`io.save`），服务端重算正文与哈希
 *
 * 第 3 步是关键：补丁式保存让「改两个字」不会重排整篇 XML，因此不会丢掉
 * Word 文档里那些我们没建模的东西（域代码、修订标记、OLE 对象）。
 * 实测（`packages/office/src/docx.test.ts`）：原样保存 zip 条目逐字节相同；
 * 改一段只有 `word/document.xml` 变化。
 *
 * ## 工具栏为什么常驻顶栏
 *
 * 笔记编辑器（`InlineToolbar`）用气泡菜单——跟随选区，适合「写完再调格式」。
 * Word 的习惯是**顶栏常驻**：Office 文档的格式是边写边调的，而且要能一眼
 * 看到光标处当前的格式状态。用气泡的话每次都要先选中才看得到工具。
 *
 * ## 命令必须用 `toggleMark('bold')` 而不是 `toggleBold()`
 *
 * **踩过**：`toggleBold()` 这些是 `@tiptap/extension-bold` 之类的扩展提供的
 * 便捷命令，而 vendored 的编辑器没有用那些扩展——它自己定义了
 * `Mark.create({ name: 'bold' })`，只注册了 `commands.toggleMark('bold')`。
 * 所以调 `toggleBold()` 是**静默无效**：命令不存在，`chain()` 照样返回成功，
 * 只是什么都不做。实测症状是「点了加粗，没有反应，也不报错」。
 *
 * ## 列表：不能调 `toggleList`，要自己改节点
 *
 * 这份编辑器的列表**不是标准的「listItem 嵌在 bulletList 里」结构**，
 * 而是扁平的块节点 `docListItem`（带 `kind` 与 `numId`，对应 docx 真实的
 * 「段落 + `w:numPr`」形状）。所以 `toggleList('bulletList', 'listItem')`
 * 在这里没有对应节点，调了无效，正确做法是改节点类型与属性。
 *
 * `numId` 沿用文档里已有的同类列表（新建编号定义要写 `numbering.xml`，
 * 那件事在保存路径上，本版没做）。
 */

import { EditorContent, useEditor } from '@tiptap/react'
import { useCallback, useRef, useState } from 'react'
import { editorExtensions } from '../../vendor/apps/docs/src/renderer/editor/extensions.js'
import type { Editor } from '@tiptap/core'
import type { SectionInfo } from '../../vendor/packages/docx-engine/src/types.js'
import { openDocx } from '../docx.js'
import { usePagination } from '../pagination.js'
import {
  EditorShell,
  EditorState,
  ToolbarButton,
  ToolbarDivider,
  ToolbarLabel,
  ToolbarSpacer,
} from '../shell/EditorShell.js'
import {
  BoldIcon,
  BulletListIcon,
  ItalicIcon,
  OrderedListIcon,
  SaveIcon,
  StrikeIcon,
  UnderlineIcon,
} from '../shell/icons.js'
import { statusText, useParsed, useSource } from './use-source.js'
import { OFFICE_MIME, type EditorProps } from './types.js'
import '../shell/shell.css'
// 编辑器样式：从 vendored 的整份办公壳样式里裁出的「编辑器 + 纸张排版」部分
// （见 packages/office/scripts/trim-editor-css.mjs）。字体是分页保真的前提
// ——缺了 metric-compatible 字体，浏览器会静默回退，换行与分页整体错位
import '../generated/editor.css'
import '../../vendor/apps/docs/src/renderer/fonts/fonts.css'

/** 文档未加载时的空分段（模块级常量：保证 hook 的依赖引用稳定） */
const NO_SECTIONS: SectionInfo[] = []

export function DocxEditor({ documentId, io, onDirtyChange, flush = false }: EditorProps) {
  const source = useSource(io, documentId)
  /** 解析。结果与「哪一份字节」绑在一起（见 useParsed 的说明） */
  const parsed = useParsed(source.bytes, openDocx)
  const session = parsed.value
  const [pageCount, setPageCount] = useState(1)
  /** 有改动还没保存。保存成功了才清掉 */
  const [dirty, setDirty] = useState(false)
  /** 分页要的两个元素：滚动容器与 ProseMirror 根 */
  const scrollRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const handlePaged = useCallback((count: number) => setPageCount(count), [])

  const editor = useEditor(
    {
      extensions: editorExtensions,
      content: session?.content,
      editable: true,
      onUpdate: () => {
        setDirty(true)
        onDirtyChange?.(true)
      },
    },
    [session],
  )

  /**
   * 分页：把连续流切成纸张（`src/pagination.ts`）。它插的是**装饰器**，
   * 不改文档内容——所以保存路径完全不受影响。
   */
  usePagination({
    editor,
    scrollRef,
    containerRef,
    /**
     * 必须是**稳定引用**：`session?.sections ?? []` 每次都新建数组，会让
     * hook 的 effect 每次渲染都重跑并互相取消。未加载时用同一个空数组常量。
     */
    sections: session?.sections ?? NO_SECTIONS,
    headerFooter: session?.headerFooter ?? null,
    footnotes: session?.footnotes ?? null,
    onPaged: handlePaged,
  })

  const save = async () => {
    if (!session || !editor) return
    const bytes = await session.save(editor.getJSON() as never)
    const ok = await source.save(bytes, { name: 'document.docx', mime: OFFICE_MIME.docx })
    if (!ok) return
    setDirty(false)
    onDirtyChange?.(false)
  }

  const status = statusText({
    handle: source,
    dirty,
    idle: session ? `第 1 / 共 ${pageCount} 页` : '读取中…',
  })

  if (source.loadError !== null) {
    return (
      <EditorShell flush={flush} status={<ToolbarLabel>{status}</ToolbarLabel>}>
        <EditorState tone="error">
          读取失败：{source.loadError}
          <div style={{ marginTop: 12 }}>
            <ToolbarButton label="重试" onClick={source.reload}>
              重试
            </ToolbarButton>
          </div>
        </EditorState>
      </EditorShell>
    )
  }

  if (parsed.error !== null) {
    return (
      <EditorShell flush={flush} status={<ToolbarLabel>{status}</ToolbarLabel>}>
        <EditorState tone="error">解析失败：{parsed.error}</EditorState>
      </EditorShell>
    )
  }

  return (
    <EditorShell
      flush={flush}
      toolbar={
        <>
          <DocxToolbar editor={editor} disabled={session === null} />
          <ToolbarSpacer />
          <ToolbarButton
            label={source.saving ? '保存中…' : '保存到库'}
            primary
            disabled={session === null || !dirty || source.saving}
            onClick={() => void save()}
          >
            <SaveIcon />
          </ToolbarButton>
        </>
      }
      status={
        <>
          <ToolbarLabel>{status}</ToolbarLabel>
          {session && (
            <ToolbarLabel>{session.blocks.filter((b) => !b.hidden).length} 个块</ToolbarLabel>
          )}
        </>
      }
    >
      {/* 滚动容器：分页要量它的顶部作原点，所以它必须是真正滚动的那一层 */}
      <div ref={scrollRef} className="me-scroll mimir-docx-scroll">
        <div ref={containerRef} className="editor-scroll mimir-office">
          <div className="doc-page">
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
    </EditorShell>
  )
}

/**
 * 格式工具条。**只在编辑器就绪后可用**：文档还在解析时按钮点下去没有意义，
 * 禁用比「点了没反应」诚实。
 */
function DocxToolbar({ editor, disabled }: { editor: Editor | null; disabled: boolean }) {
  if (!editor) return null

  /**
   * 每个按钮都是「聚焦编辑器 → 执行命令」：不聚焦的话第一次点击只移动
   * 焦点、命令作用不到选区。**一定要 `.run()`**——链式调用是惰性的。
   */
  const run = (fn: (chain: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>): void => {
    fn(editor.chain().focus()).run()
  }

  /** 光标处的列表类型（不在列表里返回 null） */
  const currentKind = (): 'bullet' | 'ordered' | null => {
    const attrs = editor.getAttributes('docListItem')
    if (!attrs || Object.keys(attrs).length === 0) return null
    return (attrs.kind as 'bullet' | 'ordered') ?? 'bullet'
  }

  /** 文档里第一个同类列表项的 numId（没有则 null） */
  const findExistingNumId = (kind: 'bullet' | 'ordered'): string | null => {
    let found: string | null = null
    editor.state.doc.descendants((node) => {
      if (found !== null) return false
      if (node.type.name !== 'docListItem') return true
      if (((node.attrs.kind as string) ?? 'bullet') !== kind) return true
      const id = node.attrs.numId as string | null
      if (id) found = id
      return found === null
    })
    return found
  }

  /**
   * 切换光标所在块的列表类型。三种情况：
   *   1. 已是同类列表 → 变回普通段落（再点一次取消）
   *   2. 已是另一类列表 → 只改 `kind`
   *   3. 普通块 → 换成 `docListItem`，`numId` 沿用文档里已有的同类列表
   */
  const toggleList = (kind: 'bullet' | 'ordered'): void => {
    const { state } = editor
    const { $from } = state.selection
    const node = $from.parent

    if (node.type.name === 'docListItem') {
      const current = (node.attrs.kind as string) ?? 'bullet'
      if (current === kind) {
        run((c) => c.setNode('docParagraph', { ...node.attrs, kind: null, numId: null }))
      } else {
        run((c) => c.updateAttributes('docListItem', { kind }))
      }
      return
    }

    const numId = findExistingNumId(kind)
    run((c) => c.setNode('docListItem', { ...node.attrs, kind, numId, ilvl: 0 }))
  }

  const inList = editor.isActive('docListItem')

  return (
    <>
      <ToolbarButton
        label="加粗 (Ctrl+B)"
        active={editor.isActive('bold')}
        disabled={disabled}
        onClick={() => run((c) => c.toggleMark('bold'))}
      >
        <BoldIcon />
      </ToolbarButton>
      <ToolbarButton
        label="倾斜 (Ctrl+I)"
        active={editor.isActive('italic')}
        disabled={disabled}
        onClick={() => run((c) => c.toggleMark('italic'))}
      >
        <ItalicIcon />
      </ToolbarButton>
      <ToolbarButton
        label="下划线 (Ctrl+U)"
        active={editor.isActive('underline')}
        disabled={disabled}
        onClick={() => run((c) => c.toggleMark('underline'))}
      >
        <UnderlineIcon />
      </ToolbarButton>
      <ToolbarButton
        label="删除线"
        active={editor.isActive('strike')}
        disabled={disabled}
        onClick={() => run((c) => c.toggleMark('strike'))}
      >
        <StrikeIcon />
      </ToolbarButton>
      <ToolbarDivider />
      <ToolbarButton
        label="项目符号列表"
        active={inList && currentKind() === 'bullet'}
        disabled={disabled}
        onClick={() => toggleList('bullet')}
      >
        <BulletListIcon />
      </ToolbarButton>
      <ToolbarButton
        label="编号列表"
        active={inList && currentKind() === 'ordered'}
        disabled={disabled}
        onClick={() => toggleList('ordered')}
      >
        <OrderedListIcon />
      </ToolbarButton>
    </>
  )
}
