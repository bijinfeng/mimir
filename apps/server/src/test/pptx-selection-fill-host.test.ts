import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import JSZip from 'jszip'
import { expect, it, vi } from 'vitest'

vi.mock('../services/documents.js', () => ({
  getDocument: async (id: string) =>
    id === 'pptx-1'
      ? {
          id,
          kind: 'file',
          fileExtension: 'pptx',
          mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        }
      : null,
}))
import { applyPptxOpsOnHost } from '../services/pptx-agent-host.js'
import { openPptxForEdit } from '../../../../packages/office/src/pptx.js'
import { createPptxAgentHandle } from '../../../../packages/office/src/agent/pptx-agent.js'
import { PptxHistory } from '../../../../packages/office/src/pptx-history.js'
import { matchesElementRef } from '../../../../packages/office/vendor/packages/pptx-engine/src/identity.js'
import {
  openPptx,
  savePptx,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/index.js'
import { runTxn } from '../../../../packages/office/vendor/packages/pptx-ops/src/ops/index.js'
import { pptxInsertShapeOp } from '../../../../packages/office/src/editors/pptx-shape-presets.js'
import { pptxSupportsShapeFill } from '../../../../packages/office/src/pptx-element-capabilities.js'
import { selectionFixture } from '../../../../packages/office/src/editors/pptx-selection-test-fixture.js'
import { pptxSelectionContexts } from '../../../../packages/office/src/editors/pptx-selection.js'
import type { PptxManualFill } from '@mimir/shared'

const texture = (id: 'paper' | 'wood') => ({
  kind: 'texture' as const,
  id,
  png: readFileSync(
    new URL(
      `../../../../packages/office/vendor/apps/slides/src/renderer/assets/textures/${id}.png`,
      import.meta.url,
    ),
  ).toString('base64'),
})
async function entries(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes)
  return Object.fromEntries(
    await Promise.all(
      Object.values(zip.files)
        .filter((f) => !f.dir)
        .map(async (f) => [
          f.name,
          createHash('sha256')
            .update(await f.async('uint8array'))
            .digest('hex'),
        ]),
    ),
  )
}
async function setup() {
  const { bytes } = await selectionFixture()
  const session = await openPptxForEdit(bytes)
  const contexts = pptxSelectionContexts(session.slides()[0]!.elements)
  const child = contexts.find((c) => c.depth === 1)!
  const sibling = contexts.find((c) => c.depth === 1 && c !== child)!
  const outside = contexts.find(
    (c) => c.depth === 0 && (c.element.type === 'text' || c.element.type === 'shape'),
  )!
  const targets = [outside, child].map((c) => ({
    elementId: c.ref,
    group: c.group,
  }))
  const host = vi.fn<typeof applyPptxOpsOnHost>(applyPptxOpsOnHost)
  const handle = createPptxAgentHandle(
    session,
    'pptx-1',
    () => ({ slideIndex: 0, elementId: null }),
    () => {},
    host,
  )
  const apply = (input: PptxManualFill) =>
    handle.execute('manual_fill', input, { expectedVersion: session.version() })
  return { bytes, session, contexts, targets, child, sibling, outside, apply, host }
}

it('applies one texture atomically to mixed top-level/group targets through true handle and host, preserving siblings and native history twice', async () => {
  const app = await setup(),
    history = new PptxHistory(app.session)
  const input: PptxManualFill = {
    kind: 'selection',
    slide: 0,
    targets: app.targets,
    source: texture('wood'),
    tile: true,
  }
  expect(await app.apply(input)).toMatchObject({ ok: true, changed: true })
  expect(app.host).toHaveBeenCalledTimes(1)
  const response = await app.host.mock.results[0]!.value
  expect(response.records).toHaveLength(1)
  expect(response.records[0]).toMatchObject({
    op: { op: 'manual_fill', kind: 'selection', source: { kind: 'texture', id: 'wood' } },
    after: { objects: 2 },
  })
  expect(JSON.stringify(response.records)).not.toMatch(/"(?:png|bytes)":/)
  history.record()
  const first = await app.session.save()
  app.session.commit()
  history.synchronize()
  expect(await entries(await app.session.save())).toEqual(await entries(first))
  const reopened = await openPptxForEdit(first)
  const contexts = pptxSelectionContexts(reopened.slides()[0]!.elements)
  for (const { elementId } of app.targets) {
    const el = contexts.find(
      (c) => c.ref === elementId || matchesElementRef(c.element, elementId),
    )!.element
    expect('fill' in el && el.fill).toMatchObject({ type: 'image', mode: 'tile' })
  }
  const sibling = contexts.find((c) => c.ref === app.sibling.ref)!.element
  expect(sibling).toEqual({ ...app.sibling.element, id: sibling.id })
  const zip = await JSZip.loadAsync(first)
  const asset = Buffer.from(input.source.kind === 'texture' ? input.source.png : '', 'base64')
  const media = await Promise.all(
    Object.values(zip.files)
      .filter((f) => f.name.startsWith('ppt/media/') && !f.dir)
      .map((f) => f.async('uint8array')),
  )
  expect(media.filter((bytes) => Buffer.from(bytes).equals(asset))).toHaveLength(1)
  expect(history.undo()).toBe(true)
  expect(await entries(await app.session.save())).toEqual(await entries(app.bytes))
  app.session.commit()
  history.synchronize()
  expect(history.redo()).toBe(true)
  expect(await entries(await app.session.save())).toEqual(await entries(first))
})

