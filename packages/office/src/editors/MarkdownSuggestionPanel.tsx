import type { Editor } from '@tiptap/core'
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

/** Both caret menus keep keyboard input in the editor, including while scrolling. */
export function MarkdownSuggestionPanel({
  editor,
  anchor,
  width,
  maxHeight,
  selected,
  role,
  label,
  className,
  children,
}: {
  editor: Editor
  anchor?: number
  width: number
  maxHeight: number
  selected: number
  role: 'menu' | 'listbox'
  label: string
  className: string
  children: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' })
  useLayoutEffect(() => {
    const element = panel.current
    if (!element) return
    const update = () => {
      if (editor.isDestroyed || !element.isConnected) return
      const rect = editor.view.coordsAtPos(
        Math.min(anchor ?? editor.state.selection.from, editor.state.doc.content.size),
      )
      const viewport = window.visualViewport
      const leftEdge = (viewport?.offsetLeft ?? 0) + 8
      const topEdge = (viewport?.offsetTop ?? 0) + 8
      const rightEdge = leftEdge + (viewport?.width ?? window.innerWidth) - 16
      const bottomEdge = topEdge + (viewport?.height ?? window.innerHeight) - 16
      const menuWidth = Math.min(width, Math.max(0, rightEdge - leftEdge))
      const below = Math.max(0, bottomEdge - rect.bottom - 6)
      const above = Math.max(0, rect.top - 6 - topEdge)
      const wantedHeight = Math.min(maxHeight, element.scrollHeight)
      const openBelow = below >= wantedHeight || below >= above
      const available = Math.min(
        maxHeight,
        Math.max(0, bottomEdge - topEdge),
        openBelow ? below : above,
      )
      const height = Math.min(wantedHeight, available)
      setPosition({
        position: 'fixed',
        left: Math.max(leftEdge, Math.min(rect.left, rightEdge - menuWidth)),
        top: Math.max(
          topEdge,
          Math.min(openBelow ? rect.bottom + 6 : rect.top - 6 - height, bottomEdge - height),
        ),
        width: menuWidth,
        maxHeight: available,
      })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    observer.observe(editor.view.dom)
    const contentObserver = new MutationObserver(update)
    contentObserver.observe(element, { childList: true, subtree: true, characterData: true })
    editor.on('selectionUpdate', update)
    editor.on('update', update)
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    return () => {
      observer.disconnect()
      contentObserver.disconnect()
      editor.off('selectionUpdate', update)
      editor.off('update', update)
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
    }
  }, [editor, anchor, width, maxHeight])

  useLayoutEffect(() => {
    const element = panel.current
    const active = element?.querySelectorAll<HTMLElement>('[role="menuitem"], [role="option"]')[
      selected
    ]
    if (!element || !active) return
    // Scroll this list only; scrollIntoView can move the document and its caret.
    const bounds = element.getBoundingClientRect()
    const item = active.getBoundingClientRect()
    if (item.top < bounds.top) element.scrollTop -= bounds.top - item.top
    else if (item.bottom > bounds.bottom) element.scrollTop += item.bottom - bounds.bottom
  })

  return (
    <div ref={panel} className={className} role={role} aria-label={label} style={position}>
      {children}
    </div>
  )
}
