import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { editableElements, openPptxForEdit, textOfElement } from './pptx.js'

/**
 * pptx 的**保存**（`src/pptx-save.ts`）。
 *
 * 守的是补丁式保存的两条性质，它们都是**静默失效**类——出错时不报错，
 * 只是文件里那些我们没建模的东西被重排或丢掉：
 *
 *  1. **没动过的条目逐字节相同**。整个前提是「未改动的元素用
 *     `anchor.originalXml` 原样回填」，一旦哪次改动让某个元素丢了锚点，
 *     那次保存就会重排它的 XML——而 PowerPoint 的切片里有动画时间线、
 *     SmartArt、自定义扩展这些东西
 *  2. **改一段文字只动那一张 slideN.xml**。主题、版式、母版、媒体都不该动
 *
 * 夹具是 python-pptx 现造的（`tests/fixtures/make-pptx-fixtures.py`）。
 */
const TITLE_LAYOUT = new URL('../tests/fixtures/title-layout.pptx', import.meta.url)
const IMAGE_DECK = new URL('../tests/fixtures/image-deck.pptx', import.meta.url)
const FORMATTED_TEXT = new URL('../tests/fixtures/formatted-text.pptx', import.meta.url)

function load(url: URL): Uint8Array {
  return new Uint8Array(readFileSync(url))
}

/** 取一个 zip 条目的文本（XML 层断言用） */
async function zipEntry(bytes: Uint8Array, name: string): Promise<string> {
  const zip = await JSZip.loadAsync(bytes)
  const file = zip.file(name)
  if (!file) throw new Error(`zip 里没有 ${name}`)
  return file.async('string')
}

/** 打开两份字节，逐个条目比较；返回变了的条目名（目录条目不算——见下） */
async function changedEntries(
  before: Uint8Array,
  after: Uint8Array,
): Promise<{ changed: string[]; added: string[]; removed: string[] }> {
  const [a, b] = await Promise.all([JSZip.loadAsync(before), JSZip.loadAsync(after)])
  const names = new Set([
    ...Object.keys(a.files).filter((n) => !a.files[n]!.dir),
    ...Object.keys(b.files).filter((n) => !b.files[n]!.dir),
  ])
  const changed: string[] = []
  const added: string[] = []
  const removed: string[] = []

  for (const name of [...names].toSorted()) {
    const fa = a.files[name]
    const fb = b.files[name]
    if (!fa) {
      added.push(name)
      continue
    }
    if (!fb) {
      removed.push(name)
      continue
    }
    const [da, db] = await Promise.all([fa.async('uint8array'), fb.async('uint8array')])
    if (da.byteLength !== db.byteLength) {
      changed.push(name)
      continue
    }
    for (let i = 0; i < da.byteLength; i += 1) {
      if (da[i] !== db[i]) {
        changed.push(name)
        break
      }
    }
  }
  return { changed, added, removed }
}

describe('保存：无改动时逐字节相同', () => {
  it('打开后直接保存，每个条目字节完全一致', async () => {
    const bytes = load(TITLE_LAYOUT)
    const session = await openPptxForEdit(bytes)
    // 没改任何东西
    expect(session.hasChanges()).toBe(false)

    const out = await session.save()
    const diff = await changedEntries(bytes, out)
    expect(diff.changed).toEqual([])
    expect(diff.added).toEqual([])
    expect(diff.removed).toEqual([])
  })
})

