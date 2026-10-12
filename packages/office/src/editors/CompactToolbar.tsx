import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import {
  ToolbarDivider,
  ToolbarMenu,
  ToolbarMenuFields,
  ToolbarMenuSeparator,
} from '../shell/EditorShell.js'

export interface CompactToolbarSection {
  key: string
  label: string
  /** Minimum editor-column width needed to keep this section in the command row. */
  minWidth: number
  content: ReactNode
}

function CompactOverflowPanel({
  sections,
  close,
}: {
  sections: readonly CompactToolbarSection[]
  close: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const panel = panelRef.current?.parentElement
    const editor = panel?.closest<HTMLElement>('.mimir-editor')
    if (!panel || !editor) return
    const bounds = editor.getBoundingClientRect()
    const left = Math.max(0, bounds.left)
    const right = Math.min(window.innerWidth, bounds.right)
    const available = right - left - 16
    if (available <= 0) return
    const width = Math.min(320, available)
    // ToolbarMenu uses viewport coordinates. Keep its panel inside the editor column.
    panel.style.width = `${width}px`
    panel.style.left = `${right - width - 8}px`
    const top = Number.parseFloat(panel.style.top)
    const bottom = Number.parseFloat(panel.style.bottom)
    const room = Number.isFinite(top)
      ? window.innerHeight - top - 8
      : Number.isFinite(bottom)
        ? window.innerHeight - bottom - 8
        : window.innerHeight - 16
    panel.style.maxHeight = `${Math.max(0, Math.min(window.innerHeight * 0.6, room))}px`
  })

  useEffect(() => {
    // ToolbarMenu focuses its panel when opened; move focus to the first actual command.
    queueMicrotask(() =>
      panelRef.current
        ?.querySelector<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )
        ?.focus(),
    )
  }, [])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return
    const focusable = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    event.stopPropagation()
    if (
      (event.shiftKey && document.activeElement === first) ||
      (!event.shiftKey && document.activeElement === last)
    ) {
      event.preventDefault()
      close()
    }
  }

  return (
    <div ref={panelRef} className="mimir-compact-toolbar__panel" onKeyDown={onKeyDown}>
      {sections.map((section, index) => (
        <div key={section.key}>
          {index > 0 && <ToolbarMenuSeparator />}
          <ToolbarMenuFields label={section.label}>{section.content}</ToolbarMenuFields>
        </div>
      ))}
    </div>
  )
}

/** The same control tree is mounted either in the row or in the named overflow panel. */
export function CompactToolbar({
  sections,
  overflowLabel = '更多工具',
}: {
  sections: readonly CompactToolbarSection[]
  overflowLabel?: string
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  // Keep the existing full toolbar in DOM-only test environments without layout metrics.
  const [width, setWidth] = useState(1200)

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    const measured = host.getBoundingClientRect().width
    if (measured > 0) setWidth(measured)
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) setWidth(entry.contentRect.width)
    })
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  const visible = sections.filter((section) => width >= section.minWidth)
  const hidden = sections.filter((section) => width < section.minWidth)

  return (
    <div ref={hostRef} className="mimir-compact-toolbar">
      {visible.map((section, index) => (
        <span className="mimir-compact-toolbar__section" key={section.key}>
          {index > 0 && <ToolbarDivider />}
          {section.content}
        </span>
      ))}
      {hidden.length > 0 && (
        <ToolbarMenu
          label={overflowLabel}
          text="更多"
          panelWidth={320}
          renderPanel={(close) => <CompactOverflowPanel sections={hidden} close={close} />}
        />
      )}
    </div>
  )
}
