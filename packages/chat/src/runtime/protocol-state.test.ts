import { describe, expect, it } from 'vitest'
import { emptyProtocolState, reduceProtocolState } from './protocol-state.js'

describe('shared AG-UI state', () => {
  it('applies a valid patch and rejects a partially valid batch atomically', () => {
    const original = reduceProtocolState(emptyProtocolState(), {
      type: 'STATE_SNAPSHOT',
      snapshot: { count: 1, items: ['a'] },
    })
    const changed = reduceProtocolState(original, {
      type: 'STATE_DELTA',
      delta: [{ op: 'replace', path: '/count', value: 2 }],
    })
    expect(changed.shared).toEqual({ count: 2, items: ['a'] })
    expect(original.shared).toEqual({ count: 1, items: ['a'] })
    const rejected = reduceProtocolState(changed, {
      type: 'STATE_DELTA',
      delta: [
        { op: 'replace', path: '/count', value: 3 },
        { op: 'remove', path: '/absent' },
      ],
    })
    expect(rejected.shared).toBe(changed.shared)
    expect(rejected.diagnostics).toHaveLength(1)
  })
  it('rejects prototype writes and treats unknown executable-looking payloads as inert', () => {
    const state = emptyProtocolState()
    expect(
      reduceProtocolState(state, {
        type: 'STATE_DELTA',
        delta: [{ op: 'add', path: '/__proto__/polluted', value: true }],
      }).shared,
    ).toEqual({})
    expect(Object.prototype).not.toHaveProperty('polluted')
    expect(
      reduceProtocolState(state, {
        type: 'CUSTOM',
        name: 'approval',
        value: { component: 'script' },
      }),
    ).toBe(state)
  })
})