describe('保存：改一段文字', () => {
  it('只动那一张 slideN.xml，其余条目字节不变', async () => {
    const bytes = load(TITLE_LAYOUT)
    const session = await openPptxForEdit(bytes)
    const slide = session.slides()[0]!
    const target = editableElements(slide)[0]!
    expect(target).toBeDefined()

    const ok = session.setText(0, target.id, [{ runs: [{ text: '改过的标题' }], srcPara: 0 }])
    expect(ok).toBe(true)
    expect(session.isDirty(0)).toBe(true)

    const out = await session.save()
    const diff = await changedEntries(bytes, out)
    expect(diff.added).toEqual([])
    expect(diff.removed).toEqual([])
    // 只有这张幻灯片的 XML 变了——主题/版式/母版/rels 一个都没动
    expect(diff.changed).toEqual(['ppt/slides/slide1.xml'])
  })

  it('改完的文字能读回来（重新打开解析）', async () => {
    const bytes = load(TITLE_LAYOUT)
    const session = await openPptxForEdit(bytes)
    const target = editableElements(session.slides()[0]!)[0]!

    session.setText(0, target.id, [{ runs: [{ text: '新的标题文字' }], srcPara: 0 }])
    const out = await session.save()

    const reopened = await openPptxForEdit(out)
    const texts = reopened
      .slides()
      .flatMap((s) => s.elements.map(textOfElement))
      .flatMap((t) => t?.paragraphs ?? [])
      .flatMap((p) => p.runs.map((r) => r.text))
    expect(texts).toContain('新的标题文字')
    // 旧的文字不该还在
    expect(texts).not.toContain('用版式建的标题页')
  })

  it('run 级格式从原 run 继承（只改文字不改字号字体）', async () => {
    const bytes = load(TITLE_LAYOUT)
    const session = await openPptxForEdit(bytes)
    const el = editableElements(session.slides()[0]!)[0]!
    const original = el.text!.paragraphs[0]!.runs[0]!
    const fontSize = original.fontSize
    const fontFamily = original.fontFamily

    session.setText(0, el.id, [{ runs: [{ text: '只改文字' }], srcPara: 0 }])
    const reopened = await openPptxForEdit(await session.save())
    const after = textOfElement(editableElements(reopened.slides()[0]!)[0]!)!.paragraphs[0]!
      .runs[0]!

    expect(after.text).toBe('只改文字')
    // 字号与字体是模型的属性（不是渲染时算的），所以能直接比
    expect(after.fontSize).toBe(fontSize)
    expect(after.fontFamily).toBe(fontFamily)
  })

  it('多段落一起改（段落数变了走重建分支）', async () => {
    const bytes = load(TITLE_LAYOUT)
    const session = await openPptxForEdit(bytes)
    // 正文那个元素有两段
    const body = editableElements(session.slides()[0]!)[1]!
    expect(body.text!.paragraphs.length).toBe(2)

    session.setText(0, body.id, [
      { runs: [{ text: '第一段改了' }], srcPara: 0 },
      { runs: [{ text: '第二段也改了' }], srcPara: 1 },
    ])
    const reopened = await openPptxForEdit(await session.save())
    const after = textOfElement(editableElements(reopened.slides()[0]!)[1]!)!.paragraphs.map((p) =>
      p.runs.map((r) => r.text).join(''),
    )

    expect(after).toEqual(['第一段改了', '第二段也改了'])
  })

  it('两次保存都保留各自的改动（commit 之后锚点已对齐）', async () => {
    /*
     * 守的是一个**静默回滚**：保存后如果不把新 XML 烧回锚点，第二次编辑会
     * 拿旧锚点拼字节，第一次的改动就没了——而两次保存都「成功」。
     */
    const bytes = load(TITLE_LAYOUT)
    const session = await openPptxForEdit(bytes)
    const first = editableElements(session.slides()[0]!)[0]!
    const second = editableElements(session.slides()[0]!)[1]!

    session.setText(0, first.id, [{ runs: [{ text: '标题第一次改' }], srcPara: 0 }])
    await session.save()
    session.commit()

    session.setText(0, second.id, [{ runs: [{ text: '正文第二次改' }], srcPara: 0 }])
    const out = await session.save()
    session.commit()

    const texts = (await openPptxForEdit(out))
      .slides()
      .flatMap((s) => s.elements.map(textOfElement))
      .flatMap((t) => t?.paragraphs ?? [])
      .flatMap((p) => p.runs.map((r) => r.text))
    // 两次改动都在——只留最后一个是那个静默回滚的症状
    expect(texts).toContain('标题第一次改')
    expect(texts).toContain('正文第二次改')
  })
})

describe('保存：不碰没有文字的元素', () => {
  it('一份带图片的演示文稿：改文字后图片条目字节不变', async () => {
    const bytes = load(IMAGE_DECK)
    const session = await openPptxForEdit(bytes)
    const textEl = editableElements(session.slides()[0]!)[0]
    expect(textEl, '夹具里应当有文字元素').toBeDefined()

    session.setText(0, textEl!.id, [{ runs: [{ text: '标题改了' }], srcPara: 0 }])
    const diff = await changedEntries(bytes, await session.save())

    // 媒体条目必须原样——图片是二进制，重压缩会让每个字节都变
    expect(diff.changed.some((n) => n.startsWith('ppt/media/'))).toBe(false)
    expect(diff.changed).toEqual(['ppt/slides/slide1.xml'])
  })
})

