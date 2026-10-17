import { useState } from 'react'
import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { ToolbarMenu, ToolbarMenuItemRow, ToolbarMenuNote } from '../shell/EditorShell.js'
import {
  applyDocxCase,
  DOCX_CASE_MODES,
  docxCaseTarget,
  type DocxCaseOptions,
} from './docx-case.js'

export interface DocxCaseControlsProps extends DocxCaseOptions {
  editor: Editor
  disabled?: boolean
}
function CaseMenu({
  editor,
  disabled,
  onResult,
  onError,
  close,
}: DocxCaseControlsProps & { close: () => void }) {
  const [target] = useState(() => docxCaseTarget(editor))
  const [error, setError] = useState('')
  const stale = useEditorState({
    editor,
    selector: ({ editor: current }) => current.state.doc !== target.doc,
  })
  const reason = disabled
    ? '请等待当前操作完成'
    : stale
      ? '文档已变化，请重新打开大小写菜单'
      : target.reason
  return (
    <>
      <ToolbarMenuNote>{reason ?? '仅转换所选文字 · Shift+F3 循环切换'}</ToolbarMenuNote>
      {DOCX_CASE_MODES.map(({ mode, label, example }) => (
        <ToolbarMenuItemRow
          key={mode}
          item={{
            key: mode,
            label: `${label} · ${example}`,
            disabled: !!reason,
            disabledReason: reason ?? undefined,
            onSelect: () => {
              try {
                const result = applyDocxCase(editor, target, mode)
                onResult?.(result)
                close()
              } catch (cause) {
                const message = cause instanceof Error ? cause.message : String(cause)
                setError(message)
                onError?.(message)
              }
            },
          }}
        />
      ))}
      {error && <ToolbarMenuNote>{error}</ToolbarMenuNote>}
    </>
  )
}

/** Four immediate actions; no form, extra toolbar row or persistent side panel. */
export function DocxCaseControls(props: DocxCaseControlsProps) {
  return (
    <ToolbarMenu
      label="大小写"
      text="大小写"
      panelWidth={304}
      renderPanel={(close) => <CaseMenu {...props} close={close} />}
    />
  )
}
