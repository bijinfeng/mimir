import { useNavigate } from '@tanstack/react-router'
import type { PptxAiSnapshotDraft } from '@mimir/office'
import type { DocumentDetail } from '@mimir/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatDocumentAgent } from '@mimir/chat'
import { DocxEditor, HtmlEditor, PdfEditor, PptxEditor, XlsxEditor } from '@mimir/office'
import { App } from 'antd'
import { useEditorThemeVars } from '../../theme/editor-theme-bridge'
import { useAppearance } from '../../theme/appearance'
import { api } from '../../lib/api'
import { createOfficeSourceIo } from '../../lib/office-source-filename'
import { useUnsaved } from '../../lib/unsaved'

/**
 * Office 文档的原件编辑器（docx / xlsx / pptx / html / pdf）。
 *
 * ## 它是宿主与编辑器之间的**适配层**，只做三件事
 *
 * 1. 把网络调用包成 `EditorIo`（`load` / `save`）——编辑器不认识 cookie、
 *    不知道端点长什么样，所以取与存必须由宿主提供
 * 2. 把主题变量铺在祖先上（`--me-*`，见 `theme/editor-theme-bridge.ts`）
 * 3. 把编辑器的「有未保存改动」转给应用壳的守卫（`lib/unsaved` 的
 *    `setDirty` / `setSave`）——离开时的拦截靠它，见下面 `reportDirty`
 *
 * 其余全部（布局、工具栏、保存状态、分页）都在 `@mimir/office` 里，
 * 五种格式共用同一份实现——这样「它们长得一样」不靠约定。
 *
 * ## 保存走已有的替换原件端点
 *
 * `PUT /api/documents/:id/file` 服务端会重算正文与哈希（`.trellis/spec/project/architecture.md` §13.9），
 * 所以编辑完立刻可检索，**不需要新端点**。这也意味着编辑的是**原件**：
 * 标签、目录、状态都保留（那是用户整理的结果，与文件内容无关）。
 */