/**
 * 上游的夹具（`tests/fixtures/upstream/`，Apache-2.0 的 GenOffice 仓库里
 * 用 python-pptx 生成、MIT 的模板派生物，许可声明在同目录）。
 *
 * 为什么还要它，而不是只用自己造的：这里要验的是**同一份代码在更复杂的
 * XML 上是否还保持逐字节保真**。上游那份是 5 页 / 47 个条目、带图表与
 * 多级文本，而自己造的最小夹具只有 2 个元素——保真失效（比如某个元素
 * 丢了锚点导致整片重建）在最小夹具上可能根本触发不到。
 */
const UPSTREAM_DECK = new URL(
  '../tests/fixtures/upstream/01_standard_business.pptx',
  import.meta.url,
)
const CJK_DECK = new URL('../tests/fixtures/upstream/05_unicode_cjk_emoji.pptx', import.meta.url)

describe('保真：上游的真实演示文稿', () => {
  it('5 页 / 47 条目的文档：打开后直接保存，逐字节相同', async () => {
    const bytes = load(UPSTREAM_DECK)
    const session = await openPptxForEdit(bytes)
    expect(session.slides().length).toBeGreaterThan(1)

    const diff = await changedEntries(bytes, await session.save())
    expect(diff.changed).toEqual([])
    expect(diff.added).toEqual([])
    expect(diff.removed).toEqual([])
  })

  it('改第 3 页的文字：只有 slide3.xml 变，其余 46 个条目字节相同', async () => {
    const bytes = load(UPSTREAM_DECK)
    const session = await openPptxForEdit(bytes)
    const slides = session.slides()
    expect(slides.length).toBeGreaterThanOrEqual(3)

    // 找第 3 页上第一个有文字的元素
    let target: { slideIndex: number; elementId: string } | null = null
    for (const [i, slide] of slides.entries()) {
      const el = editableElements(slide).find((e) =>
        e.text?.paragraphs.some((p) => p.runs.length > 0),
      )
      if (el) {
        target = { slideIndex: i, elementId: el.id }
        break
      }
    }
    expect(target, '夹具里应当有可编辑的文字').not.toBeNull()

    const changedOk = session.setText(target!.slideIndex, target!.elementId, [
      { runs: [{ text: '改过的内容 AaBb' }], srcPara: 0 },
    ])
    expect(changedOk).toBe(true)

    const diff = await changedEntries(bytes, await session.save())
    expect(diff.added).toEqual([])
    expect(diff.removed).toEqual([])
    expect(diff.changed).toEqual([`ppt/slides/slide${target!.slideIndex + 1}.xml`])
  })

  it('CJK + emoji 文档：改文字后 emoji 与其余文字仍在', async () => {
    const bytes = load(CJK_DECK)
    const session = await openPptxForEdit(bytes)
    const el = editableElements(session.slides()[0]!)[0]!
    const before = textOfElement(el)!
      .paragraphs.flatMap((p) => p.runs.map((r) => r.text))
      .join('')
    // 夹具里应当有非 ASCII 内容（这就是选它的原因）
    expect(before).toMatch(/[^\x20-\x7e]/)

    session.setText(0, el.id, [{ runs: [{ text: '替换后的中文 🎯 emoji' }], srcPara: 0 }])
    const reopened = await openPptxForEdit(await session.save())
    const after = reopened
      .slides()[0]!
      .elements.map(textOfElement)
      .flatMap((t) => t?.paragraphs ?? [])
      .flatMap((p) => p.runs.map((r) => r.text))
      .join('')

    expect(after).toContain('替换后的中文')
    // emoji 是代理对（4 字节 UTF-8），编码错了就成问号
    expect(after).toContain('🎯')
  })
})

