import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { editableElements, openPptxForEdit, textOfElement } from './pptx.js'

const MULTI = new URL('../tests/fixtures/upstream/01_standard_business.pptx', import.meta.url)
const IMAGE = new URL('../tests/fixtures/image-deck.pptx', import.meta.url)
const TITLE = new URL('../tests/fixtures/title-layout.pptx', import.meta.url)

function load(url: URL): Uint8Array {
  return new Uint8Array(readFileSync(url))
}

function texts(
  slide: ReturnType<Awaited<ReturnType<typeof openPptxForEdit>>['slides']>[number],
): string {
  return slide.elements
    .map(textOfElement)
    .flatMap((text) => text?.paragraphs ?? [])
    .flatMap((paragraph) => paragraph.runs.map((run) => run.text))
    .join(' ')
}

async function changedEntries(before: Uint8Array, after: Uint8Array): Promise<string[]> {
  const a = await JSZip.loadAsync(before)
  const b = await JSZip.loadAsync(after)
  const names = new Set([...Object.keys(a.files), ...Object.keys(b.files)])
  const changed: string[] = []
  for (const name of names) {
    const left = a.file(name)
    const right = b.file(name)
    if (!left || !right) {
      changed.push(name)
      continue
    }
    const [x, y] = await Promise.all([left.async('uint8array'), right.async('uint8array')])
    if (x.length !== y.length || x.some((byte, i) => byte !== y[i])) changed.push(name)
  }
  return changed.toSorted()
}

async function modifyXml(
  bytes: Uint8Array,
  path: string,
  change: (xml: string) => string,
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(bytes)
  const original = await zip.file(path)!.async('string')
  zip.file(path, change(original))
  return zip.generateAsync({ type: 'uint8array' })
}

