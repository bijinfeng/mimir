// @vitest-environment happy-dom
import { ConfigProvider } from 'antd'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDocument, type PDFDocumentLoadingTask } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { pdfAtomicBatchFixture } from '../../../../apps/server/src/test/pdf-atomic-batch-fixture.js'
import { applyPdfTextInserts } from '../../../../apps/server/src/services/pdf-agent-host.js'
import { applyPdfLocalOperation } from '../../../../apps/server/src/services/pdf-local.js'
import { readPdfAnnotations } from '../../../../apps/server/src/services/pdf-annotations.js'
import type { PdfAgentHandle } from '../agent/pdf-agent.js'
import type { PdfHostLocal } from '../agent/pdf-local-agent.js'
const state = vi.hoisted(() => ({
  rendered: [] as Uint8Array[],
  tasks: [] as PDFDocumentLoadingTask[],
}))
vi.mock('./pdf-render.js', () => ({
  cancelPdfRender() {},
  retainPdfDocuments() {},
  renderPdfPages: async ({ bytes }: { bytes: Uint8Array }) => {
    state.rendered.push(bytes)
    return { dispose() {} }
  },
  loadPdfDocument: async (bytes: Uint8Array) => {
    const task = (await import('pdfjs-dist/legacy/build/pdf.mjs')).getDocument({
      data: bytes.slice(),
    })
    state.tasks.push(task)
    return task.promise
  },
}))
import { PdfEditor } from './PdfEditor.js'
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const clean: Array<() => void> = []
afterEach(async () => {
  clean.splice(0).forEach((fn) => fn())
  await Promise.all(state.tasks.splice(0).map((task) => task.destroy()))
  state.rendered.length = 0
})
async function settle(predicate: () => boolean) {
  const end = Date.now() + 5000
  while (!predicate() && Date.now() < end)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })
  expect(predicate()).toBe(true)
}
const local: PdfHostLocal = async ({ bytes, operation, expectedVersion, signal }) => {
  const result = await applyPdfLocalOperation(bytes, operation, undefined, signal)
  return { ...result, version: expectedVersion + (result.bytes ? 1 : 0) }
}
async function mount(override?: PdfHostLocal, saveWait?: () => Promise<void>) {
  const { bytes: original } = await pdfAtomicBatchFixture({ rotation: 90, crop: true })
  const otherOriginal = original.slice()
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host),
    saves: Uint8Array[] = [],
    dirty: boolean[] = []
  let handle: PdfAgentHandle | null = null
  clean.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  const render = async (documentId = 'atomic-ui') =>
    act(async () =>
      root.render(
        <ConfigProvider componentSize="small">
          <PdfEditor
            documentId={documentId}
            io={{
              load: async () => (documentId === 'atomic-ui' ? original : otherOriginal),
              save: async (bytes) => {
                saves.push(bytes)
                await saveWait?.()
              },
            }}
            hostLocal={override ?? local}
            hostApply={async ({ bytes, items, expectedVersion }) => ({
              bytes: await applyPdfTextInserts(
                bytes,
                items as Parameters<typeof applyPdfTextInserts>[1],
              ),
              version: expectedVersion + 1,
            })}
            hostAnnotations={async ({ bytes, expectedVersion }) => ({
              annotations: await readPdfAnnotations(bytes),
              version: expectedVersion,
            })}
            onAgentHandleChange={(value) => {
              handle = value
            }}
            onDirtyChange={(value) => dirty.push(value)}
          />
        </ConfigProvider>,
      ),
    )
  await render()
  await settle(() => handle !== null && state.rendered.length > 0)
  const execute = async (...args: Parameters<PdfAgentHandle['execute']>) => {
    let result!: Awaited<ReturnType<PdfAgentHandle['execute']>>
    await act(async () => {
      result = await handle!.execute(...args)
    })
    return result
  }
  const click = async (label: string) =>
    act(async () => {
      host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click()
      await new Promise((r) => setTimeout(r, 0))
    })
  const inserted = async () =>
    (
      (await execute('list_inserted_text', {})).data as {
        inserts: Array<{ id: string; text: string }>
      }
    ).inserts
  const addTwo = async () => {
    expect(
      (await execute('insert_text', { page: 1, x: 30, y: 40, text: 'REMOVE DRAFT', font_size: 12 }))
        .ok,
    ).toBe(true)
    expect(
      (
        await execute('insert_text', {
          page: 1,
          x: 150,
          y: 150,
          text: 'SURVIVE DRAFT',
          font_size: 14,
        })
      ).ok,
    ).toBe(true)
    return inserted()
  }
  return {
    host,
    original,
    otherOriginal,
    saves,
    dirty,
    render,
    execute,
    click,
    inserted,
    addTwo,
    handle: () => handle!,
    bytes: () => state.rendered.at(-1)!,
  }
}
async function text(bytes: Uint8Array, index = 0) {
  const task = getDocument({ data: bytes.slice() })
  state.tasks.push(task)
  return (await (await (await task.promise).getPage(index + 1)).getTextContent()).items
    .map((item) => ('str' in item ? item.str : ''))
    .join('')
}
describe('PDF Editor atomic batch publication', () => {
  it('reports the original operation index for a form preflight error after staged T removal', async () => {
    const app = await mount(),
      inserts = await app.addTwo(),
      before = app.bytes(),
      version = app.handle().getVersion(),
      dirtyCount = app.dirty.length
    const result = await app.execute('apply_ops', {
      ops: [
        { op: 'removeTextInsert', id: inserts[0]!.id },
        { op: 'setMetadata', metadata: { title: 'discarded' } },
        { op: 'setFormValue', value: { name: 'missing', value: 'invalid' } },
      ],
    })
    expect(result).toMatchObject({ ok: false, changed: false, version })
    expect(result.error).toContain('PDF 批次第 3 项：表单字段不存在')
    expect(app.bytes()).toBe(before)
    expect(await app.inserted()).toEqual(inserts)
    expect(app.dirty).toHaveLength(dirtyCount)
    expect(app.handle().getVersion()).toBe(version)
  })

  it('keeps surviving T editable on the changed raw base; dry-run/failure publish nothing and round undo is exact', async () => {
    const app = await mount(),
      [first, second] = await app.addTwo(),
      before = app.bytes(),
      version = app.handle().getVersion()
    const ops = [
      { op: 'removeTextInsert', id: first!.id },
      { op: 'setNoteContents', id: 'Nreply', contents: 'new reply' },
      { op: 'removeMarkup', id: 'Mhighlight' },
    ]
    const dirtyCount = app.dirty.length
    expect(await app.execute('apply_ops', { ops, dry_run: true })).toMatchObject({
      ok: true,
      changed: false,
      version,
    })
    expect(app.bytes()).toBe(before)
    expect(await app.inserted()).toHaveLength(2)
    expect(app.dirty).toHaveLength(dirtyCount)
    expect(
      await app.execute('apply_ops', { ops: [...ops, { op: 'deletePage', page: 99 }] }),
    ).toMatchObject({ ok: false, changed: false, version })
    expect(app.bytes()).toBe(before)
    expect(await app.inserted()).toHaveLength(2)
    expect(await app.execute('apply_ops', { ops }, { roundId: 'atomic-round' })).toMatchObject({
      ok: true,
      changed: true,
      version: version + 1,
    })
    expect(app.dirty).toHaveLength(dirtyCount + 1)
    expect(await app.inserted()).toEqual([second])
    expect(await text(app.bytes())).not.toContain('REMOVE DRAFT')
    await act(async () => {
      expect(app.handle().undoRound('atomic-round')).toBe(true)
    })
    expect(app.bytes()).toBe(before)
    expect(await app.inserted()).toHaveLength(2)
    expect(
      (await readPdfAnnotations(app.bytes())).annotations.find((a) => a.id === 'Nreply')?.text,
    ).toBe('old reply')
    expect((await app.execute('apply_ops', { ops }, { roundId: 'second-round' })).ok).toBe(true)
    expect(
      (await app.execute('move_inserted_text', { id: second!.id, x: 140 }, { manual: true })).ok,
    ).toBe(true)
    expect(app.handle().undoRound('second-round')).toBe(false)
    expect(
      (await app.execute('edit_inserted_text', { id: second!.id, text: 'EDIT SURVIVOR' })).ok,
    ).toBe(true)
    expect((await app.execute('delete_inserted_text', { id: second!.id })).ok).toBe(true)
    expect(await text(app.bytes())).not.toContain('DRAFT')
    expect(
      (await readPdfAnnotations(app.bytes())).annotations.find((a) => a.id === 'Nreply')?.text,
    ).toBe('new reply')
    await app.click('保存到库')
    await settle(() => app.saves.length === 1)
    expect(app.saves[0]).toEqual(app.bytes())
  })
  it('materializes on page edits and preserves exact one-step save undo redo history', async () => {
    const app = await mount(),
      [first, second] = await app.addTwo(),
      before = app.bytes(),
      version = app.handle().getVersion()
    expect(
      await app.execute('apply_ops', {
        ops: [
          { op: 'setPageOrder', order: [2, 1, 3] },
          { op: 'rotatePages', pages: [2], dir: 90 },
          { op: 'removeTextInsert', id: first!.id },
          { op: 'setNoteContents', id: 'Nroot', contents: 'changed' },
        ],
      }),
    ).toMatchObject({
      ok: true,
      changed: true,
      version: version + 1,
      data: { materializedTextIds: [second!.id] },
    })
    expect(await app.inserted()).toEqual([])
    expect(app.host.textContent).toContain('原 T 标识不再可编辑')
    expect(await text(app.bytes(), 0)).not.toContain('DRAFT')
    expect(await text(app.bytes(), 1)).toContain('SURVIVE DRAFT')
    const after = app.bytes()
    await app.click('保存到库')
    await settle(() => app.saves.length === 1)
    expect(app.saves[0]).toEqual(after)
    await app.click('撤销')
    expect(app.bytes()).toBe(before)
    await app.click('保存到库')
    await settle(() => app.saves.length === 2)
    expect(app.saves[1]).toEqual(before)
    await app.click('重做')
    expect(app.bytes()).toBe(after)
    await app.click('保存到库')
    await settle(() => app.saves.length === 3)
    expect(app.saves[2]).toEqual(after)
  })
  it.each(['abort', 'external', 'switch'])(
    'rejects %s while a late host response is held',
    async (mode) => {
      let held: (() => void) | undefined
      const delayed: PdfHostLocal = async (input) => {
        const result = await local(input)
        await new Promise<void>((resolve) => {
          held = resolve
        })
        return result
      }
      const app = await mount(delayed),
        [first] = await app.addTwo(),
        before = app.bytes()
      const controller = new AbortController()
      let result!: ReturnType<typeof app.execute>
      await act(async () => {
        result = app.handle().execute(
          'apply_ops',
          {
            ops: [
              { op: 'removeTextInsert', id: first!.id },
              { op: 'setMetadata', metadata: { title: 'candidate' } },
            ],
          },
          { signal: controller.signal },
        )
      })
      await settle(() => held !== undefined)
      if (mode === 'abort') controller.abort()
      if (mode === 'external') app.handle().markManualChange()
      if (mode === 'switch') {
        await app.render('another-document')
        await settle(() => app.bytes() === app.otherOriginal)
      }
      const dirtyCount = app.dirty.length,
        steeredVersion = app.handle().getVersion()
      let outcome!: Awaited<typeof result>
      await act(async () => {
        held!()
        held = undefined
        outcome = await result
      })
      expect(outcome.ok).toBe(false)
      expect(app.bytes()).toBe(mode === 'switch' ? app.otherOriginal : before)
      expect(app.dirty).toHaveLength(dirtyCount)
      expect(await app.inserted()).toHaveLength(mode === 'switch' ? 0 : 2)
      expect(app.handle().getVersion()).toBe(steeredVersion)
    },
  )
  it('removing all T returns the original bytes and clean state with one version increment', async () => {
    const app = await mount(),
      inserts = await app.addTwo(),
      version = app.handle().getVersion()
    expect(
      await app.execute('apply_ops', {
        ops: inserts.map((i) => ({ op: 'removeTextInsert', id: i.id })),
      }),
    ).toMatchObject({ ok: true, changed: true, version: version + 1 })
    expect(app.bytes()).toBe(app.original)
    expect(app.handle().getContext().dirty).toBe(false)
    expect(app.dirty.at(-1)).toBe(false)
  })
  it('refuses a batch while saving without consuming pending text or host calls', async () => {
    let finishSave!: () => void
    const localSpy = vi.fn<PdfHostLocal>(local)
    const app = await mount(
      localSpy,
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve
        }),
    )
    const [first] = await app.addTwo(),
      before = app.bytes(),
      version = app.handle().getVersion()
    await app.click('保存到库')
    await settle(() => app.saves.length === 1)
    expect(
      await app.execute('apply_ops', { ops: [{ op: 'removeTextInsert', id: first!.id }] }),
    ).toMatchObject({ ok: false, changed: false })
    expect(localSpy).not.toHaveBeenCalled()
    expect(app.bytes()).toBe(before)
    expect(app.handle().getVersion()).toBe(version)
    expect(await app.inserted()).toHaveLength(2)
    await act(async () => {
      finishSave()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(app.bytes()).toBe(before)
  })
})
