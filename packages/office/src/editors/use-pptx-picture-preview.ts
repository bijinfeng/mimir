import { useEffect, useRef, useState } from 'react'
import { preparePptxPictureFile } from '../pptx-image-display.js'

/** File preparation belongs to the open inspector and never uploads by itself. */
export function usePptxPicturePreview() {
  const [selected, setSelected] = useState<Awaited<
    ReturnType<typeof preparePptxPictureFile>
  > | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef<AbortController | null>(null)
  useEffect(() => () => pending.current?.abort(), [])
  const cancel = () => {
    pending.current?.abort()
    pending.current = null
    setPreparing(false)
  }
  const clear = () => {
    cancel()
    setSelected(null)
    setError('')
  }
  const choose = async (file: File) => {
    pending.current?.abort()
    const controller = new AbortController()
    pending.current = controller
    setSelected(null)
    setError('')
    setPreparing(true)
    try {
      const prepared = await preparePptxPictureFile(file, controller.signal)
      if (pending.current === controller && !controller.signal.aborted) setSelected(prepared)
    } catch (cause) {
      if (pending.current === controller && !controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : '无法准备图片预览，请重新选择')
    } finally {
      if (pending.current === controller) {
        pending.current = null
        setPreparing(false)
      }
    }
  }
  return { selected, preparing, error, choose, clear, cancel }
}
