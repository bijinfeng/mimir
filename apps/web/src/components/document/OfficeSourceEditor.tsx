import type { DocumentDetail } from '@mimir/shared'
import { useCallback, useMemo } from 'react'
import type { EditorIo } from '@mimir/office'
import { DocxEditor, PptxEditor, XlsxEditor } from '@mimir/office'
import { useEditorThemeVars } from '@/theme/editor-theme-bridge'
import { api } from '@/lib/api'

/**
 * Office 文档的原件编辑器（docx / xlsx / pptx）。
 *
 * ## 它是宿主与编辑器之间的**适配层**，只做两件事
 *
 * 1. 把网络调用包成 `EditorIo`（`load` / `save`）——编辑器不认识 cookie、
 *    不知道端点长什么样，所以取与存必须由宿主提供
 * 2. 把主题变量铺在祖先上（`--me-*`，见 `theme/editor-theme-bridge.ts`）
 *
 * 其余全部（布局、工具栏、保存状态、分页）都在 `@mimir/office` 里，
 * 四种格式共用同一份实现——这样「它们长得一样」不靠约定。
 *
 * ## 保存走已有的替换原件端点
 *
 * `PUT /api/documents/:id/file` 服务端会重算正文与哈希（`TECH.md` §13.9），
 * 所以编辑完立刻可检索，**不需要新端点**。这也意味着编辑的是**原件**：
 * 标签、目录、状态都保留（那是用户整理的结果，与文件内容无关）。
 */
export function OfficeSourceEditor({
  doc,
  kind,
  onDirtyChange,
}: {
  doc: DocumentDetail
  kind: 'docx' | 'xlsx' | 'pptx'
  onDirtyChange?: (dirty: boolean) => void
}) {
  const { styles: themeVars } = useEditorThemeVars()

  /**
   * 取与存。**必须封装成稳定的引用**（`useCallback`）：`useSource`
   * 会把它放进 ref，但每次渲染新建对象仍会让下游的比较失效。
   *
   * 这里的 `useCallback` 不是「手写记忆化」——`apps/web/AGENTS.md` 禁的是
   * 为了性能而手写的 `useMemo`/`useCallback`（React Compiler 会做）。这里
   * 是**语义**要求的：`io` 是编辑器加载的触发条件之一，引用飘忽会让它
   * 反复重新加载。
   */
  const load = useCallback(async () => {
    const res = await fetch(api.documents.sourceUrl(doc.id), { credentials: 'include' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return new Uint8Array(await res.arrayBuffer())
  }, [doc.id])

  const save = useCallback(
    async (bytes: Uint8Array, target: { name: string; mime: string }) => {
      const file = new File([bytes as BlobPart], target.name, { type: target.mime })
      await api.documents.replaceSource(doc.id, file)
    },
    [doc.id],
  )

  const io = useMemo<EditorIo>(() => ({ load, save }), [load, save])

  const props = { documentId: doc.id, io, ...(onDirtyChange ? { onDirtyChange } : {}) }

  /**
   * 主题变量必须铺在**编辑器的祖先**上。
   *
   * CSS 自定义属性只对声明它的元素及其子树生效——挂错地方的表现是样式
   * **全部退回 `shell.css` 里的回退值**：界面照常能用，只是颜色不对，
   * 而且不报错（这条坑记在 `editor-theme-bridge.ts` 顶部）。
   *
   * `key={doc.id}`：换文档必须重建编辑器实例（模型是按那一份字节解析出来的）。
   */
  const editor =
    kind === 'docx' ? (
      <DocxEditor key={doc.id} flush {...props} />
    ) : kind === 'xlsx' ? (
      <XlsxEditor key={doc.id} flush {...props} />
    ) : (
      <PptxEditor key={doc.id} flush {...props} />
    )

  return <div className={themeVars.vars}>{editor}</div>
}
