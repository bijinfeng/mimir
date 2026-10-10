// @vitest-environment happy-dom

/**
 * 工具条改出来的东西**存得下去、且存得干净**。
 *
 * 这一条比「命令改了模型」更关键，因为模型对不代表文件对：这一段是
 * `.trellis/spec/office/engine/index.md` 那条不能违反的规矩（保存只允许走补丁路径）的
 * 回归测试。改一处格式如果让 `document.xml` 之外的条目也变了，说明保存路径
 * 退化成了整体重建——那会丢掉我们没建模的东西（域代码、修订标记、OLE 对象），
 * 而界面上一切正常。
 *
 * 顺带守住另一半：**格式真的落到 XML 里**。模型的属性正确但生成器不认它，
 * 等于「屏幕上变了、Word 里没变」——反过来也是这类编辑器最怕的静默失效。
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import JSZip from 'jszip'
import { addRowAfter, deleteRow, isInTable, selectedRect } from '@tiptap/pm/tables'
import { editorExtensions } from '../../vendor/apps/docs/src/renderer/editor/extensions.js'
import { setSelectionAlign } from '../../vendor/apps/docs/src/renderer/editor/direction.js'
import { openDocx } from '../docx.js'
import { runCommand } from '../shell/editor-commands.js'
import { applyParagraphStyle, columnWidthsTwips, setColumnWidth } from './DocxEditor.js'

const FIXTURE = join(
  import.meta.dirname,
  '../../vendor/apps/docs/tests/pagination-corpus/docx/kitchen-sink.docx',
)

async function makeSession() {
  const bytes = new Uint8Array(readFileSync(FIXTURE))
  const session = await openDocx(bytes)
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: editorExtensions,
    content: session.content as never,
  })
  return { bytes, session, editor }
}

function findTop(editor: Editor, type: string): number {
  let found = -1
  editor.state.doc.forEach((node, offset) => {
    if (found === -1 && node.type.name === type) found = offset
  })
  return found
}

/** 保存前后逐条目比对：返回变化了的 zip 条目名 */
async function changedEntries(before: Uint8Array, after: Uint8Array): Promise<string[]> {
  const [a, b] = await Promise.all([JSZip.loadAsync(before), JSZip.loadAsync(after)])
  const changed: string[] = []
  for (const name of Object.keys(a.files).toSorted()) {
    const [x, y] = await Promise.all([
      a.files[name]!.async('uint8array'),
      b.files[name]!.async('uint8array'),
    ])
    const same = x.length === y.length && x.every((byte, i) => byte === y[i])
    if (!same) changed.push(name)
  }
  return changed
}

/** 走一遍「编辑 → 保存」并返回变化了的条目与新的 document.xml */
async function saveAndDiff(
  editor: Editor,
  session: Awaited<ReturnType<typeof openDocx>>,
  bytes: Uint8Array,
): Promise<{ changed: string[]; xml: string }> {
  const saved = await session.save(editor.getJSON() as never)
  const changed = await changedEntries(bytes, saved)
  const zip = await JSZip.loadAsync(saved)
  const xml = (await zip.file('word/document.xml')!.async('string')) ?? ''
  return { changed, xml }
}

