import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { CaptureResponse, CaptureStage } from '@mimir/shared'
import { api, ApiRequestError } from '../../lib/api'
import { STAGE_ORDER } from './CaptureStages'
import { uncertainResult, validCaptureSource } from './helpers'

interface CaptureFailure {
  message: string
  stage?: CaptureStage
  uncertain: boolean
  kind?: string
}
/** One JSON request; stage results only become known when the server responds. */
export function useCaptureRequest(
  folder: string | null | undefined,
  onCaptured: (id: string) => void,
) {
  const queryClient = useQueryClient()
  const [result, setResult] = useState<CaptureResponse | null>(null)
  const [failure, setFailure] = useState<CaptureFailure | null>(null)
  const [running, setRunning] = useState(false)
  const [settling, setSettling] = useState(false)
  const submitLock = useRef(false)
  const mounted = useRef(true)
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (successTimer.current !== null) clearTimeout(successTimer.current)
    }
  }, [])
  function refresh() {
    for (const key of ['documents', 'counts', 'folders'])
      void queryClient.invalidateQueries({ queryKey: [key] })
  }
  async function submit(value: string) {
    const source = validCaptureSource(value)
    if (!source || submitLock.current) return
    submitLock.current = true
    setRunning(true)
    setResult(null)
    setFailure(null)
    try {
      const response = await api.capture.run(value.trim(), folder ?? undefined)
      refresh()
      if (!mounted.current) return
      setResult(response)
      setRunning(false)
      if (response.documentId) {
        setSettling(true)
        successTimer.current = setTimeout(() => {
          successTimer.current = null
          if (!mounted.current) return
          setSettling(false)
          submitLock.current = false
          onCaptured(response.documentId!)
        }, 260)
      } else submitLock.current = false
    } catch (error) {
      refresh()
      if (!mounted.current) return
      const stage =
        error instanceof ApiRequestError &&
        error.details &&
        typeof error.details === 'object' &&
        'stage' in error.details
          ? error.details.stage
          : undefined
      setFailure({
        message: error instanceof Error ? error.message : '抓取失败',
        stage: STAGE_ORDER.find((item) => item === stage),
        uncertain: uncertainResult(error),
        kind: source.kind,
      })
      setRunning(false)
      submitLock.current = false
    }
  }
  return { result, failure, running, settling, submitLock, submit, refresh }
}