describe('PPTX 幻灯片结构编辑', () => {
  it('幻灯片标识属性顺序不同仍可定位页面', async () => {
    const input = await modifyXml(load(TITLE), 'ppt/presentation.xml', (xml) =>
      xml.replace('<p:sldId id="256" r:id="rId7"/>', '<p:sldId r:id="rId7" id="256"/>'),
    )
    const session = await openPptxForEdit(input)
    expect(session.slides()).toHaveLength(1)
    expect(session.insertBlank(0)).toBe(1)
    expect((await openPptxForEdit(await session.save())).slides()).toHaveLength(2)
  })

  it('新增页避开孤立的同名关系部件，保留原条目', async () => {
    const zip = await JSZip.loadAsync(load(TITLE))
    const orphanPath = 'ppt/slides/_rels/slide2.xml.rels'
    const orphan =
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'
    zip.file(orphanPath, orphan)
    const session = await openPptxForEdit(await zip.generateAsync({ type: 'uint8array' }))
    expect(session.insertBlank(0)).toBe(1)
    expect(session.slides()[1]?.path).toBe('ppt/slides/slide3.xml')
    const saved = await JSZip.loadAsync(await session.save())
    expect(await saved.file(orphanPath)?.async('string')).toBe(orphan)
  })

  it('重排与删除只修改必要的包部件，保存后顺序可读回', async () => {
    const input = load(MULTI)
    const session = await openPptxForEdit(input)
    const original = session.slides().map((slide) => slide.path)
    const view = session.view()
    expect(session.move(0, 2)).toBe(2)
    expect(session.view()).not.toBe(view)
    expect(session.slides().map((slide) => slide.path)).toEqual([
      original[1],
      original[2],
      original[0],
      original[3],
      original[4],
    ])
    expect(session.hasChanges()).toBe(true)
    const reordered = await session.save()
    expect(await changedEntries(input, reordered)).toEqual(['ppt/presentation.xml'])
    session.commit()
    expect(session.hasChanges()).toBe(false)
    expect((await openPptxForEdit(reordered)).slides().map((slide) => slide.path)).toEqual(
      session.slides().map((slide) => slide.path),
    )

    expect(session.remove(1)).toBe(1)
    const reduced = await session.save()
    session.commit()
    const reopened = await openPptxForEdit(reduced)
    expect(reopened.slides().map((slide) => slide.path)).toEqual([
      original[1],
      original[0],
      original[3],
      original[4],
    ])
    const changed = await changedEntries(reordered, reduced)
    expect(changed).toEqual([
      '[Content_Types].xml',
      'ppt/_rels/presentation.xml.rels',
      'ppt/presentation.xml',
      'ppt/slides/_rels/slide3.xml.rels',
      'ppt/slides/slide3.xml',
    ])
  })

  it('图片页复制后共享原媒体，文字先改再复制且连续保存不回滚', async () => {
    const input = load(IMAGE)
    const session = await openPptxForEdit(input)
    const originalImage = session.slides()[0]!.elements.find((el) => el.type === 'picture')
    expect(originalImage).toBeDefined()
    const target = editableElements(session.slides()[0]!)[0]!
    session.setText(0, target.id, [{ runs: [{ text: '复制之前的文字' }], srcPara: 0 }])
    expect(session.duplicate(0)).toBe(1)
    expect(session.slides()).toHaveLength(2)
    expect(texts(session.slides()[1]!)).toContain('复制之前的文字')
    const first = await session.save()
    session.commit()
    const reopened = await openPptxForEdit(first)
    expect(reopened.slides()).toHaveLength(2)
    expect(texts(reopened.slides()[0]!)).toContain('复制之前的文字')
    expect(texts(reopened.slides()[1]!)).toContain('复制之前的文字')
    expect(reopened.slides()[1]!.elements.some((el) => el.type === 'picture')).toBe(true)
    const changed = await changedEntries(input, first)
    expect(changed.some((name) => name.startsWith('ppt/media/'))).toBe(false)

    const clonedText = editableElements(session.slides()[1]!)[0]!
    session.setText(1, clonedText.id, [{ runs: [{ text: '第二次只改副本' }], srcPara: 0 }])
    const second = await session.save()
    session.commit()
    const twice = await openPptxForEdit(second)
    expect(texts(twice.slides()[0]!)).toContain('复制之前的文字')
    expect(texts(twice.slides()[1]!)).toContain('第二次只改副本')
    expect(texts(twice.slides()[1]!)).not.toContain('复制之前的文字')
    expect(await changedEntries(second, await session.save())).toEqual([])
  })

  it('空白页具有有效版式，能保存并重新打开；最后一页不可删', async () => {
    const session = await openPptxForEdit(load(TITLE))
    expect(() => session.remove(0)).toThrow(/至少保留/)
    expect(session.insertBlank(0)).toBe(1)
    expect(session.slides()[1]!.elements).toHaveLength(0)
    const out = await session.save()
    session.commit()
    const reopened = await openPptxForEdit(out)
    expect(reopened.slides()).toHaveLength(2)
    expect(reopened.slides()[1]!.elements).toHaveLength(0)
    expect(reopened.slides()[1]!.layoutPath).toBeDefined()
  })

  it('复制后删除副本恢复原结构状态', async () => {
    const session = await openPptxForEdit(load(TITLE))
    session.duplicate(0)
    expect(session.hasChanges()).toBe(true)
    session.remove(1)
    expect(session.hasChanges()).toBe(false)
  })

  it('自定义放映、备注和指向目标页的关系会明确拒绝危险操作', async () => {
    const sectioned = await modifyXml(load(TITLE), 'ppt/presentation.xml', (xml) =>
      xml.replace('</p:sldIdLst>', '</p:sldIdLst><p:custShowLst/>'),
    )
    const session = await openPptxForEdit(sectioned)
    expect(() => session.insertBlank(0)).toThrow(/自定义放映或分节/)

    const noted = await modifyXml(load(IMAGE), 'ppt/slides/_rels/slide1.xml.rels', (xml) =>
      xml.replace(
        '</Relationships>',
        '<Relationship Id="rId999" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>',
      ),
    )
    const withNotes = await openPptxForEdit(noted)
    expect(() => withNotes.duplicate(0)).toThrow(/备注或批注/)

    const expandedNotes = await modifyXml(load(IMAGE), 'ppt/slides/_rels/slide1.xml.rels', (xml) =>
      xml.replace(
        '</Relationships>',
        '<Relationship Id="rId999" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"></Relationship></Relationships>',
      ),
    )
    const withExpandedNotes = await openPptxForEdit(expandedNotes)
    expect(() => withExpandedNotes.duplicate(0)).toThrow(/备注或批注/)

    const linked = await modifyXml(load(MULTI), 'ppt/slides/_rels/slide2.xml.rels', (xml) =>
      xml.replace(
        '</Relationships>',
        '<Relationship Id="rId999" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slide1.xml"/></Relationships>',
      ),
    )
    const withLink = await openPptxForEdit(linked)
    expect(() => withLink.remove(0)).toThrow(/链接到此页/)
    expect(withLink.slides()).toHaveLength(5)
  })
})