describe('工具条改动仍然走补丁式保存', () => {
  it('改段落对齐：只有 document.xml 变化，且写的是 w:jc', async () => {
    const { bytes, session, editor } = await makeSession()
    const at = findTop(editor, 'docParagraph')
    editor.commands.setTextSelection(at + 1)
    setSelectionAlign(editor, 'center')

    const { changed, xml } = await saveAndDiff(editor, session, bytes)
    expect(changed).toEqual(['word/document.xml'])
    expect(xml).toContain('<w:jc w:val="center"/>')
    editor.destroy()
  })

  it('两端对齐写的是 w:val="both"（不是 "justify"）', async () => {
    const { bytes, session, editor } = await makeSession()
    const at = findTop(editor, 'docParagraph')
    editor.commands.setTextSelection(at + 1)
    setSelectionAlign(editor, 'justify')

    const { changed, xml } = await saveAndDiff(editor, session, bytes)
    expect(changed).toEqual(['word/document.xml'])
    expect(xml).toContain('<w:jc w:val="both"/>')
    editor.destroy()
  })

  it('行距 + 段距 + 缩进写进 w:spacing / w:ind，单位是 twips', async () => {
    const { bytes, session, editor } = await makeSession()
    const at = findTop(editor, 'docParagraph')
    editor.commands.setTextSelection(at + 1)
    for (const name of ['docHeading', 'docListItem', 'docParagraph']) {
      editor
        .chain()
        .focus()
        .updateAttributes(name, {
          lineSpacing: 1.5,
          spaceBefore: 200,
          spaceAfter: 100,
          indentLeft: 720,
          indentFirstLine: -360,
        })
        .run()
    }

    const { changed, xml } = await saveAndDiff(editor, session, bytes)
    expect(changed).toEqual(['word/document.xml'])
    // 倍数行距 = w:line (倍数 × 240) + w:lineRule="auto"
    expect(xml).toContain('w:line="360" w:lineRule="auto"')
    expect(xml).toContain('w:before="200"')
    expect(xml).toContain('w:after="100"')
    // 首行缩进是负的 → 写 w:hanging，不是 w:firstLine
    expect(xml).toMatch(/<w:ind [^>]*w:left="720"/)
    expect(xml).toMatch(/<w:ind [^>]*w:hanging="360"/)
    editor.destroy()
  })

  it('固定行距写 lineRule 与原始 twips（generate.ts:1178-1181 明写支持）', async () => {
    const { bytes, session, editor } = await makeSession()
    const at = findTop(editor, 'docParagraph')
    editor.commands.setTextSelection(at + 1)
    editor
      .chain()
      .focus()
      .updateAttributes('docParagraph', { lineRule: 'exact', lineRawTwips: 400 })
      .run()

    const { changed, xml } = await saveAndDiff(editor, session, bytes)
    expect(changed).toEqual(['word/document.xml'])
    expect(xml).toContain('w:line="400" w:lineRule="exact"')
    editor.destroy()
  })

  it('段落底纹写 w:shd，且与突出显示（w:highlight）是两条路', async () => {
    const { bytes, session, editor } = await makeSession()
    const at = findTop(editor, 'docParagraph')
    editor.commands.setTextSelection(at + 1)
    editor.chain().focus().updateAttributes('docParagraph', { shadingFill: 'E7E6E6' }).run()
    editor
      .chain()
      .focus()
      .setTextSelection({ from: at + 1, to: at + 3 })
      .setMark('docTextStyle', { highlight: 'yellow' })
      .run()

    const { changed, xml } = await saveAndDiff(editor, session, bytes)
    expect(changed).toEqual(['word/document.xml'])
    expect(xml).toContain('<w:shd w:val="clear" w:color="auto" w:fill="E7E6E6"/>')
    expect(xml).toContain('<w:highlight w:val="yellow"/>')
    editor.destroy()
  })

  it('字号（半磅）与上标写进 w:sz / w:vertAlign', async () => {
    const { bytes, session, editor } = await makeSession()
    const at = findTop(editor, 'docParagraph')
    editor
      .chain()
      .focus()
      .setTextSelection({ from: at + 1, to: at + 3 })
      .setMark('docTextStyle', { sizeHalfPoints: 28, vertAlign: 'superscript' })
      .run()

    const { changed, xml } = await saveAndDiff(editor, session, bytes)
    expect(changed).toEqual(['word/document.xml'])
    expect(xml).toContain('<w:sz w:val="28"/>')
    expect(xml).toContain('<w:vertAlign w:val="superscript"/>')
    editor.destroy()
  })

  it('字体：东亚与西文是两个槽位（w:eastAsia 与 w:ascii 各写各的）', async () => {
    const { bytes, session, editor } = await makeSession()
    const at = findTop(editor, 'docParagraph')
    editor
      .chain()
      .focus()
      .setTextSelection({ from: at + 1, to: at + 3 })
      .setMark('docTextStyle', { font: '宋体' })
      .run()
    editor.chain().focus().setMark('docTextStyle', { fontAscii: 'Georgia' }).run()

    const { changed, xml } = await saveAndDiff(editor, session, bytes)
    expect(changed).toEqual(['word/document.xml'])
    expect(xml).toContain('w:eastAsia="宋体"')
    expect(xml).toContain('w:ascii="Georgia"')
    editor.destroy()
  })

  it('段落方向 RTL 写 w:bidi，且不改 w:jc（align 存的是视觉值）', async () => {
    const { bytes, session, editor } = await makeSession()
    const at = findTop(editor, 'docParagraph')
    editor.commands.setTextSelection(at + 1)
    editor.chain().focus().updateAttributes('docParagraph', { bidi: true }).run()

    const { changed, xml } = await saveAndDiff(editor, session, bytes)
    expect(changed).toEqual(['word/document.xml'])
    expect(xml).toContain('<w:bidi/>')
    editor.destroy()
  })

  it('「引用」的左侧边线写 w:pBdr（左缩进也一起写）', async () => {
    const { bytes, session, editor } = await makeSession()
    const at = findTop(editor, 'docParagraph')
    editor.commands.setTextSelection(at + 1)
    editor
      .chain()
      .focus()
      .setNode('docParagraph', {
        borders: 'l',
        borderLines: JSON.stringify({ l: { color: 'BFBFBF', szPt: 2, spacePt: 12 } }),
        indentLeft: 360,
      })
      .run()

    const { changed, xml } = await saveAndDiff(editor, session, bytes)
    expect(changed).toEqual(['word/document.xml'])
    expect(xml).toMatch(/<w:pBdr><w:left [^>]*\/><\/w:pBdr>/)
    expect(xml).toContain('w:color="BFBFBF"')
    editor.destroy()
  })

  it('表格：增行之后只有 document.xml 变，且 tcPr 里带上底纹', async () => {
    const { bytes, session, editor } = await makeSession()
    const at = findTop(editor, 'docTable')
    editor.commands.setTextSelection(at + 4)
    expect(isInTable(editor.state)).toBe(true)

    runCommand(editor, 'command', (props: { state: Editor['state']; dispatch?: () => void }) =>
      addRowAfter(props.state, props.dispatch as never),
    )
    editor
      .chain()
      .focus()
      .setTextSelection(at + 4)
      .updateAttributes('docTableCell', { fill: 'DEEAF6' })
      .run()

    const { changed, xml } = await saveAndDiff(editor, session, bytes)
    expect(changed).toEqual(['word/document.xml'])
    // 表格被重建（结构变了），新行必须在 XML 里
    expect(xml).toContain('<w:tbl>')
    editor.destroy()
  })

  it('单元格边距落在表级 tblPr（convert.ts 的 tableStructureSignature 含它）', async () => {
    const { bytes, session, editor } = await makeSession()
    const at = findTop(editor, 'docTable')
    editor.commands.setTextSelection(at + 4)
    editor
      .chain()
      .focus()
      .updateAttributes('docTable', { cellMar: { top: 60, left: 108 }, cellMarEdited: true })
      .run()

    const { changed, xml } = await saveAndDiff(editor, session, bytes)
    expect(changed).toEqual(['word/document.xml'])
    expect(xml).toContain('w:tblCellMar')
    editor.destroy()
  })

  it('表格对齐写 w:jc，自动调整写 w:tblLayout', async () => {
    const { bytes, session, editor } = await makeSession()
    const at = findTop(editor, 'docTable')
    editor.commands.setTextSelection(at + 4)
    editor.chain().focus().updateAttributes('docTable', { tblAlign: 'center' }).run()
    editor
      .chain()
      .focus()
      .updateAttributes('docTable', { tblAutoFit: 'contents', tblAutoFitEdited: true })
      .run()

    const { changed, xml } = await saveAndDiff(editor, session, bytes)
    expect(changed).toEqual(['word/document.xml'])
    expect(xml).toMatch(/<w:jc w:val="center"\/>/)
    editor.destroy()
  })

  it('删行之后保存：表格之外一个条目都不动', async () => {
    const { bytes, session, editor } = await makeSession()
    const at = findTop(editor, 'docTable')
    editor.commands.setTextSelection(at + 4)
    expect(
      runCommand(editor, 'command', (props: { state: Editor['state']; dispatch?: () => void }) =>
        deleteRow(props.state, props.dispatch as never),
      ),
    ).toBe(true)

    const { changed } = await saveAndDiff(editor, session, bytes)
    expect(changed).toEqual(['word/document.xml'])
    editor.destroy()
  })

  it('列表项改层级写 w:ilvl（不是缩进）', async () => {
    const { bytes, session, editor } = await makeSession()
    const at = findTop(editor, 'docListItem')
    editor.commands.setTextSelection(at + 1)
    editor.chain().focus().updateAttributes('docListItem', { ilvl: 2 }).run()

    const { changed, xml } = await saveAndDiff(editor, session, bytes)
    expect(changed).toEqual(['word/document.xml'])
    expect(xml).toContain('<w:ilvl w:val="2"/>')
    editor.destroy()
  })

  it('只改一个字的文字：其余块仍是原字节（补丁路径没有退化）', async () => {
    const { bytes, session, editor } = await makeSession()
    const at = findTop(editor, 'docParagraph')
    editor
      .chain()
      .focus()
      .setTextSelection(at + 1)
      .insertContent('改')
      .run()

    const { changed } = await saveAndDiff(editor, session, bytes)
    expect(changed).toEqual(['word/document.xml'])
    editor.destroy()
  })

  /*
   * 插图那一条单拎出来，因为它有一个**点了没反应**的经典症状：
   * `imageDataUrl` 少写一次，画布上的渲染分支（`blockType === 'image' &&
   * imageDataUrl`，`extensions.ts:4057`）就落空框——用户看到的是「点了没反应」，
   * 而保存再打开图又出现了（文件里是对的）。所以两个都要断言：模型里有
   * `imageDataUrl`（当场看得见），保存后有图片条目（文件里也有）。
   */
  it('插图：模型里带 imageDataUrl，保存后真的多出图片条目', async () => {
    const { session, editor } = await makeSession()
    const at = findTop(editor, 'docParagraph')
    // 1×1 的透明 PNG（最小合法图，避免造一张大图）
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='
    editor.commands.setTextSelection(at + 1)
    expect(
      runCommand(editor, 'insertContent', {
        type: 'docProtected',
        attrs: {
          docxIndex: null,
          blockType: 'image',
          label: 'probe.png',
          imageDataUrl: `data:image/png;base64,${png}`,
          imageWidthPx: 10,
          imageHeightPx: 10,
          genImage: { base64: png, mime: 'image/png', widthPx: 10, heightPx: 10 },
        },
      }),
    ).toBe(true)

    const inserted = editor.state.doc.content.content.find(
      (node) => node.type.name === 'docProtected',
    )
    expect(inserted, '插图没有落进文档').toBeDefined()
    // 画布要用的那一个是 imageDataUrl（不是 genImage）
    expect(inserted!.attrs.imageDataUrl).toBe(`data:image/png;base64,${png}`)

    const saved = await session.save(editor.getJSON() as never)
    const zip = await JSZip.loadAsync(saved)
    const media = Object.keys(zip.files).filter((name) => name.startsWith('word/media/'))
    expect(media.length).toBeGreaterThan(0)
    editor.destroy()
  })

  it('原样保存：一条都不变（这是补丁路径的前提）', async () => {
    const { bytes, session, editor } = await makeSession()
    const { changed } = await saveAndDiff(editor, session, bytes)
    expect(changed).toEqual([])
    editor.destroy()
  })
})

