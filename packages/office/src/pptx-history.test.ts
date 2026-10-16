import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { openPptxForEdit, textOfElement } from './pptx.js'
import { PptxHistory } from './pptx-history.js'
const load = () =>
  new Uint8Array(readFileSync(new URL('../tests/fixtures/title-layout.pptx', import.meta.url)))
const text = (session: Awaited<ReturnType<typeof openPptxForEdit>>) =>
  textOfElement(session.slides()[0]!.elements[0]!)!
    .paragraphs.map((p) => p.runs.map((r) => r.text).join(''))
    .join('\n')
describe('PPTX canvas history', () => {
  it('retains text/page/host edits over saves without later commits mutating earlier archives', async () => {
    const bytes = load(),
      session = await openPptxForEdit(bytes),
      history = new PptxHistory(session)
    const original = text(session),
      id = session.slides()[0]!.elements[0]!.id
    session.setText(0, id, [{ runs: [{ text: '第一次修改' }] }])
    history.record()
    await session.save()
    session.commit()
    history.synchronize()
    session.setText(0, id, [{ runs: [{ text: '第二次修改' }] }])
    history.record()
    expect(history.undo()).toBe(true)
    expect(text(session)).toBe('第一次修改')
    expect(history.undo()).toBe(true)
    expect(text(session)).toBe(original)
    expect(session.hasChanges()).toBe(true)
    expect(history.redo()).toBe(true)
    expect(text(session)).toBe('第一次修改')
    expect(history.redo()).toBe(true)
    expect(text(session)).toBe('第二次修改')
    const firstSaved = await session.save()
    session.commit()
    history.synchronize()
    session.duplicate(0)
    history.record()
    expect(history.undo()).toBe(true)
    expect(session.slides()).toHaveLength(1)
    expect(history.redo()).toBe(true)
    expect(session.slides()).toHaveLength(2)
    const secondSaved = await session.save()
    expect((await openPptxForEdit(secondSaved)).slides()).toHaveLength(2)
    expect(text(await openPptxForEdit(secondSaved))).toBe('第二次修改')
    const before = await JSZip.loadAsync(bytes),
      after = await JSZip.loadAsync(secondSaved)
    expect(await after.file('ppt/theme/theme1.xml')!.async('uint8array')).toEqual(
      await before.file('ppt/theme/theme1.xml')!.async('uint8array'),
    )
    expect(text(await openPptxForEdit(firstSaved))).toBe('第二次修改')
  })
  it('truncates redo after new edits, bounds steps and includes full hosted byte replacements', async () => {
    const session = await openPptxForEdit(load()),
      history = new PptxHistory(session, 2)
    const id = session.slides()[0]!.elements[0]!.id
    for (const value of ['一', '二', '三']) {
      session.setText(0, id, [{ runs: [{ text: value }] }])
      history.record()
    }
    expect(history.undo()).toBe(true)
    expect(history.undo()).toBe(true)
    expect(history.undo()).toBe(false)
    session.setText(0, id, [{ runs: [{ text: '新分支' }] }])
    history.record()
    expect(history.canRedo).toBe(false)
    const host = await openPptxForEdit(await session.save())
    host.setText(0, host.slides()[0]!.elements[0]!.id, [{ runs: [{ text: 'Agent结果' }] }])
    await session.replaceFromHost(await host.save(), session.version())
    history.record()
    expect(history.undo()).toBe(true)
    expect(text(session)).toBe('新分支')
    expect(history.redo()).toBe(true)
    expect(text(session)).toBe('Agent结果')
  })
})
