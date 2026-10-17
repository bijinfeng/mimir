import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
  type Ref,
} from 'react'
import { createPortal } from 'react-dom'
import { Clipboard, Copy, Scissors, Upload, X } from 'lucide-react'
import type { ClipboardContext, XlsxClipboardController } from '../xlsx-clipboard.js'
import {
  ToolbarButton,
  ToolbarFileButton,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarTextArea,
  ToolbarSelect,
} from '../shell/EditorShell.js'
import './xlsx-clipboard-controls.css'

export interface XlsxClipboardControlsHandle {
  open: (trigger: HTMLElement) => void
}
export function XlsxClipboardControls({
  ref,
  controller,
  context,
  inspector,
  onInspectorOpen,
  onInspectorClose,
}: {
  ref?: Ref<XlsxClipboardControlsHandle>
  controller: XlsxClipboardController
  context: () => ClipboardContext
  inspector: string | null
  onInspectorOpen: () => void
  onInspectorClose: () => void
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot),
    trigger = useRef<HTMLElement | null>(null),
    panel = useRef<HTMLElement>(null)
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const close = () => {
    controller.stop()
    setContainer(null)
    onInspectorClose()
  }
  const open = (button: HTMLElement) => {
    trigger.current = button.matches('table')
      ? (button.querySelector<HTMLElement>('td[tabindex="0"]') ?? button)
      : button
    onInspectorOpen()
    setContainer(
      button.closest('.mimir-editor')?.querySelector<HTMLElement>('.mimir-editor__body') ??
        button.parentElement,
    )
  }
  useImperativeHandle(ref, () => ({ open }))
  if (container && inspector !== 'clipboard') setContainer(null)
  useEffect(() => () => controller.stop(), [controller])
  useEffect(() => {
    if (!container) return
    const node = panel.current,
      entry = trigger.current,
      section = entry?.closest<HTMLElement>('[data-section-key]')?.dataset.sectionKey,
      editor = container.closest('.mimir-editor')
    node?.focus()
    return () => {
      controller.stop()
      const active = document.activeElement
      if (active === document.body || active === node || node?.contains(active)) {
        const group = Array.from(
          editor?.querySelectorAll<HTMLElement>('[data-section-key]') ?? [],
        ).find((element) => element.dataset.sectionKey === section)
        const destination = entry?.isConnected
          ? entry
          : (editor?.querySelector<HTMLButtonElement>('button[aria-label="范围剪贴板"]') ??
            group?.querySelector<HTMLButtonElement>('button:not(:disabled)') ??
            editor?.querySelector<HTMLButtonElement>(
              '.mimir-compact-toolbar__tabs [aria-selected="true"]',
            ))
        destination?.focus()
      }
    }
  }, [container, controller])
  if (!container) return null
  let current: ClipboardContext | null = null,
    issue = ''
  try {
    current = context()
  } catch (error) {
    issue = error instanceof Error ? error.message : '请选择范围'
  }
  const blocked = state.busy || !!issue || !!current?.blocked
  const invoke = (action: (ctx: ClipboardContext) => void | Promise<void>) => {
    try {
      const ctx = context()
      void action(ctx)
    } catch (error) {
      controller.error(error instanceof Error ? error.message : '请选择范围')
    }
  }
  return createPortal(
    <aside
      ref={panel}
      tabIndex={-1}
      aria-label="范围剪贴板"
      className="mimir-xlsx-inspector mimir-xlsx-clipboard"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          close()
        }
      }}
    >
      <header className="mimir-xlsx-inspector__header">
        <h2>剪贴板</h2>
        <ToolbarButton label="关闭剪贴板" onClick={close}>
          <X size={16} />
        </ToolbarButton>
      </header>
      <div className="mimir-xlsx-inspector__content mimir-xlsx-clipboard__content">
        <p className="mimir-xlsx-clipboard__target">
          目标：{current ? `${current.sheet.name}!${current.range || '未选范围'}` : issue}
        </p>
        <ToolbarMenuFields label="工作簿内范围">
          <h3 className="mimir-xlsx-clipboard__section-title">内部范围</h3>
          <ToolbarMenuNote>含隐藏行；单格目标按源大小展开，暂不重复平铺。</ToolbarMenuNote>
          <div className="mimir-xlsx-clipboard__actions">
            <ToolbarButton
              label="复制所选范围"
              disabled={blocked}
              disabledReason={issue || current?.blocked}
              onClick={() => invoke((ctx) => controller.copy(ctx, 'copy'))}
            >
              <Copy size={14} />
              复制
            </ToolbarButton>
            <ToolbarButton
              label="剪切所选范围"
              disabled={blocked || !!current?.sheet.extras?.protected}
              disabledReason={
                current?.sheet.extras?.protected ? '剪切源工作表已保护' : issue || current?.blocked
              }
              onClick={() => invoke((ctx) => controller.copy(ctx, 'cut'))}
            >
              <Scissors size={14} />
              剪切
            </ToolbarButton>
          </div>
          {state.capture ? (
            <>
              <div className="mimir-xlsx-clipboard__source-row">
                <p className="mimir-xlsx-clipboard__source">
                  {state.capture.kind === 'cut' ? '剪切源' : '复制源'}：{state.capture.sheetName}!
                  {state.capture.range}
                  {state.stale ? '（已失效，请重新复制）' : ''}
                </p>
                <ToolbarButton
                  label="取消复制或剪切"
                  disabled={state.busy}
                  onClick={() => controller.cancel()}
                >
                  取消范围
                </ToolbarButton>
              </div>
              {state.payload && (
                <ToolbarButton
                  label="粘贴工作簿内范围"
                  disabled={blocked || state.stale || !!current?.sheet.extras?.protected}
                  disabledReason={
                    state.stale
                      ? '工作簿已更新，请重新复制'
                      : current?.sheet.extras?.protected
                        ? '目标工作表已保护'
                        : issue || current?.blocked
                  }
                  onClick={() => invoke((ctx) => controller.apply(ctx, null))}
                >
                  粘贴工作簿内范围
                </ToolbarButton>
              )}
            </>
          ) : (
            <ToolbarMenuNote>网格 Ctrl/Cmd+C、X、V。内部粘贴保留原生公式与格式。</ToolbarMenuNote>
          )}
        </ToolbarMenuFields>
        <ToolbarMenuFields label="系统剪贴板与导入">
          <h3 className="mimir-xlsx-clipboard__section-title">外部内容</h3>
          <ToolbarButton
            label="读取系统剪贴板"
            disabled={blocked}
            disabledReason={issue || current?.blocked}
            onClick={() => invoke((ctx) => controller.read(ctx))}
          >
            <Clipboard size={14} />
            读取系统剪贴板
          </ToolbarButton>
          <ToolbarFileButton
            label="选择CSV或TSV文件"
            accept=".csv,.tsv,text/csv,text/tab-separated-values"
            disabled={blocked}
            onPick={(file) =>
              invoke((ctx) =>
                controller.read(ctx, async () => {
                  if (file.size > 1024 * 1024) throw new Error('请选择不超过1MiB的文本文件')
                  return {
                    plain: await file.text(),
                    html: '',
                    delimiter: /\.tsv$/i.test(file.name) ? '\t' : ',',
                  }
                }),
              )
            }
          >
            <Upload size={14} />
            导入 CSV / TSV
          </ToolbarFileButton>
          {state.payload?.html ? (
            <ToolbarMenuNote>
              已读取HTML表格。文字按原文写入，不执行公式；只应用明确声明的基础格式。
            </ToolbarMenuNote>
          ) : (
            <>
              <ToolbarSelect
                label="内容分隔方式"
                value={state.payload?.delimiter ?? '\t'}
                disabled={state.busy}
                onChange={(value) =>
                  controller.stage({
                    plain: state.payload?.plain ?? '',
                    html: '',
                    delimiter: value as ',' | '\t',
                  })
                }
                options={[
                  { value: '\t', label: '制表符（表格）' },
                  { value: ',', label: '逗号（CSV）' },
                ]}
              />
              <ToolbarTextArea
                label="待写入的表格内容"
                value={state.payload?.plain ?? ''}
                onChange={(plain) =>
                  controller.stage({ plain, html: '', delimiter: state.payload?.delimiter })
                }
                rows={5}
              />
              <ToolbarMenuNote>
                最多2000格。纯文本识别数字、布尔及等号公式；单引号开头按文本解释。
              </ToolbarMenuNote>
            </>
          )}
          {state.payload?.html && (
            <ToolbarButton
              label="仅粘贴显示值"
              disabled={blocked || !!current?.sheet.extras?.protected}
              onClick={() => invoke((ctx) => controller.apply(ctx, state.payload, true))}
            >
              仅粘贴显示值
            </ToolbarButton>
          )}
        </ToolbarMenuFields>
        <p className="mimir-xlsx-clipboard__feedback" role={state.error ? 'alert' : 'status'}>
          {state.error || state.message || '支持系统HTML与显示值；内部原生范围只在本工作簿内有效。'}
        </p>
      </div>
      <footer className="mimir-xlsx-clipboard__footer">
        <ToolbarButton
          label={state.capture && !state.payload ? '粘贴工作簿内范围' : '粘贴已读取内容'}
          primary
          disabled={
            blocked ||
            (!state.payload && (!state.capture || state.stale)) ||
            !!current?.sheet.extras?.protected
          }
          disabledReason={
            current?.sheet.extras?.protected
              ? '目标工作表已保护'
              : !state.payload && state.stale
                ? '工作簿已更新，请重新复制'
                : issue || current?.blocked || '先复制范围、读取系统剪贴板或输入内容'
          }
          onClick={() => invoke((ctx) => controller.apply(ctx, state.payload))}
        />
      </footer>
    </aside>,
    container,
  )
}