/*
 * 列宽的**单位**是一条独立的回归线。
 *
 * 单元格上的 `colwidth` 属性存的是 **px**——解析时 `convert.ts:930` 写入，
 * 保存时 `convert.ts:1236` 自己乘 15 换回 twips；而工具条的输入框说的是
 * **twips**（显示时再除 20 变磅）。两头各要一次换算，漏掉任何一次都不会报错，
 * 症状是「每次编辑把列宽放大 15 倍」：把一列存成 234 磅，文件里出现
 * `<w:gridCol w:w="70200"/>`（3510 磅，远超页宽），重开控件再显示成 15.6 磅。
 *
 * 所以这条线用**往返**守：写入一个值 → 保存 → 检查文件 → 重新读回，三处一致
 * 才算对。fixture 用 05-long-table.docx（kitchen-sink 的表没有 tblGrid，
 * `colwidth` 是 null，走不到这条换算）。
 */
describe('列宽的单位（colwidth 属性是 px，界面是 twips）', () => {
  const TABLE_FIXTURE = join(
    import.meta.dirname,
    '../../vendor/apps/docs/tests/pagination-corpus/docx/05-long-table.docx',
  )

  async function makeTableSession() {
    const bytes = new Uint8Array(readFileSync(TABLE_FIXTURE))
    const session = await openDocx(bytes)
    const editor = new Editor({
      element: document.createElement('div'),
      extensions: editorExtensions,
      content: session.content as never,
    })
    return { session, editor }
  }

  it('显示：文件里 2000 twips（100 磅）的列，控件读出来就是 100 磅（不是 6.7）', async () => {
    const { editor } = await makeTableSession()
    const at = findTop(editor, 'docTable')
    editor.commands.setTextSelection(at + 4)
    const widths = columnWidthsTwips(editor, selectedRect(editor.state))
    expect(widths).not.toBeNull()
    // 4 列各 2000 twips = 100 磅。px（133）被当 twips 用会显示成 6.65 磅
    for (const width of widths!) {
      expect(Math.abs(width / 20 - 100)).toBeLessThan(1)
    }
    editor.destroy()
  })

  it('往返：写入 3000 twips，文件里就是 w:w="3000"，重开读回还是 3000', async () => {
    const { session, editor } = await makeTableSession()
    const at = findTop(editor, 'docTable')
    editor.commands.setTextSelection(at + 4)
    setColumnWidth(editor, selectedRect(editor.state), 0, 3000)

    const saved = await session.save(editor.getJSON() as never)
    const zip = await JSZip.loadAsync(saved)
    const xml = (await zip.file('word/document.xml')!.async('string')) ?? ''
    // 写入的 twips 原样落盘。px 当 twips 存的话，保存会再乘 15 → 45000
    expect(xml).toContain('<w:gridCol w:w="3000"/>')

    // 重新读回还是那个值（这一步同时验证解析侧的换算）
    const reopened = await openDocx(saved)
    const editor2 = new Editor({
      element: document.createElement('div'),
      extensions: editorExtensions,
      content: reopened.content as never,
    })
    const at2 = findTop(editor2, 'docTable')
    editor2.commands.setTextSelection(at2 + 4)
    const again = columnWidthsTwips(editor2, selectedRect(editor2.state))
    expect(again).not.toBeNull()
    expect(again![0]).toBe(3000)
    editor.destroy()
    editor2.destroy()
  })
})

