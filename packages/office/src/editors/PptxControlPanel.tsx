import { useRef, useState, type ReactNode } from 'react'
import { ToolbarPropertyForm, ToolbarMenuNote } from '../shell/EditorShell.js'

export type PptxApply = (op: Record<string, unknown>) => Promise<boolean>
export type PptxTarget = { slide: number; el: string }
export function usePptxAction(apply: PptxApply) {
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const run = async (op: Record<string, unknown>) => {
    if (pending.current) return false
    pending.current = true
    setBusy(true)
    try {
      return await apply(op)
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  return { busy, run }
}
export function PptxControlPanel({
  busy,
  children,
  columns = 1,
  actions,
}: {
  busy: boolean
  children: ReactNode
  columns?: 1 | 2
  actions?: ReactNode
}) {
  return (
    <fieldset
      className={`mimir-pptx-control-panel${actions ? ' mimir-pptx-control-panel--actions' : ''}`}
      disabled={busy}
      aria-busy={busy}
      style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
    >
      {actions ? (
        <>
          <div className="mimir-pptx-control-panel__body">
            <ToolbarPropertyForm columns={columns}>{children}</ToolbarPropertyForm>
          </div>
          <div className="mimir-pptx-control-panel__footer">
            {busy && <p role="status">正在应用修改…</p>}
            {actions}
          </div>
        </>
      ) : (
        <ToolbarPropertyForm columns={columns}>
          {busy && <ToolbarMenuNote>正在应用修改…</ToolbarMenuNote>}
          {children}
        </ToolbarPropertyForm>
      )}
    </fieldset>
  )
}
