import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { XlsxValidationConfirmationError, type XlsxValidationWarning } from '@mimir/shared'
import type { XlsxAgentHandle } from '../agent/xlsx-agent.js'

/** The manual confirmation never enters model arguments or survives another draft. */
export function useXlsxCellInput(
  context: string,
  confirmationContext: string,
  source: unknown,
  view: unknown,
  getHandle: () => XlsxAgentHandle | null,
  onSuccess: (confirmed: boolean) => void,
  onError: (message: string) => void,
) {
  const request = useRef<{
    controller: AbortController
    handle: XlsxAgentHandle
    version: number
    operation: unknown
    context: string
    confirmationContext: string
    confirmationInvalidated?: boolean
    source: unknown
    view: unknown
    warning?: XlsxValidationWarning
  } | null>(null)
  const lock = useRef(false)
  const [notice, setWarning] = useState<{
    warning: XlsxValidationWarning
    context: string
    confirmationContext: string
    source: unknown
    view: unknown
  } | null>(null)
  const [binding, setBinding] = useState({ context, confirmationContext, source, view })
  if (
    binding.context !== context ||
    binding.confirmationContext !== confirmationContext ||
    binding.source !== source ||
    binding.view !== view
  ) {
    setBinding({ context, confirmationContext, source, view })
    setWarning(null)
  }
  const liveConfirmationContext = useRef(confirmationContext)
  const cancel = useCallback(() => {
    request.current?.controller.abort()
    request.current = null
    lock.current = false
    setWarning(null)
  }, [])
  const invalidateConfirmation = useCallback(() => {
    const current = request.current
    if (current) {
      current.confirmationInvalidated = true
      if (current.warning) {
        current.controller.abort()
        request.current = null
        lock.current = false
      }
    }
    setWarning(null)
  }, [])
  // UI navigation and saving invalidate permission to confirm an invalid value,
  // not an ordinary edit that the user already submitted. A late warning from
  // the old UI context must still be discarded instead of reopening a prompt.
  useLayoutEffect(() => {
    liveConfirmationContext.current = confirmationContext
    const current = request.current
    if (current && current.confirmationContext !== confirmationContext) {
      current.confirmationInvalidated = true
      if (current.warning) {
        current.controller.abort()
        request.current = null
        lock.current = false
      }
    }
  }, [confirmationContext])
  useLayoutEffect(() => {
    const current = request.current
    if (
      current &&
      (current.context !== context || current.source !== source || current.view !== view)
    ) {
      current.controller.abort()
      request.current = null
      lock.current = false
    }
    return () => {
      request.current?.controller.abort()
      request.current = null
      lock.current = false
    }
  }, [context, source, view])
  const submit = async (operation?: unknown) => {
    if (lock.current) return
    const handle = getHandle()
    if (!handle) return
    let current = request.current
    if (operation !== undefined) {
      cancel()
      current = {
        controller: new AbortController(),
        handle,
        version: handle.getVersion(),
        operation,
        context,
        confirmationContext,
        source,
        view,
      }
      request.current = current
    }
    if (!current || current.handle !== handle || current.controller.signal.aborted) return
    if (handle.getVersion() !== current.version) {
      cancel()
      return
    }
    lock.current = true
    try {
      await handle.execute(
        'propose_operations',
        { operations: [current.operation] },
        {
          expectedVersion: current.version,
          signal: current.controller.signal,
          validationConsent:
            (current.operation as { op?: string }).op === 'set_cell'
              ? { intent: 'manual_cell', token: current.warning?.token }
              : undefined,
        },
      )
      if (request.current === current && !current.controller.signal.aborted) {
        request.current = null
        setWarning(null)
        onSuccess(current.warning !== undefined)
      }
    } catch (error) {
      if (request.current !== current || current.controller.signal.aborted) return
      if (error instanceof XlsxValidationConfirmationError) {
        if (
          current.confirmationInvalidated ||
          current.confirmationContext !== liveConfirmationContext.current
        ) {
          current.controller.abort()
          request.current = null
          return
        }
        request.current = { ...current, warning: error.warning }
        setWarning({ warning: error.warning, context, confirmationContext, source, view })
      } else {
        cancel()
        onError(error instanceof Error ? error.message : '输入未应用')
      }
    } finally {
      if (request.current?.controller === current.controller || !request.current)
        lock.current = false
    }
  }
  const warning =
    notice?.context === context &&
    notice.confirmationContext === confirmationContext &&
    notice.source === source &&
    notice.view === view
      ? notice.warning
      : null
  return { warning, cancel, invalidateConfirmation, submit }
}
