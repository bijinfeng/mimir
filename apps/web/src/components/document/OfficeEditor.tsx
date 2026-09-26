import { EditorContent, useEditor } from '@tiptap/react'
import { App, Button, Space } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import { editorExtensions } from '@mimir/office/vendor/extensions'
import { openDocx, usePagination, type DocxSession } from '@mimir/office'
import type { SectionInfo } from '@mimir/office/vendor/types'
// 编辑器样式：从 vendored 的整份办公壳样式里裁出的「编辑器 + 纸张排版」部分
// （见 packages/office/scripts/trim-editor-css.mjs）。字体是分页保真的前提
// ——缺了 metric-compatible 字体，浏览器会静默回退，换行与分页整体错位
import '@mimir/office/editor.css'
import '@mimir/office/vendor/fonts.css'
import { useStyles } from '@/components/document/OfficeEditor.style'
import { OfficeToolbar } from '@/components/document/OfficeToolbar'
import { api } from '@/lib/api'

/**
 * Office 文档的浏览器内编辑（POC）。
 *
 * ## 它验的是什么
 *
 * 「mimir 能不能自己预览并编辑 docx」的端到端验证：
 *   1. 从 mimir 取原件（`GET /api/documents/:id/file`，cookie 鉴权）
 *   2. vendored 的 GenOffice 引擎解析 → ProseMirror 文档 → Tiptap 渲染
 *   3. 用户编辑 → `pmDocToSavePlan` 生成补丁 → **只把改动的块写回**
 *   4. 新字节 multipart 传回 `PUT /api/documents/:id/file`
 *
 * 第 3 步是关键：补丁式保存让「改两个字」不会重排整篇 XML，因此不会丢掉
 * Word 文档里那些我们没建模的东西（域代码、修订标记、OLE 对象）。
 * 实测（`packages/office/src/docx.test.ts`）：原样保存 zip 条目逐字节相同；
 * 改一段只有 `word/document.xml` 变化。
 *
 * ## 现在缺什么（POC 与产品的距离）
 *
 * - **分页视图**：分页引擎在闭包里，但接成「纸张一样的页面」还要容器与
 *   滚动逻辑。现在是无分页的连续流。
 * - **工具栏**：上游的 ribbon 没 vendored（那是它自己的办公壳）。
 * - **大文档解析**：`parseDocx` 是同步重活，上游为它做了 worker；产品化要接。
 * - **保存冲突**：`PUT` 不校验 `If-Match`，多客户端同时改会互相覆盖。
 */
/** 文档未加载时的空分段（模块级常量：保证 hook 的依赖引用稳定） */
const NO_SECTIONS: SectionInfo[] = []

export function OfficeEditor({ documentId }: { documentId: string }) {
  const { styles } = useStyles()
  const { message } = App.useApp()
  const [session, setSession] = useState<DocxSession | null>(null)
  const [status, setStatus] = useState('读取原件…')
  const [saving, setSaving] = useState(false)
  const [pageCount, setPageCount] = useState(1)
  /** 分页要的两个元素：滚动容器与 ProseMirror 根 */
  const scrollRef = useRef<HTMLDivElement>(null)
  /** 包住编辑器的容器（分页从它里面找 .ProseMirror，见 hook 的说明） */
  const containerRef = useRef<HTMLDivElement>(null)
  const handlePaged = useCallback((count: number) => setPageCount(count), [])

  const editor = useEditor(
    {
      extensions: editorExtensions,
      content: session?.content,
      editable: true,
    },
    [session],
  )

  /**
   * 分页：把连续流切成纸张（`packages/office/src/pagination.ts`）。
   * 它插的是**装饰器**，不改文档内容——所以保存路径完全不受影响。
   */
  usePagination({
    editor,
    scrollRef,
    containerRef,
    /**
     * 必须是**稳定引用**：`session?.sections ?? []` 每次都新建数组，
     * 会让 hook 的 effect 每次渲染都重跑并互相取消（见 hook 里 sections 的
     * 说明）。文档未加载时用同一个空数组常量。
     */
    sections: session?.sections ?? NO_SECTIONS,
    headerFooter: session?.headerFooter ?? null,
    footnotes: session?.footnotes ?? null,
    onPaged: handlePaged,
  })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(api.documents.sourceUrl(documentId), { credentials: 'include' })
        if (!res.ok) throw new Error(`读取原件失败：HTTP ${res.status}`)
        const bytes = new Uint8Array(await res.arrayBuffer())
        if (cancelled) return
        setStatus(`已读取 ${bytes.length} 字节，解析中…`)
        const opened = await openDocx(bytes)
        if (cancelled) return
        setSession(opened)
        setStatus(`${opened.blocks.filter((b) => !b.hidden).length} 个块`)
      } catch (error) {
        if (!cancelled) setStatus(`失败：${error instanceof Error ? error.message : String(error)}`)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [documentId])

  const save = async () => {
    if (!session || !editor) return
    setSaving(true)
    try {
      const bytes = await session.save(editor.getJSON() as never)
      const file = new File([bytes as BlobPart], 'edited.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })
      await api.documents.replaceSource(documentId, file)
      message.success(`已保存（${bytes.length} 字节）`)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <Space style={{ marginBottom: 12 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
          {status} · 第 1 / 共 {pageCount} 页
        </span>
        <Button
          size="small"
          type="primary"
          loading={saving}
          disabled={!editor}
          onClick={() => void save()}
        >
          保存到库
        </Button>
      </Space>
      {/* 滚动容器：分页要量它的顶部作原点，所以它必须是真正滚动的那一层 */}
      {/*
        容器上挂 `mimir-office` 类：页间隙的灰带底色（`--canvas`）与纸张底色
        （`--docs-paper`）由我们自己的样式定义——上游那两个变量由它的 App 壳在
        运行时注入，而我们没有 vendored 那个壳。用 mimir 的主题 token 反而更对：
        纸与工作台的颜色该跟界面一致。
      */}
      {/* 顶栏工具栏：Word 的格式操作是边写边调的，常驻比气泡菜单合适 */}
      <OfficeToolbar editor={editor} disabled={!session} />

      <div ref={scrollRef} className={styles.scroll}>
        <div ref={containerRef} className="editor-scroll mimir-office">
          <div className="doc-page">
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
    </div>
  )
}
