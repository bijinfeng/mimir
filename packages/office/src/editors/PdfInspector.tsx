import { Button } from 'antd'
import { RefreshCw, X } from 'lucide-react'
import { useEffect, useRef, type ReactNode, type RefObject } from 'react'

export interface PdfPanelResult {
  ok: boolean
  changed: boolean
  error?: string
}
export type PdfPanelAction = (
  tool: string,
  args: Record<string, unknown>,
) => Promise<PdfPanelResult | undefined>

export function focusPdfInspectorTrigger(
  trigger: Element | null,
  editor: Element | null,
  sectionKey?: string,
) {
  if (trigger instanceof HTMLButtonElement && trigger.isConnected && !trigger.disabled) {
    trigger.focus()
    if (document.activeElement === trigger) return
  }
  const group = Array.from(editor?.querySelectorAll<HTMLElement>('[data-section-key]') ?? []).find(
    (element) => element.dataset.sectionKey === sectionKey,
  )
  group?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
}

export function PdfInspector({
  children,
  onClose,
  onEscape = onClose,
  triggerRef,
  fallbackSectionKey,
}: {
  children: ReactNode
  onClose(): void
  onEscape?(): void
  triggerRef: RefObject<HTMLButtonElement | null>
  fallbackSectionKey?: string
}) {
  const root = useRef<HTMLElement>(null)
  useEffect(() => {
    const previous = triggerRef.current ?? document.activeElement
    const panel = root.current
    const editor = panel?.closest('.mimir-editor') ?? null
    const entryTab = editor?.querySelector<HTMLButtonElement>(
      '.mimir-compact-toolbar__tabs [role="tab"][aria-selected="true"]',
    )
    panel?.focus()
    return () => {
      // Preserve focus if the user already chose a control outside the panel.
      const active = document.activeElement
      if (active !== document.body && active !== panel && !panel?.contains(active)) return
      focusPdfInspectorTrigger(previous, editor, fallbackSectionKey)
      const entryGroupVisible = Array.from(
        editor?.querySelectorAll<HTMLElement>('[data-section-key]') ?? [],
      ).some((group) => group.dataset.sectionKey === fallbackSectionKey)
      if (
        !entryGroupVisible &&
        entryTab?.isConnected &&
        (document.activeElement === active || document.activeElement === document.body)
      )
        entryTab.focus()
    }
  }, [triggerRef, fallbackSectionKey])
  return (
    <aside
      className="mimir-pdf-inspector"
      aria-label="PDF 属性工具"
      ref={root}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) {
          event.stopPropagation()
          onEscape()
        }
      }}
    >
      {children}
    </aside>
  )
}

export function PdfInspectorHeader({
  title,
  detail,
  busy,
  refreshLabel,
  closeLabel,
  onRefresh,
  onClose,
}: {
  title: string
  detail?: string
  busy: boolean
  refreshLabel: string
  closeLabel: string
  onRefresh(): void
  onClose(): void
}) {
  return (
    <header className="mimir-pdf-inspector__header">
      <div>
        <h2>{title}</h2>
        {detail && <span className="mimir-pdf-inspector__meta">{detail}</span>}
      </div>
      <div className="mimir-pdf-inspector__header-actions">
        <Button
          type="text"
          icon={<RefreshCw size={16} />}
          aria-label={refreshLabel}
          title={refreshLabel}
          disabled={busy}
          onClick={(event) => {
            // The refresh button becomes disabled during the request. Keep
            // focus on the stable inspector so Escape still reaches it.
            event.currentTarget.closest<HTMLElement>('.mimir-pdf-inspector')?.focus()
            onRefresh()
          }}
        />
        <Button
          type="text"
          icon={<X size={16} />}
          aria-label={closeLabel}
          title={closeLabel}
          onClick={onClose}
        />
      </div>
    </header>
  )
}
