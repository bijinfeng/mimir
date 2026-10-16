import { useEffect, useRef, useState } from 'react'
import { ToolbarButton, ToolbarNote } from '../shell/EditorShell.js'
import './html-presentation.css'

export function HtmlPresentation({ html, onClose }: { html: string; onClose: () => void }) {
  const host = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const element = host.current
    element?.querySelector<HTMLButtonElement>('button')?.focus()
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('keydown', escape)
      if (document.fullscreenElement === element) void document.exitFullscreen().catch(() => {})
      previousFocus?.focus()
    }
  }, [onClose])
  return (
    <div
      ref={host}
      className="mimir-html-presentation"
      role="dialog"
      aria-modal="true"
      aria-label="HTML 演示"
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return
        const controls = host.current?.querySelectorAll<HTMLElement>('button, iframe')
        const first = controls?.[0]
        const last = controls?.[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }}
    >
      <div className="mimir-html-presentation__bar">
        <ToolbarButton label="退出演示" onClick={onClose}>
          退出演示
        </ToolbarButton>
        <ToolbarButton
          label="全屏演示"
          onClick={() => {
            if (!host.current?.requestFullscreen) {
              setError('当前环境不支持全屏，请使用窗口演示。')
              return
            }
            void host.current
              .requestFullscreen()
              .catch(() => setError('无法进入全屏，请使用窗口演示。'))
          }}
        >
          全屏
        </ToolbarButton>
        {error && <ToolbarNote>{error}</ToolbarNote>}
      </div>
      <iframe
        title="演示页面"
        srcDoc={html}
        sandbox="allow-scripts allow-forms allow-popups allow-modals"
        referrerPolicy="no-referrer"
      />
    </div>
  )
}
