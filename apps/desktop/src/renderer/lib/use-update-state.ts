import type { DesktopUpdateState } from '@mimir/shared/desktop'
import { useEffect, useState } from 'react'

type UpdateSource = {
  getState(): Promise<DesktopUpdateState>
  onState(listener: (state: DesktopUpdateState) => void): () => void
}

/** An initial IPC response must never overwrite a newer pushed state. */
export function useUpdateState(api: UpdateSource | undefined) {
  const [state, setState] = useState<DesktopUpdateState>()
  const [failedAttempt, setFailedAttempt] = useState<number | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!api) return
    let alive = true
    let received = false
    const unsubscribe = api.onState((value) => {
      received = true
      if (alive) {
        setState(value)
        setFailedAttempt(null)
      }
    })
    void api
      .getState()
      .then((value) => {
        if (alive && !received) {
          setState(value)
          setFailedAttempt(null)
        }
      })
      .catch(() => {
        if (alive && !received) setFailedAttempt(attempt)
      })
    return () => {
      alive = false
      unsubscribe()
    }
  }, [api, attempt])
  return {
    state,
    readError: failedAttempt === attempt,
    reload: () => setAttempt((value) => value + 1),
  }
}
