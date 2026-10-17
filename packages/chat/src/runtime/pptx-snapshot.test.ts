import { expect, it } from 'vitest'
import type { ChatDraftAgent, ChatPptxSnapshot } from '../types.js'
import { PptxSnapshotRegistry, assertSnapshotTarget, SNAPSHOT_LIMIT } from './pptx-snapshot.js'
import { snapshotBefore } from './chat-context.js'

const draft = (index = 0): ChatPptxSnapshot => ({
  sourceIsCurrent: () => true,
  id: `snapshot-${index}`,
  text: '美化本页',
  target: { documentId: 'doc', slidePath: 'ppt/slides/slide4.xml', slideIndex: 2, version: 7 },
  image: {
    name: `第3页截图-snapshot-${index}.png`,
    mimeType: 'image/png',
    dataUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/b9sAAAAASUVORK5CYII=',
    width: 1,
    height: 1,
  },
})
const targetAgent = (overrides: Partial<ChatDraftAgent> = {}): ChatDraftAgent => ({
  format: 'pptx',
  documentId: 'doc',
  getVersion: () => 7,
  getContext: () => ({ slides: [{}, {}, { id: 's_4' }], selection: { slideIndex: 2 } }),
  ...overrides,
})
it('binds the attachment to its exact document, page index/path and unsaved version', () => {
  expect(() => assertSnapshotTarget(draft(), targetAgent())).not.toThrow()
  for (const agent of [
    undefined,
    targetAgent({ documentId: 'other' }),
    targetAgent({ getVersion: () => 8 }),
    targetAgent({
      getContext: () => ({ slides: [{}, {}, { id: 's_5' }], selection: { slideIndex: 2 } }),
    }),
    targetAgent({
      getContext: () => ({ slides: [{}, {}, { id: 's_4' }], selection: { slideIndex: 1 } }),
    }),
  ])
    expect(() => assertSnapshotTarget(draft(), agent)).toThrow('页面或版本已变化')
})
it('keeps bounded ephemeral snapshots and never evicts a queued target', () => {
  const registry = new PptxSnapshotRegistry()
  const entries = Array.from({ length: SNAPSHOT_LIMIT }, (_, index) => draft(index))
  entries.forEach((snapshot) => registry.add(snapshot))
  expect(() =>
    registry.add(
      draft(4),
      entries.map((entry) => entry.image.name),
    ),
  ).toThrow('等待发送')
  registry.add(
    draft(4),
    entries.slice(1).map((entry) => entry.image.name),
  )
  expect(() => registry.get(entries[0]!.image.name)).toThrow('目标已失效')
  expect(registry.byId(entries[1]!.id)).toBe(entries[1])
})
it('restores the PNG from a queued file part only if it still matches the registered bytes', () => {
  const registry = new PptxSnapshotRegistry()
  const snapshot = draft()
  registry.add(snapshot)
  expect(
    registry.restoreParts([
      { type: 'file', filename: snapshot.image.name, data: snapshot.image.dataUrl },
    ]),
  ).toEqual([snapshot])
  expect(() =>
    registry.restoreParts([
      { type: 'file', filename: snapshot.image.name, data: 'data:image/png;base64,eA==' },
    ]),
  ).toThrow('与原草稿不符')
  expect(registry.restoreParts([{ type: 'text' }])).toEqual([])
})
it('finds a failed turn’s own screenshot instead of a later user’s attachment', () => {
  const name = draft().image.name
  const messages = [
    { role: 'user', attachments: [{ name }] },
    { role: 'assistant' },
    { role: 'user', attachments: [{ name: 'another.png' }] },
  ]
  expect(snapshotBefore(messages, 1)).toBe(name)
  expect(snapshotBefore(messages, 2)).toBeUndefined()
})
