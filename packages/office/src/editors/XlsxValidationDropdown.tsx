import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button } from 'antd'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import type { PredicateScalar } from '../xlsx-formula-predicate.js'
import './xlsx-validation.css'

export function XlsxValidationDropdown({
  values,
  disabled,
  onPick,
}: {
  values: PredicateScalar[]
  disabled: boolean
  onPick: (value: PredicateScalar) => void
}) {
  const trigger = useRef<HTMLButtonElement>(null),
    list = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false),
    [index, setIndex] = useState(0)
  const listId = useId()
  const options = useMemo(() => {
    const seen = new Map<string, number>()
    return values.map((value) => {
      const identity = `${typeof value}:${String(value)}`,
        occurrence = seen.get(identity) ?? 0
      seen.set(identity, occurrence + 1)
      return { value, id: `${identity}:${occurrence}` }
    })
  }, [values])
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const [position, setPosition] = useState({ left: 0, top: 0, maxHeight: 200, width: 280 })
  const close = () => {
    setOpen(false)
    trigger.current?.focus()
  }
  useLayoutEffect(() => {
    if (!open || !trigger.current || !container) return
    const area = container.getBoundingClientRect()
    const minLeft = Math.max(8, area.left + 8),
      right = Math.min(window.innerWidth - 8, area.right || window.innerWidth - 8)
    const width = Math.min(280, Math.max(80, right - minLeft))
    const rect = trigger.current.getBoundingClientRect(),
      below = window.innerHeight - rect.bottom - 8
    const height = Math.min(200, Math.max(60, below >= 100 ? below : rect.top - 8))
    setPosition({
      left: Math.max(minLeft, Math.min(rect.left, right - width)),
      top: below >= 100 ? rect.bottom + 4 : Math.max(8, rect.top - height - 4),
      maxHeight: height,
      width,
    })
    list.current?.focus()
  }, [open, container])
  useEffect(() => {
    if (!open) return
    const dismiss = (event: Event) => {
      if (event.type === 'resize') {
        setOpen(false)
        return
      }
      if (event.type === 'scroll') {
        if (!(event.target instanceof Node) || !list.current?.contains(event.target)) setOpen(false)
        return
      }
      if (
        event.target instanceof Node &&
        !list.current?.contains(event.target) &&
        !trigger.current?.contains(event.target)
      )
        setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss, true)
    document.addEventListener('scroll', dismiss, true)
    window.addEventListener('resize', dismiss)
    return () => {
      document.removeEventListener('pointerdown', dismiss, true)
      document.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('resize', dismiss)
    }
  }, [open])
  const pick = (at: number) => {
    onPick(values[at] ?? null)
    close()
  }
  return (
    <>
      <Button
        ref={trigger}
        className="me-tb mimir-xlsx-validation-cell-trigger"
        size="small"
        variant="text"
        color="default"
        autoInsertSpace={false}
        aria-label="选择验证列表值"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        title={disabled ? '正在应用或工作表已保护' : '选择验证列表值（Alt+↓）'}
        disabled={disabled}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          setContainer(trigger.current?.closest<HTMLElement>('.mimir-editor') ?? null)
          setIndex(0)
          setOpen(!open)
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            event.stopPropagation()
            setContainer(trigger.current?.closest<HTMLElement>('.mimir-editor') ?? null)
            setIndex(0)
            setOpen(true)
          }
        }}
      >
        <ChevronDown size={14} />
      </Button>
      {open &&
        container &&
        createPortal(
          <div
            ref={list}
            id={listId}
            role="listbox"
            aria-label="当前单元格验证列表"
            aria-activedescendant={`${listId}-option-${index}`}
            tabIndex={-1}
            className="mimir-xlsx-validation-list"
            style={position}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === 'Escape') {
                event.preventDefault()
                close()
              }
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                pick(index)
              }
              let next = index
              if (event.key === 'ArrowDown') next = Math.min(values.length - 1, index + 1)
              if (event.key === 'ArrowUp') next = Math.max(0, index - 1)
              if (event.key === 'Home') next = 0
              if (event.key === 'End') next = values.length - 1
              if (next !== index) {
                event.preventDefault()
                setIndex(next)
                list.current?.children[next]?.scrollIntoView?.({ block: 'nearest' })
              }
              if (event.key === 'Tab') close()
            }}
          >
            {options.map(({ value, id }, at) => (
              <div
                key={id}
                id={`${listId}-option-${at}`}
                role="option"
                aria-selected={at === index}
                className="mimir-xlsx-validation-option"
                onPointerMove={() => setIndex(at)}
                onPointerDown={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                }}
                onClick={() => pick(at)}
              >
                {value === null || value === '' ? '（空白）' : String(value)}
              </div>
            ))}
          </div>,
          container,
        )}
    </>
  )
}
