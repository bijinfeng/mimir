import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { describe, expect, it, vi } from 'vitest'
import { editableElements, openPptxForEdit, textOfElement } from '../pptx.js'
import { createPptxAgentHandle } from './pptx-agent.js'

const fixture = new URL('../../tests/fixtures/title-layout.pptx', import.meta.url)
const load = () => new Uint8Array(readFileSync(fixture))

function firstText(session: Awaited<ReturnType<typeof openPptxForEdit>>) {
  const element = editableElements(session.slides()[0]!)[0]!
  return {
    id: element.id,
    text: textOfElement(element)!
      .paragraphs.flatMap((p) => p.runs.map((r) => r.text))
      .join(''),
  }
}

describe('PPTX Agent canvas', () => {
  it('reads unsaved manual edits, writes through the same session, and preserves unrelated OOXML', async () => {
    const bytes = load()
    const session = await openPptxForEdit(bytes)
    const { id } = firstText(session)
    session.setText(0, id, [{ runs: [{ text: '人工初稿', srcRun: 0 }], srcPara: 0 }])
    const handle = createPptxAgentHandle(
      session,
      'doc-1',
      () => ({ slideIndex: 0, elementId: id }),
      () => {},
    )
    const read = (await handle.execute(
      'read_slide',
      {},
      { expectedVersion: session.version() },
    )) as {
      ok: boolean
      data: { elements: Array<{ text: Array<{ runs: Array<{ text: string }> }> }> }
    }
    expect(read.ok).toBe(true)
    expect(JSON.stringify(read.data)).toContain('人工初稿')
    const result = (await handle.execute(
      'apply_ops',
      {
        ops: [
          {
            op: 'setText',
            target: { slide: 0, el: id },
            paragraphs: [{ runs: [{ text: 'Agent 完稿' }] }],
          },
        ],
      },
      { expectedVersion: session.version(), roundId: 'r1' },
    )) as { ok: boolean; changed: boolean }
    expect(result).toMatchObject({ ok: true, changed: true })
    expect(firstText(session).text).toContain('Agent 完稿')
    const saved = await session.save()
    const reopened = await openPptxForEdit(saved)
    expect(firstText(reopened).text).toContain('Agent 完稿')
    const originalZip = await JSZip.loadAsync(bytes)
    const savedZip = await JSZip.loadAsync(saved)
    expect(await savedZip.file('ppt/theme/theme1.xml')?.async('uint8array')).toEqual(
      await originalZip.file('ppt/theme/theme1.xml')?.async('uint8array'),
    )
  })

  it('rolls back a failed batch, rejects stale versions, and undoes only an untouched round', async () => {
    const session = await openPptxForEdit(load())
    const { id, text } = firstText(session)
    const handle = createPptxAgentHandle(
      session,
      'doc-1',
      () => ({ slideIndex: 0, elementId: id }),
      () => {},
    )
    const failed = (await handle.execute(
      'apply_ops',
      {
        ops: [
          {
            op: 'setText',
            target: { slide: 0, el: id },
            paragraphs: [{ runs: [{ text: 'temporary' }] }],
          },
          { op: 'addChart', target: { slide: 0 } },
        ],
      },
      { expectedVersion: session.version(), roundId: 'bad' },
    )) as { ok: boolean; changed: boolean; error: string }
    expect(failed).toMatchObject({ ok: false, changed: false })
    expect(failed.error).toContain('未接入')
    expect(firstText(session).text).toBe(text)

    const version = session.version()
    const success = (await handle.execute(
      'apply_ops',
      { ops: [{ op: 'duplicateSlide', target: { slide: 0 } }] },
      { expectedVersion: version, roundId: 'good' },
    )) as { ok: boolean }
    expect(success.ok).toBe(true)
    expect(session.slides()).toHaveLength(2)
    expect(handle.undoRound('good')).toBe(true)
    expect(session.slides()).toHaveLength(1)
    const stale = (await handle.execute(
      'apply_ops',
      { ops: [{ op: 'duplicateSlide', target: { slide: 0 } }] },
      { expectedVersion: version },
    )) as { ok: boolean; error: string }
    expect(stale.ok).toBe(false)
    expect(stale.error).toContain('版本')
  })

  it('blocks undo after a later manual edit and rejects aborted writes', async () => {
    const session = await openPptxForEdit(load())
    const { id } = firstText(session)
    const handle = createPptxAgentHandle(
      session,
      'doc-1',
      () => ({ slideIndex: 0, elementId: id }),
      () => {},
    )
    await handle.execute(
      'apply_ops',
      { ops: [{ op: 'duplicateSlide', target: { slide: 0 } }] },
      { roundId: 'r1' },
    )
    session.move(1, 0)
    expect(handle.undoRound('r1')).toBe(false)
    const controller = new AbortController()
    controller.abort()
    const result = (await handle.execute(
      'apply_ops',
      { ops: [{ op: 'deleteSlide', target: { slide: 0 } }] },
      { signal: controller.signal },
    )) as { ok: boolean; error: string }
    expect(result.ok).toBe(false)
    expect(result.error).toContain('取消')
    expect(session.slides()).toHaveLength(2)
  })

  it('rejects a host replacement if a manual edit occurs during archive parsing', async () => {
    const session = await openPptxForEdit(load())
    const { id } = firstText(session)
    const expectedVersion = session.version()
    const pending = session.replaceFromHost(load(), expectedVersion)
    session.setText(0, id, [{ srcPara: 0, runs: [{ text: '不能覆盖的人工修改', srcRun: 0 }] }])
    await expect(pending).rejects.toThrow('宿主解析期间画布已变化')
    expect(firstText(session).text).toBe('不能覆盖的人工修改')
    const controller = new AbortController()
    const aborted = session.replaceFromHost(load(), session.version(), controller.signal)
    controller.abort()
    await expect(aborted).rejects.toThrow('已取消')
    expect(firstText(session).text).toBe('不能覆盖的人工修改')
  })

  it('lands host bytes into the unsaved canvas and can undo the hosted round', async () => {
    const session = await openPptxForEdit(load())
    const { id, text } = firstText(session)
    const handle = createPptxAgentHandle(
      session,
      'doc-1',
      () => ({ slideIndex: 0, elementId: id }),
      () => {},
      async ({ bytes, expectedVersion, ops }) => {
        const hosted = await openPptxForEdit(bytes)
        const hostedId = firstText(hosted).id
        expect((ops[0] as { target: { el: string } }).target.el).toMatch(/^e_/)
        expect(
          hosted.setText(0, hostedId, [{ srcPara: 0, runs: [{ text: '宿主已修改', srcRun: 0 }] }]),
        ).toBe(true)
        expect(firstText(hosted).text).toContain('宿主已修改')
        return {
          bytes: await hosted.save(),
          records: [{ op: 'setText' }],
          version: expectedVersion + 1,
        }
      },
    )
    const result = (await handle.execute(
      'apply_ops',
      {
        ops: [
          { op: 'setParagraphFormat', target: { slide: 0, el: id }, format: { align: 'center' } },
        ],
      },
      { roundId: 'host' },
    )) as { ok: boolean }
    expect(result).toMatchObject({ ok: true })
    expect(firstText(session).text).toContain('宿主已修改')
    expect(session.hasChanges()).toBe(true)
    expect(firstText(await openPptxForEdit(await session.save())).text).toContain('宿主已修改')
    expect(handle.undoRound('host')).toBe(true)
    expect(firstText(session).text).toBe(text)
  })

  it('cancels hosted replacement when the handle is disposed during parsing', async () => {
    const session = await openPptxForEdit(load())
    const id = firstText(session).id
    const changed = vi.fn<() => void>()
    const handle = createPptxAgentHandle(
      session,
      'doc-1',
      () => ({ slideIndex: 0, elementId: id }),
      changed,
      async ({ bytes, expectedVersion }) => ({ bytes, version: expectedVersion + 1, records: [] }),
    )
    let entered!: () => void
    let release!: () => void
    const parsing = new Promise<void>((resolve) => {
      entered = resolve
    })
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const replace = session.replaceFromHost.bind(session)
    const parser = vi.spyOn(session, 'replaceFromHost').mockImplementationOnce(async (...args) => {
      entered()
      await gate
      await replace(...args)
    })
    try {
      const pending = handle.execute(
        'apply_ops',
        {
          ops: [
            { op: 'setParagraphFormat', target: { slide: 0, el: id }, format: { align: 'center' } },
          ],
        },
        {},
      )
      await parsing
      handle.dispose()
      release()
      expect(await pending).toMatchObject({
        ok: false,
        changed: false,
        error: expect.stringContaining('取消'),
      })
      expect(changed).not.toHaveBeenCalled()
      expect(session.version()).toBe(0)
    } finally {
      release()
      parser.mockRestore()
      handle.dispose()
    }
  })
})