it('switches each selected existing image fill mode without copying the first object image', async () => {
  const app = await setup()
  for (const [i, id] of (['paper', 'wood'] as const).entries())
    expect(
      await app.apply({
        kind: 'selection',
        slide: 0,
        targets: [app.targets[i]!],
        source: texture(id),
        tile: true,
      }),
    ).toMatchObject({ ok: true })
  const before = pptxSelectionContexts(app.session.slides()[0]!.elements)
  const fills = app.targets
    .map(
      (t) =>
        before.find((c) => c.ref === t.elementId || matchesElementRef(c.element, t.elementId))!
          .element,
    )
    .map((e) => ('fill' in e ? e.fill : null))
  expect(fills[0]).not.toEqual(fills[1])
  expect(
    await app.apply({
      kind: 'selection',
      slide: 0,
      targets: app.targets,
      source: { kind: 'current' },
      tile: false,
    }),
  ).toMatchObject({ ok: true })
  const reopened = await openPptxForEdit(await app.session.save())
  const after = pptxSelectionContexts(reopened.slides()[0]!.elements)
  app.targets.forEach((t, i) => {
    const e = after.find(
      (c) => c.ref === t.elementId || matchesElementRef(c.element, t.elementId),
    )!.element
    expect('fill' in e && e.fill).toEqual({ ...fills[i], mode: 'stretch', tile: undefined })
  })
})

it('rejects stroke-only connectors before applying any other selected fill', async () => {
  const app = await setup(),
    opened = await openPptx(app.bytes)
  expect(
    runTxn(opened, { isolation: 'atomic', ops: [pptxInsertShapeOp('line', 0, 9144000, 5143500)] })
      .applied,
  ).toBe(true)
  const bytes = await savePptx(opened),
    session = await openPptxForEdit(bytes)
  const line = pptxSelectionContexts(session.slides()[0]!.elements).find(
    (c) => c.element.type === 'shape' && !pptxSupportsShapeFill(c.element),
  )!
  expect(line).toBeDefined()
  const before = await entries(bytes)
  await expect(
    applyPptxOpsOnHost({
      documentId: 'pptx-1',
      bytes,
      expectedVersion: 0,
      action: 'manual_fill',
      ops: [
        {
          kind: 'selection',
          slide: 0,
          targets: [app.targets[0]!, { elementId: line.ref }],
          source: texture('wood'),
          tile: true,
        },
      ],
    }),
  ).rejects.toThrow(/线条不支持填充/)
  expect(await entries(bytes)).toEqual(before)
})

it('rejects invalid selection, aliases, altered texture, unavailable current media and cancellation without changing native bytes', async () => {
  const app = await setup(),
    before = await entries(await app.session.save()),
    version = app.session.version()
  const input = {
    kind: 'selection' as const,
    slide: 0,
    targets: app.targets,
    source: texture('wood'),
    tile: true,
  }
  expect(app.child.element.id).not.toBe(app.child.ref)
  for (const bad of [
    { ...input, targets: [...app.targets, app.targets[0]!] },
    {
      ...input,
      targets: [...app.targets, { elementId: app.child.element.id, group: app.child.group }],
    },
    { ...input, targets: [app.targets[0]!, { elementId: 'missing' }] },
    { ...input, targets: [{ elementId: app.child.ref, group: 'missing' }] },
    { ...input, source: { kind: 'current' } },
    { ...input, source: { ...texture('paper'), id: 'wood' } },
    { ...input, targets: Array.from({ length: 201 }, (_, i) => ({ elementId: String(i) })) },
  ])
    expect(await app.apply(bad as PptxManualFill)).toMatchObject({ ok: false })
  const controller = new AbortController()
  controller.abort()
  await expect(
    applyPptxOpsOnHost({
      documentId: 'pptx-1',
      bytes: app.bytes,
      expectedVersion: version,
      action: 'manual_fill',
      ops: [input],
      signal: controller.signal,
    }),
  ).rejects.toThrow(/取消/)
  expect(app.session.version()).toBe(version)
  expect(await entries(await app.session.save())).toEqual(before)
})
