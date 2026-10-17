import { expect, it, vi } from 'vitest'
import { PPTX_DECK_STREAM_MAX_EVENTS } from '@mimir/shared'
import type { PptxHostRequest } from '../services/pptx-agent-host.js'
import { pptxDeckStream } from '../services/pptx-deck-stream.js'

const state = vi.hoisted(() => ({ host: vi.fn<(request: PptxHostRequest) => Promise<unknown>>() }))
vi.mock('../services/pptx-agent-host.js', () => ({ applyPptxOpsOnHost: state.host }))

const request = (): PptxHostRequest & { generationId: string } => ({
  generationId: 'independent',
  documentId: 'deck',
  bytes: new Uint8Array([80, 75, 3, 4]),
  expectedVersion: 0,
  ops: [],
  action: 'generate_deck',
})
const progress = (completed = 0, stage: 'planning' | 'generating' | 'checkpoint' = 'planning') => ({
  generationId: 'independent',
  total: 1,
  completed,
  stage,
  insertMode: 'replace' as const,
  originalPages: 1,
})

it('independent: does not advance producer past an unread wire event', async () => {
  const drained: string[] = []
  state.host.mockReset().mockImplementation(async (input) => {
    await input.onDeckProgress!(progress())
    drained.push('planning')
    await input.onDeckProgress!(progress(0, 'generating'))
    drained.push('generating')
    await input.onDeckProgress!(progress(1, 'checkpoint'), {
      bytes: new Uint8Array([80, 75, 3, 4]),
      data: { pages: 1, style: '', topic: '' },
      sampleData: false,
    })
    drained.push('checkpoint')
    return { data: { pages: 1 } }
  })
  const response = pptxDeckStream(request())
  await vi.waitFor(() => expect(state.host).toHaveBeenCalledOnce())
  expect(drained).toEqual([])
  const reader = response.body!.getReader()
  expect(JSON.parse(new TextDecoder().decode((await reader.read()).value)).type).toBe('progress')
  await vi.waitFor(() => expect(drained).toEqual(['planning']))
  await reader.read()
  await vi.waitFor(() => expect(drained).toEqual(['planning', 'generating']))
  expect(JSON.parse(new TextDecoder().decode((await reader.read()).value)).type).toBe('checkpoint')
  await vi.waitFor(() => expect(drained).toEqual(['planning', 'generating', 'checkpoint']))
  expect(JSON.parse(new TextDecoder().decode((await reader.read()).value)).type).toBe('done')
  expect((await reader.read()).done).toBe(true)
  reader.releaseLock()
})

it('independent: cancelling an unread stream aborts its blocked producer and settles it', async () => {
  let finished = false
  state.host.mockReset().mockImplementation(async (input) => {
    try {
      await input.onDeckProgress!(progress())
    } finally {
      expect(input.signal!.aborted).toBe(true)
      finished = true
    }
    return { data: { pages: 0 } }
  })
  const response = pptxDeckStream(request())
  await response.body!.cancel()
  await vi.waitFor(() => expect(finished).toBe(true))
})

it('independent: producer event budget ends with a nonrecoverable terminal', async () => {
  state.host.mockReset().mockImplementation(async (input) => {
    for (let i = 0; i <= PPTX_DECK_STREAM_MAX_EVENTS; i++) await input.onDeckProgress!(progress())
    return { data: { pages: 0 } }
  })
  const wire = await pptxDeckStream(request()).text()
  const events = wire
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  expect(events).toHaveLength(PPTX_DECK_STREAM_MAX_EVENTS + 1)
  expect(events.at(-1)).toMatchObject({ type: 'error', recoverable: false })
  expect(events.at(-1).message).toContain('预算')
  expect(events.some((event) => event.type === 'done')).toBe(false)
})