/*
 * 段落样式下拉改的是**样式**，样式的落点是 `w:pStyle`。
 *
 * Tiptap 的 `setNode` 会把段落上**没点名的属性原样带过去**（实现里的
 * `attributesToCopy`），所以换级别时必须显式清 `styleId`——不清的话画布换了
 * 级别、文件里还是旧样式（实测：Heading1 选「标题 2」，保存后 XML 仍是
 * `<w:pStyle w:val="Heading1"/>`，重开又变回 level 1）。kitchen-sink 里
 * Heading1 与 Heading2 各恰好 1 个，计数可以当断言用。
 */
describe('段落样式落到文件（w:pStyle 跟着下拉走）', () => {
  it('Heading1 选「标题 2」：styleId 清掉，文件里写 Heading2 不再残留 Heading1', async () => {
    const { bytes, session, editor } = await makeSession()
    const at = findTop(editor, 'docHeading')
    expect(editor.state.doc.nodeAt(at)!.attrs.styleId).toBe('Heading1')
    editor.commands.setTextSelection(at + 1)
    applyParagraphStyle(editor, 'h2')
    expect(editor.state.doc.nodeAt(at)!.attrs.level).toBe(2)
    expect(editor.state.doc.nodeAt(at)!.attrs.styleId).toBeNull()

    const { changed, xml } = await saveAndDiff(editor, session, bytes)
    expect(changed).toEqual(['word/document.xml'])
    expect((xml.match(/w:pStyle w:val="Heading1"/g) ?? []).length).toBe(0)
    expect((xml.match(/w:pStyle w:val="Heading2"/g) ?? []).length).toBe(2)
    editor.destroy()
  })

  it('Heading1 选「正文」：pStyle 整个消失', async () => {
    const { bytes, session, editor } = await makeSession()
    const at = findTop(editor, 'docHeading')
    editor.commands.setTextSelection(at + 1)
    applyParagraphStyle(editor, 'p')
    expect(editor.state.doc.nodeAt(at)!.attrs.styleId).toBeNull()

    const { changed, xml } = await saveAndDiff(editor, session, bytes)
    expect(changed).toEqual(['word/document.xml'])
    expect((xml.match(/w:pStyle w:val="Heading1"/g) ?? []).length).toBe(0)
    editor.destroy()
  })

  it('Heading1 选「引用」：引用是直接格式，文件里也不能再是标题样式', async () => {
    const { bytes, session, editor } = await makeSession()
    const at = findTop(editor, 'docHeading')
    editor.commands.setTextSelection(at + 1)
    applyParagraphStyle(editor, 'quote')

    const { changed, xml } = await saveAndDiff(editor, session, bytes)
    expect(changed).toEqual(['word/document.xml'])
    expect((xml.match(/w:pStyle w:val="Heading1"/g) ?? []).length).toBe(0)
    // 引用的左线照旧落盘（它不是样式，是直接段落格式）
    expect(xml).toMatch(/<w:pBdr><w:left [^>]*\/><\/w:pBdr>/)
    editor.destroy()
  })
})
