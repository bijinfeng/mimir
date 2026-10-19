import jsonPatch from 'fast-json-patch'
import type { Operation } from 'fast-json-patch'

/** Non-visual protocol state is isolated from model messages and never executes payloads. */
export interface ProtocolState {
  shared: unknown
  diagnostics: string[]
}
export const emptyProtocolState = (): ProtocolState => ({ shared: {}, diagnostics: [] })
export function reduceProtocolState(
  previous: ProtocolState,
  event: Record<string, unknown>,
): ProtocolState {
  try {
    if (event.type === 'STATE_SNAPSHOT')
      return { ...previous, shared: structuredClone(event.snapshot) }
    if (event.type === 'STATE_DELTA') {
      if (!Array.isArray(event.delta)) throw new Error('STATE_DELTA 必须是 RFC 6902 数组')
      // Validate every operation against a private clone; failure never mutates last valid state.
      const shared = jsonPatch.applyPatch(
        structuredClone(previous.shared),
        event.delta as Operation[],
        true,
        false,
        true,
      ).newDocument
      return { ...previous, shared }
    }
    return previous
  } catch (failure) {
    return { ...previous, diagnostics: [...previous.diagnostics.slice(-49), String(failure)] }
  }
}
