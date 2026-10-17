import { describe, expect, it, vi } from 'vitest'
import { PdfAgentHandle, type PdfAgentHooks, type PdfAgentSnapshot } from './pdf-agent.js'
const prepared = { url: 'mimir-generated://123', width: 4, height: 2 }
function harness(assetTool: NonNullable<PdfAgentHooks['assetTool']>) {
  const bytes = new Uint8Array([1, 2, 3])
  const snapshot: PdfAgentSnapshot = {
    bytes,
    pages: [
      {
        origin: { kind: 'original', index: 0 },
        rotation: 90,
        base: { width: 300, height: 400 },
        crop: null,
        paper: null,
      },
    ],
    activePage: 0,
    dirty: true,
  }
  const captureState = vi.fn<NonNullable<PdfAgentHooks['captureState']>>(),
    textIndex = vi.fn<NonNullable<PdfAgentHooks['textIndex']>>(),
    contentTool = vi.fn<NonNullable<PdfAgentHooks['contentTool']>>(),
    applyPages = vi.fn<NonNullable<PdfAgentHooks['applyPages']>>()
  const handle = new PdfAgentHandle('pdf-a', {
    snapshot: () => snapshot,
    captureState,
    textIndex,
    contentTool,
    assetTool,
    applyPages,
    gotoPage: vi.fn<NonNullable<PdfAgentHooks['gotoPage']>>(),
    insertText: vi.fn<NonNullable<PdfAgentHooks['insertText']>>(),
    pendingTextInserts: () => [
      { id: 'Tpending', pageIndex: 0, x: 1, y: 2, text: 'UNSAVED', fontSize: 12, color: [0, 0, 0] },
    ],
    replaceTextInserts: vi.fn<NonNullable<PdfAgentHooks['replaceTextInserts']>>(),
    restoreState: vi.fn<NonNullable<PdfAgentHooks['restoreState']>>(),
  })
  return { handle, captureState, textIndex, contentTool, applyPages, snapshot }
}
describe('PDF asset pure reads', () => {
  it('prepares without page/index/materialization/checkpoint and keeps pending edits/bytes/version/round untouched', async () => {
    const asset = vi.fn<NonNullable<PdfAgentHooks['assetTool']>>().mockResolvedValue(prepared),
      h = harness(asset),
      version = h.handle.getVersion()
    const result = await h.handle.execute(
      'generate_image',
      { prompt: ' sky ', aspect_ratio: '16:9' },
      { roundId: 'asset-round' },
    )
    expect(result).toMatchObject({ ok: true, changed: false, version, data: prepared })
    expect(asset).toHaveBeenCalledWith(
      { op: 'generate_image', prompt: 'sky', aspect_ratio: '16:9' },
      version,
      expect.any(AbortSignal),
    )
    expect(h.captureState).not.toHaveBeenCalled()
    expect(h.textIndex).not.toHaveBeenCalled()
    expect(h.contentTool).not.toHaveBeenCalled()
    expect(h.applyPages).not.toHaveBeenCalled()
    expect(h.snapshot.dirty).toBe(true)
    expect(h.snapshot.bytes).toEqual(new Uint8Array([1, 2, 3]))
    expect(h.handle.undoRound('asset-round')).toBe(false)
    expect(await h.handle.execute('image_search', { query: 'sky', maxResults: 2 })).toMatchObject({
      ok: false,
      changed: false,
      version,
    })
  })
  it.each(['manual', 'dispose', 'stop'] as const)(
    'aborts provider work and refuses late results after %s',
    async (mode) => {
      let release!: (value: unknown) => void
      let received!: AbortSignal
      const h = harness(async (_operation, _version, signal) => {
        received = signal
        return new Promise((resolve) => {
          release = resolve
        })
      })
      const controller = new AbortController()
      const pending = h.handle.execute(
        'image_search',
        { query: 'sky' },
        { signal: controller.signal },
      )
      if (mode === 'manual') {
        h.handle.markManualChange()
        h.handle.markManualChange()
      } // edit→Undo also advances version
      else if (mode === 'dispose') h.handle.dispose()
      else controller.abort()
      expect(received.aborted).toBe(true)
      release(prepared)
      expect(await pending).toMatchObject({ ok: false, changed: false })
      expect(h.captureState).not.toHaveBeenCalled()
    },
  )
})
