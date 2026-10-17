import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import type { PptxManualAsset } from '@mimir/shared'
import {
  parsePptxClipboardMarker,
  pptxClipboardImageFile,
  pptxClipboardTextTarget,
  validatePptxClipboardImage,
} from '../pptx-system-clipboard.js'

export interface PptxClipboardBridgeProps {
  canvasRef: RefObject<HTMLDivElement | null>
  contextKey: string
  slide: number
  disabled: boolean
  copyInput: (cut: boolean, slides: readonly number[] | null) => PptxManualAsset
  execute: (input: PptxManualAsset, options: { signal: AbortSignal }) => Promise<unknown>
  insertImage?: (
    file: File,
    signal: AbortSignal,
    center?: { x: number; y: number },
  ) => Promise<boolean>
  onError: (message: string) => void
}
/** Native paste event preserves OS arbitration and leaves text inputs/rich selection alone. */
export function PptxClipboardBridge(props: PptxClipboardBridgeProps) {
  const latest = useRef(props)
  const pending = useRef<AbortController | null>(null)
  useLayoutEffect(() => {
    latest.current = props
  })
  const context = useRef(props.contextKey)
  useLayoutEffect(() => {
    context.current = props.contextKey
    pending.current?.abort()
    pending.current = null
    return () => {
      pending.current?.abort()
    }
  }, [props.contextKey])
  useEffect(() => {
    const root = () => latest.current.canvasRef.current?.closest('.mimir-editor')
    const eligible = (target: EventTarget | null) =>
      target instanceof Element &&
      !!root()?.contains(target) &&
      !pptxClipboardTextTarget(target) &&
      !!target.closest(
        '.mimir-pptx-slide,.mimir-page-browser__sidebar,.mimir-pptx-sorter,.mimir-pptx-outline',
      )
    const run = (action: (signal: AbortSignal) => Promise<unknown>) => {
      if (pending.current || latest.current.disabled) return
      const controller = new AbortController()
      pending.current = controller
      // Selection validation may throw synchronously before execute returns a promise.
      void (async () => {
        await action(controller.signal)
      })()
        .catch((cause: unknown) => {
          if (!controller.signal.aborted)
            latest.current.onError(cause instanceof Error ? cause.message : '复制粘贴失败')
        })
        .finally(() => {
          if (pending.current === controller) pending.current = null
        })
    }
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        pending.current?.abort()
        return
      }
      if (
        event.defaultPrevented ||
        !eligible(event.target) ||
        latest.current.disabled ||
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.shiftKey
      )
        return
      const key = event.key.toLowerCase()
      if (key !== 'c' && key !== 'x') return
      // Allow a user's native text selection outside the editing controls too.
      if (window.getSelection()?.toString()) return
      event.preventDefault()
      const target = event.target as Element
      const selectedSlides = target.closest('.mimir-pptx-sorter')
        ? Array.from(
            root()!.querySelectorAll<HTMLElement>('.mimir-pptx-sorter-item[aria-selected="true"]'),
          ).map((item) => Number(item.dataset.slideIndex))
        : target.closest('.mimir-page-browser__sidebar,.mimir-pptx-outline')
          ? [latest.current.slide]
          : null
      run((signal) =>
        latest.current.execute(latest.current.copyInput(key === 'x', selectedSlides), { signal }),
      )
    }
    const paste = (event: ClipboardEvent) => {
      if (
        event.defaultPrevented ||
        !eligible(event.target) ||
        latest.current.disabled ||
        !event.clipboardData
      )
        return
      const files = Array.from(event.clipboardData.files)
      if (files.length) {
        event.preventDefault()
        run(async (signal) => {
          const file = pptxClipboardImageFile(files)
          if (!latest.current.insertImage)
            throw new Error('当前宿主未提供图片插入，请使用已配置的文档编辑器')
          if (file) {
            await validatePptxClipboardImage(file, signal)
            await latest.current.insertImage(file, signal)
          }
        })
        return
      }
      const input = parsePptxClipboardMarker(
        event.clipboardData.getData('text/plain'),
        latest.current.slide,
      )
      if (!input) return
      event.preventDefault()
      run((signal) => latest.current.execute(input, { signal }))
    }
    const stageOf = (target: EventTarget | null) =>
      target instanceof Element && root()?.contains(target)
        ? target.closest<HTMLElement>('.mimir-pptx-stage')
        : null
    const dragover = (event: DragEvent) => {
      const stage = stageOf(event.target)
      if (!stage || !event.dataTransfer?.types.includes('Files')) return
      // File drags must never navigate away from an unsaved document.
      event.preventDefault()
      if (latest.current.disabled || !latest.current.insertImage) {
        event.dataTransfer.dropEffect = 'none'
        return
      }
      event.dataTransfer.dropEffect = 'copy'
      stage.dataset.imageDrop = 'true'
    }
    const clearDrop = () =>
      root()
        ?.querySelectorAll<HTMLElement>('[data-image-drop]')
        .forEach((stage) => {
          delete stage.dataset.imageDrop
        })
    const dragleave = (event: DragEvent) => {
      const stage = stageOf(event.target)
      if (stage && (!(event.relatedTarget instanceof Node) || !stage.contains(event.relatedTarget)))
        clearDrop()
    }
    const drop = (event: DragEvent) => {
      const stage = stageOf(event.target)
      clearDrop()
      if (!stage || !event.dataTransfer?.types.includes('Files')) return
      event.preventDefault()
      const files = Array.from(event.dataTransfer.files)
      const rect = latest.current.canvasRef.current?.getBoundingClientRect()
      const center =
        rect && rect.width > 0 && rect.height > 0
          ? {
              x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
              y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
            }
          : undefined
      run(async (signal) => {
        const file = pptxClipboardImageFile(files)
        if (!latest.current.insertImage) throw new Error('当前宿主未提供图片插入')
        if (file) {
          await validatePptxClipboardImage(file, signal)
          await latest.current.insertImage(file, signal, center)
        }
      })
    }
    window.addEventListener('keydown', keydown)
    window.addEventListener('paste', paste)
    window.addEventListener('dragover', dragover)
    window.addEventListener('dragleave', dragleave)
    window.addEventListener('drop', drop)
    window.addEventListener('dragend', clearDrop)
    window.addEventListener('blur', clearDrop)
    return () => {
      window.removeEventListener('keydown', keydown)
      window.removeEventListener('paste', paste)
      window.removeEventListener('dragover', dragover)
      window.removeEventListener('dragleave', dragleave)
      window.removeEventListener('drop', drop)
      window.removeEventListener('dragend', clearDrop)
      window.removeEventListener('blur', clearDrop)
      clearDrop()
    }
  }, [])
  return null
}