describe('编辑入口的 DOM 契约', () => {
  it('渲染出的 SVG 带 data-element-id，且值等于模型里的元素 id', async () => {
    /*
     * 编辑器靠 `closest('[data-element-id]')` 把「用户点了哪个图形」映射回
     * 模型元素（SVG 是字符串注入的，React 拿不到节点引用）。
     *
     * 这个属性一旦改名或漏掉，症状是**点画布没反应**——看起来像「这个元素
     * 不能编辑」，而不是报错。所以这里锁住它，并且锁住「值与模型 id 相等」
     * （不相等的话保存会找不到元素，改动被静默丢掉）。
     */
    const session = await openPptxForEdit(load(TITLE_LAYOUT))
    const { renderSlide } = await import('./pptx-render.js')
    const rendered = renderSlide(session, 0, { fitWidthPx: 960 })
    expect(rendered).not.toBeNull()

    const ids = [...rendered!.svg.matchAll(/data-element-id="([^"]+)"/g)].map((m) => m[1]!)
    expect(ids.length).toBeGreaterThan(0)

    const modelIds = new Set(session.slides()[0]!.elements.map((e) => e.id))
    for (const id of ids) {
      expect(modelIds.has(id), `SVG 里的 ${id} 不在模型里`).toBe(true)
    }
  })

  it('可编辑元素两个（标题与正文），且都不是图表之类的不可编辑类型', async () => {
    const session = await openPptxForEdit(load(TITLE_LAYOUT))
    const editable = editableElements(session.slides()[0]!)
    expect(editable.map((e) => e.type)).toEqual(['text', 'text'])
    for (const el of editable) {
      expect(textOfElement(el)).not.toBeNull()
      expect(el.text!.paragraphs.length).toBeGreaterThan(0)
    }
  })
})

describe('保真：改文字不动格式', () => {
  it('只换 <a:t> 的内容，rPr 的每个属性与子节点保持原字节', async () => {
    /*
     * 这是这个功能**最要紧的一条断言**：格式丢了是静默的——文字还在，
     * 只是变成了另一个样子（颜色没了、加粗没了），而用户很难说清是哪里变了。
     *
     * 判据放在 **XML 层**而不是模型层：模型层的 `bold`/`fontSize` 是解析时
     * 算出来的最终值，从它们相等推不出「字节没动」（比如 rPr 被重写成
     * 等价的显式值，模型值一样而字节全变，Word 里那些我们没建模的
     * 扩展属性就丢了）。
     */
    const bytes = load(FORMATTED_TEXT)
    const before = await zipEntry(bytes, 'ppt/slides/slide1.xml')

    const session = await openPptxForEdit(bytes)
    const el = editableElements(session.slides()[0]!)[0]!
    const original = textOfElement(el)!.paragraphs.map((p) => p.runs.map((r) => r.text).join(''))
    expect(original).toEqual(['加粗大字', '斜体小字'])

    session.setText(0, el.id, [
      { runs: [{ text: '改过的加粗大字' }], srcPara: 0 },
      { runs: [{ text: '改过的斜体小字' }], srcPara: 1 },
    ])
    const after = await zipEntry(await session.save(), 'ppt/slides/slide1.xml')

    // 两个 <a:t> 的内容变了
    expect(after).toContain('<a:t>改过的加粗大字</a:t>')
    expect(after).toContain('<a:t>改过的斜体小字</a:t>')
    /**
     * `rPr` 的每一处逐字比对：把两边的 rPr 块抠出来，只替换掉文本内容后
     * 应该完全相同。这比逐属性断言更严——它连属性顺序与子节点顺序都管。
     */
    const beforeRpr = [...before.matchAll(/<a:rPr\b[\s\S]*?<\/a:rPr>|<a:rPr\b[^>]*\/>/g)].map(
      (m) => m[0],
    )
    const afterRpr = [...after.matchAll(/<a:rPr\b[\s\S]*?<\/a:rPr>|<a:rPr\b[^>]*\/>/g)].map(
      (m) => m[0],
    )
    expect(afterRpr).toEqual(beforeRpr)
    expect(beforeRpr.length).toBe(2)

    // 具体到人看得懂的一点：加粗与颜色都还在
    expect(after).toContain('b="1"')
    expect(after).toContain('val="C0392B"')
    expect(after).toContain('i="1"')
    expect(after).toContain('typeface="宋体"')
  })
})
