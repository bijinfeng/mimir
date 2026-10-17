import { Hono } from 'hono'
import { conversationsRoute } from '../routes/conversations.js'
import { HttpError } from '../lib/http.js'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { openPptx } from '../../../../packages/office/vendor/packages/pptx-engine/src/index.js'
import type { PptxDeckStreamEvent } from '@mimir/shared'
import { pptxDeckStream } from '../services/pptx-deck-stream.js'
const state = vi.hoisted(() => ({ model: vi.fn<() => Promise<string>>() }))
vi.mock('../services/documents.js', () => ({
  getDocument: async () => ({
    kind: 'file',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    fileExtension: 'pptx',
  }),
}))
vi.mock('../services/model.js', () => ({ modelReady: async () => true, callChat: state.model }))
const original = () =>
  new Uint8Array(
    readFileSync(
      new URL('../../../../packages/office/tests/fixtures/title-layout.pptx', import.meta.url),
    ),
  )
const pages = ['一', '二', '三'].map((n) => ({
  title: `第${n}页`,
  brief: '真实中文材料',
  layout: 'title',
  image_queries: [],
}))
const page = (text: string) =>
  JSON.stringify({
    background: '#FFFFFF',
    elements: [{ kind: 'textbox', x: 0.1, y: 0.1, w: 0.8, h: 0.2, text }],
    images: [],
  })
const request = (insert_mode: 'append' | 'replace', signal?: AbortSignal) => ({
  documentId: 'deck-progress',
  generationId: 'g',
  bytes: original(),
  expectedVersion: 9,
  action: 'generate_deck' as const,
  ops: [{ pages, insert_mode }],
  signal,
})
async function assertUnchangedParts(bytes: Uint8Array, candidate: Uint8Array) {
  const a = await JSZip.loadAsync(bytes),
    b = await JSZip.loadAsync(candidate)
  for (const path of ['ppt/slides/slide1.xml', 'ppt/theme/theme1.xml'])
    expect(await b.file(path)!.async('uint8array')).toEqual(await a.file(path)!.async('uint8array'))
}
const requestForm = (action = 'generate_deck', generationId = 'route-generation') => {
  const value = new FormData()
  value.set('file', new File([original()], 'current.pptx'))
  value.set('documentId', 'deck-progress')
  value.set('expectedVersion', '2')
  value.set('action', action)
  value.set('generationId', generationId)
  value.set('ops', JSON.stringify([{ pages, insert_mode: 'replace' }]))
  return value
}

describe('PPTX real native page checkpoints', () => {
  it.each(['append', 'replace'] as const)(
    'streams complete native pages before a later page fails (%s)',
    async (mode) => {
      let fail!: (error: Error) => void
      state.model
        .mockReset()
        .mockResolvedValueOnce(page('已完成第一页'))
        .mockResolvedValueOnce(page('已完成第二页'))
        .mockImplementationOnce(
          () =>
            new Promise((_, reject) => {
              fail = reject
            }),
        )
      const bytes = original(),
        before = await openPptx(bytes)
      const response = pptxDeckStream(request(mode))
      const reader = response.body!.getReader(),
        decoder = new TextDecoder()
      let pending = ''
      const events: PptxDeckStreamEvent[] = []
      while (
        !events.some(
          (e) =>
            e.type === 'progress' &&
            e.progress.stage === 'generating' &&
            e.progress.completed === 2,
        )
      ) {
        const chunk = await reader.read()
        expect(chunk.done).toBe(false)
        pending += decoder.decode(chunk.value, { stream: true })
        let i = pending.indexOf('\n')
        while (i >= 0) {
          events.push(JSON.parse(pending.slice(0, i)))
          pending = pending.slice(i + 1)
          i = pending.indexOf('\n')
        }
      }
      const checkpoints = events.filter((e) => e.type === 'checkpoint')
      expect(checkpoints.map((e) => e.progress.completed)).toEqual([1, 2])
      for (const [index, e] of checkpoints.entries()) {
        const candidate = new Uint8Array(Buffer.from(e.bytesBase64, 'base64'))
        const opened = await openPptx(candidate)
        expect(opened.deck.slides).toHaveLength(
          (mode === 'append' ? before.deck.slides.length : 0) + index + 1,
        )
        expect(JSON.stringify(opened.deck.slides)).toContain('已完成第一页')
        if (mode === 'append') await assertUnchangedParts(bytes, candidate)
      }
      await vi.waitFor(() => expect(fail).toBeTypeOf('function'))
      fail(new Error('第三页模型失败'))
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) break
        pending += decoder.decode(chunk.value)
      }
      expect(pending).toContain('"recoverable":true')
      expect(pending).toContain('第三页模型失败')
      expect(pending).not.toContain('"done"')
    },
  )
  it('completes all pages with a single terminal and supports transport cancellation', async () => {
    state.model.mockReset().mockResolvedValue(page('真实原生页'))
    const text = await pptxDeckStream(request('replace')).text()
    const events = text
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(events.filter((e) => e.type === 'checkpoint')).toHaveLength(3)
    expect(events.at(-1)).toEqual({ type: 'done', generationId: 'g', completed: 3 })
    const controller = new AbortController()
    controller.abort()
    expect(await pptxDeckStream(request('replace', controller.signal)).text()).toBe('')
  })
  it('exposes the explicit multipart stream route and rejects invalid stream actions/identity', async () => {
    const app = new Hono()
      .route('/', conversationsRoute)
      .onError((error, c) =>
        c.json(
          { error: { message: error.message } },
          error instanceof HttpError ? error.status : 500,
        ),
      )
    state.model.mockReset().mockResolvedValue(page('路由原生页'))
    const response = await app.request('/pptx-agent/apply-ops?stream=1', {
      method: 'POST',
      body: requestForm(),
    })
    expect(response.headers.get('content-type')).toContain('application/x-ndjson')
    const events = (await response.text())
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(events.at(-1)).toEqual({ type: 'done', generationId: 'route-generation', completed: 3 })
    expect(events.filter((e) => e.type === 'checkpoint')).toHaveLength(3)
    const wrong = await app.request('/pptx-agent/apply-ops?stream=1', {
      method: 'POST',
      body: requestForm('apply_ops'),
    })
    expect(wrong.status).toBe(400)
    const missing = await app.request('/pptx-agent/apply-ops?stream=1', {
      method: 'POST',
      body: requestForm('generate_deck', ''),
    })
    expect(missing.status).toBe(400)
  })
})