export function OfficeSourceEditor({
  doc,
  kind,
  onDirtyChange,
  onDocumentAgentHandleChange,
  onAiPreset,
  onAiSnapshotDraft,
}: {
  doc: DocumentDetail
  onAiPreset?: ((instruction: string) => void) | undefined
  onAiSnapshotDraft?: ((draft: PptxAiSnapshotDraft) => void) | undefined
  kind: 'docx' | 'xlsx' | 'pptx' | 'html' | 'pdf'
  onDirtyChange?: (dirty: boolean) => void
  onDocumentAgentHandleChange?: (handle: ChatDocumentAgent | null) => void
}) {
  const { styles: themeVars } = useEditorThemeVars()
  const { message } = App.useApp()
  const { setDirty, setSave, runGuarded } = useUnsaved()
  const navigate = useNavigate()
  const appearance = useAppearance()

  /**
   * `useSource` 把 io 放进 ref；同一篇文档的 io 引用必须保持稳定。
   * `FilePreview` 按 doc.id 给此组件设置 key，换文档时会重新创建 io。
   */
  const [io] = useState(() =>
    createOfficeSourceIo(doc.id, doc.sourceKey, {
      sourceUrl: api.documents.sourceUrl,
      replaceSource: api.documents.replaceSource,
    }),
  )

  /**
   * 脏标记上报给**应用壳的守卫**（`lib/unsaved`）。
   *
   * 只报 `onDirtyChange` 是不够的：那个回调是「宿主想知道有没有改动」，
   * 而拦截离开看的是 context 里的 `isDirty`（`lib/unsaved.tsx` 的
   * `runGuarded`）。原先只有 `NoteEditor` 喂它，于是同一动作两种结果——
   * 笔记离开会被拦下问一句，而原件（docx / xlsx / pptx / html / pdf）
   * 状态行刚写着「已修改，未保存」，点「返回库」「设置」就直接走，
   * 改动没了且没有任何提示（`.trellis/spec/project/product.md` §5.9 要求三个选项）。
   */
  const reportDirty = useCallback(
    (dirty: boolean) => {
      setDirty(dirty)
      onDirtyChange?.(dirty)
    },
    [setDirty, onDirtyChange],
  )

  /**
   * 「保存并离开」用不了时**不放行**，而不是静默丢改动。
   *
   * 保存动作在编辑器内部（改过的模型在它手里），`packages/office` 的
   * `EditorProps` 只暴露 `io` 与 `onDirtyChange`——没有 `MarkdownEditor`
   * 的 `onSaveHandle` 那样把「立即保存」交给宿主的通道，所以宿主代不了这个
   * 动作。守卫的语义是「句柄返回 false 就不放行」（`lib/unsaved.tsx` 的
   * `resolve`，与 PRD §5.9 的「保存失败时不会放行」同一条），于是选
   * 「保存并离开」的人留在原地、改动还在，并被告知该按哪个按钮。
   *
   * 真要做成「真的能存了再走」，需要给 `EditorProps` 加一个保存句柄
   * （动 `packages/office`），不在本次改动范围内。
   */
  const saveFromHere = useCallback(async () => {
    message.info('原件的保存按钮在编辑器工具条右端（「保存到库」），先用它保存再离开')
    return false
  }, [message])

  /**
   * 守卫的三个入口放 ref，注册 effect 用**空依赖**。
   *
   * `UnsavedProvider` 每次渲染都新建 `setDirty` / `setSave` 的引用
   * （`lib/unsaved.tsx` 里是两个内联箭头函数），把它们写进依赖数组的后果
   * 很隐蔽：**脏标记一变，provider 重渲染，注册 effect 的清理就跑一遍**，
   * 而清理里的 `setDirty(false)` 会把刚报上去的 `true` 立刻抹掉——守卫于是
   * 永远不触发，看起来只是「没弹框」。所以用 ref 承接最新值、空依赖注册，
   * 与 `use-source.ts` 的 `ioRef` / `MarkdownEditor` 的 `saveNowRef` 是同一个
   * 手法。ref 的更新 effect 声明在使用它的 effect **之前**（Compiler 的要求）。
   */
  const dirtyRef = useRef(setDirty)
  const registerRef = useRef(setSave)
  const saveFromHereRef = useRef(saveFromHere)
  useEffect(() => {
    dirtyRef.current = setDirty
    registerRef.current = setSave
    saveFromHereRef.current = saveFromHere
  })

  /**
   * 注册「立即保存」，并在卸载时**把脏标记清掉**。
   *
   * 不清的话它会留在守卫里：用户改完一篇、从别处（浏览器后退这类不走
   * `runGuarded` 的路）离开，之后每次导航都被问一句「有改动还没保存」，
   * 而那个改动早就不在界面上了。
   */
  useEffect(() => {
    const register = registerRef.current
    // This callback only explains toolbar saving; it cannot save from the guard.
    register(() => saveFromHereRef.current(), 'manual', false, doc.id)
    return () => {
      register(null)
      dirtyRef.current(false)
    }
  }, [doc.id])

  const props = {
    documentId: doc.id,
    io,
    onDirtyChange: reportDirty,
    /**
     * 当前外观透给编辑器。
     *
     * docx 用它决定要不要给纸张容器挂 `page-dark`（见 `EditorProps` 的
     * 说明）。**必须从 `useAppearance()` 取而不是读 DOM 的 `data-theme`**：
     * 那是「观测与调试用」的属性（`theme/appearance.ts` 的注释），
     * 真相在订阅里——跟着系统偏好切换时只有订阅会重渲染。
     */
    appearance,
  }

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
      <DocxEditor key={doc.id} flush {...props} onAgentHandleChange={onDocumentAgentHandleChange} />
    ) : kind === 'xlsx' ? (
      <XlsxEditor
        key={doc.id}
        flush
        {...props}
        onAgentHandleChange={onDocumentAgentHandleChange}
        hostApply={api.documents.applyXlsxOps}
      />
    ) : kind === 'html' ? (
      <HtmlEditor
        onAiPreset={onAiPreset}
        key={doc.id}
        flush
        {...props}
        onAgentHandleChange={onDocumentAgentHandleChange}
        agentServices={{
          planPage: ({ signal, ...input }) => api.documents.planHtmlPage(doc.id, input, signal),
          writeDocument: ({ signal, onDelta, ...input }) =>
            api.documents.writeHtmlDocument(doc.id, input, signal, onDelta),
        }}
      />
    ) : kind === 'pdf' ? (
      <PdfEditor
        key={doc.id}
        flush
        {...props}
        onAgentHandleChange={onDocumentAgentHandleChange}
        hostApply={(input) => api.documents.applyPdfText({ documentId: doc.id, ...input })}
        hostInspect={(input) => api.documents.inspectPdfText({ documentId: doc.id, ...input })}
        hostBlocks={(input) => api.documents.pdfTextBlocks({ documentId: doc.id, ...input })}
        onAssetSettings={(assetKind) =>
          runGuarded(() => {
            void navigate({
              to: '/settings',
              search: {
                scope: 'all',
                section: assetKind === 'search' ? 'network-search' : 'models',
              },
            })
          })
        }
        hostAssets={(input) => api.documents.pdfAssets({ documentId: doc.id, ...input })}
        hostAssetReadiness={(signal) => api.documents.pdfAssetReadiness(doc.id, signal)}
        hostAssetPreview={(input) =>
          api.documents.pdfAssetPreview({ documentId: doc.id, ...input })
        }
        hostImages={(input) => api.documents.pdfImages({ documentId: doc.id, ...input })}
        hostLocal={(input) => api.documents.pdfLocal({ documentId: doc.id, ...input })}
        hostForms={(input) => api.documents.pdfForms({ documentId: doc.id, ...input })}
        hostAnnotations={(input) => api.documents.pdfAnnotations({ documentId: doc.id, ...input })}
        hostMarkup={(input) => api.documents.applyPdfMarkup({ documentId: doc.id, ...input })}
      />
    ) : (
      <PptxEditor
        onAiSnapshotDraft={onAiSnapshotDraft}
        onAiPreset={onAiPreset}
        key={doc.id}
        flush
        {...props}
        onAgentHandleChange={onDocumentAgentHandleChange}
        hostApply={api.documents.applyPptxOps}
        hostPicture={api.documents.applyPptxPicture}
        hostAsset={api.documents.applyPptxManualAsset}
      />
    )

  return <div className={themeVars.vars}>{editor}</div>
}
