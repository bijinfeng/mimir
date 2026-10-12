/**
 * 页面模型与保存的实测。
 *
 * 这个仓库对 PDF 的验证方式是**用另一份库独立读回产出物**：pdf-lib 写、
 * pdf.js 读，两边都不是被测代码。这样断言的才是「文件里到底写了什么」，
 * 而不是「我们以为写了什么」。
 *
 * 覆盖的四件容易静默出错的事：
 *
 *   1. **页序与旋转**：重建后逐页对（含倒序、插空白页）
 *   2. **导入的页在第二次保存时还在**（改动里留着那份字节的意义）
 *   3. **裁剪不动内容**：内容流逐字节相同，只有 CropBox 变了
 *   4. **换纸型时内容绕可视区左下角缩放**（不是绕原点——那会让画面平移）
 */

import { PDFDocument, StandardFonts } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import {
  BLANK_PAGE_SIZE,
  buildPdfBytes,
  CROP_PRESETS,
  displaySize,
  isPristine,
  maxCropInset,
  normalizeAngle,
  paperKeyOf,
  paperOf,
  projectBox,
  readPdfPages,
  sameLayout,
  screenSize,
  targetSize,
  visibleSize,
  withCrop,
  withPaper,
  withRotation,
  type PdfPageRef,
} from './pdf-pages.js'

/**
 * 造一份有文字的 PDF：每页一个词，尺寸与落点可控
 */
async function makePdf(
  specs: readonly { text: string; width: number; height: number; x?: number }[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (const spec of specs) {
    const page = doc.addPage([spec.width, spec.height])
    page.drawText(spec.text, { x: spec.x ?? 50, y: spec.height - 100, size: 12, font })
  }
  return doc.save()
}

/** 用 pdf.js 独立读回：每页的文字与第一段文字的落点（用户空间） */
async function readBack(
  bytes: Uint8Array,
): Promise<{ text: string; x: number; y: number; width: number }[]> {
  const task = getDocument({ data: bytes.slice() })
  const doc = await task.promise
  const out: { text: string; x: number; y: number; width: number }[] = []
  for (let index = 0; index < doc.numPages; index += 1) {
    const page = await doc.getPage(index + 1)
    const content = await page.getTextContent()
    const item = content.items.find((entry) => 'str' in entry && entry.str.trim() !== '')
    out.push({
      text: content.items
        .map((entry) => ('str' in entry ? entry.str : ''))
        .join('')
        .trim(),
      x: item !== undefined && 'transform' in item ? (item.transform[4] as number) : Number.NaN,
      y: item !== undefined && 'transform' in item ? (item.transform[5] as number) : Number.NaN,
      width: item !== undefined && 'width' in item ? item.width : Number.NaN,
    })
  }
  await task.destroy()
  return out
}

/** 一张原件页的 ref（打开那一刻的样子由 readPdfPages 给，这里手动造等价物） */
function refOf(index: number, size: { width: number; height: number }, rotation = 0): PdfPageRef {
  return { origin: { kind: 'original', index }, rotation, base: size, crop: null, paper: null }
}

const NO_IMPORTS: ReadonlyMap<string, Uint8Array> = new Map()

describe('readPdfPages', () => {
  it('读出每页的可视区尺寸与旋转（角度收进 [0,360)）', async () => {
    const doc = await PDFDocument.create()
    doc.addPage([300, 400])
    doc.addPage([200, 500])
    const bytes = await doc.save()

    const pages = await readPdfPages(bytes)
    expect(pages.map((page) => [page.width, page.height])).toEqual([
      [300, 400],
      [200, 500],
    ])
    expect(pages.every((page) => page.rotation === 0)).toBe(true)
  })

  it('已经带 CropBox 的 PDF：以**可视区**为准，不是 MediaBox', async () => {
    const doc = await PDFDocument.create()
    const page = doc.addPage([600, 800])
    page.setCropBox(50, 60, 300, 400)
    const bytes = await doc.save()

    const pages = await readPdfPages(bytes)
    expect(pages[0]?.width).toBe(300)
    expect(pages[0]?.height).toBe(400)
  })

  it('450 与 90 是一回事', () => {
    expect(normalizeAngle(450)).toBe(90)
    expect(normalizeAngle(-90)).toBe(270)
    expect(normalizeAngle(360)).toBe(0)
  })
})

describe('PDF 文档级信息的保存边界', () => {
  it('重排页面时保留标准文档信息', async () => {
    const doc = await PDFDocument.create()
    doc.addPage([300, 400])
    doc.setTitle('保留标题')
    doc.setAuthor('作者')
    doc.setSubject('主题')
    doc.setKeywords(['alpha beta'])
    doc.setCreator('创建者')
    doc.setProducer('生成者')
    doc.setCreationDate(new Date('2024-01-02T03:04:05.000Z'))
    doc.setModificationDate(new Date('2024-02-03T04:05:06.000Z'))
    const bytes = await doc.save()

    const rebuilt = await buildPdfBytes({
      bytes,
      layout: [refOf(0, { width: 300, height: 400 }, 90)],
      imports: NO_IMPORTS,
    })
    const reopened = await PDFDocument.load(rebuilt, { updateMetadata: false })
    expect(reopened.getTitle()).toBe('保留标题')
    expect(reopened.getAuthor()).toBe('作者')
    expect(reopened.getSubject()).toBe('主题')
    expect(reopened.getKeywords()).toBe('alpha beta')
    expect(reopened.getCreator()).toBe('创建者')
    expect(reopened.getProducer()).toBe('生成者')
    expect(reopened.getCreationDate()?.toISOString()).toBe('2024-01-02T03:04:05.000Z')
    expect(reopened.getModificationDate()?.toISOString()).toBe('2024-02-03T04:05:06.000Z')
    expect(reopened.getPages()[0]?.getRotation().angle).toBe(90)
  })

  it('原件含表单时拒绝重建，防止字段静默丢失', async () => {
    const doc = await PDFDocument.create()
    const page = doc.addPage([300, 400])
    doc.getForm().createTextField('contact').addToPage(page)
    const bytes = await doc.save()

    await expect(
      buildPdfBytes({
        bytes,
        layout: [refOf(0, { width: 300, height: 400 }, 90)],
        imports: NO_IMPORTS,
      }),
    ).rejects.toThrow(/AcroForm.*未写回原件/)
  })
})

describe('buildPdfBytes 的页序与旋转', () => {
  it('同一来源页复制后，两份内容都保留且旋转彼此独立', async () => {
    const bytes = await makePdf([
      { text: 'ONE', width: 300, height: 400 },
      { text: 'TWO', width: 300, height: 400 },
    ])
    const layout = [
      refOf(0, { width: 300, height: 400 }, 0),
      refOf(0, { width: 300, height: 400 }, 90),
      refOf(1, { width: 300, height: 400 }, 0),
    ]
    const out = await buildPdfBytes({ bytes, layout, imports: NO_IMPORTS })
    expect((await readBack(out)).map((page) => page.text)).toEqual(['ONE', 'ONE', 'TWO'])
    const doc = await PDFDocument.load(out)
    expect(doc.getPages().map((page) => page.getRotation().angle)).toEqual([0, 90, 0])
  })

  it('倒序 + 旋转 90 度：逐页对（用 pdf.js 读回，不是我们自己的模型）', async () => {
    const bytes = await makePdf([
      { text: 'ONE', width: 300, height: 400 },
      { text: 'TWO', width: 300, height: 400 },
      { text: 'THREE', width: 300, height: 400 },
    ])
    const layout = [
      refOf(2, { width: 300, height: 400 }, 90),
      refOf(1, { width: 300, height: 400 }, 180),
      refOf(0, { width: 300, height: 400 }, 0),
    ]
    const out = await buildPdfBytes({ bytes, layout, imports: NO_IMPORTS })

    const back = await readBack(out)
    expect(back.map((page) => page.text)).toEqual(['THREE', 'TWO', 'ONE'])

    // 旋转角独立读回：pdf-lib 是另一份实现
    const doc = await PDFDocument.load(out)
    expect(doc.getPages().map((page) => page.getRotation().angle)).toEqual([90, 180, 0])
  })

  it('插入空白页：位置对、尺寸是 A4、没有内容', async () => {
    const bytes = await makePdf([
      { text: 'ONE', width: 300, height: 400 },
      { text: 'TWO', width: 300, height: 400 },
    ])
    const blank: PdfPageRef = {
      origin: { kind: 'blank' },
      rotation: 0,
      base: BLANK_PAGE_SIZE,
      crop: null,
      paper: null,
    }
    const layout = [
      refOf(0, { width: 300, height: 400 }),
      blank,
      refOf(1, { width: 300, height: 400 }),
    ]
    const out = await buildPdfBytes({ bytes, layout, imports: NO_IMPORTS })

    const back = await readBack(out)
    expect(back.map((page) => page.text)).toEqual(['ONE', '', 'TWO'])

    const doc = await PDFDocument.load(out)
    expect(doc.getPages().map((page) => page.getSize().width)).toEqual([300, 595.28, 300])
  })
})

describe('buildPdfBytes 的导入页面', () => {
  it('同一导入页复制后保存并重开，两个页项均有内容', async () => {
    const bytes = await makePdf([{ text: 'MAIN', width: 300, height: 400 }])
    const other = await makePdf([{ text: 'BORROWED', width: 200, height: 200 }])
    const imported: PdfPageRef = {
      origin: { kind: 'imported', source: 'import-1', index: 0 },
      rotation: 0,
      base: { width: 200, height: 200 },
      crop: null,
      paper: null,
    }
    const out = await buildPdfBytes({
      bytes,
      layout: [imported, { ...imported, rotation: 180 }, refOf(0, { width: 300, height: 400 })],
      imports: new Map([['import-1', other]]),
    })
    expect((await readBack(out)).map((page) => page.text)).toEqual(['BORROWED', 'BORROWED', 'MAIN'])
    const doc = await PDFDocument.load(out)
    expect(doc.getPages().map((page) => page.getRotation().angle)).toEqual([0, 180, 0])
  })

  it('导入的页写进产出物，且**第二次保存**（从同一份原件重建）还在', async () => {
    const bytes = await makePdf([{ text: 'MAIN', width: 300, height: 400 }])
    const other = await makePdf([{ text: 'BORROWED', width: 200, height: 200 }])
    const imports = new Map([['import-1', other]])
    const layout: PdfPageRef[] = [
      refOf(0, { width: 300, height: 400 }),
      {
        origin: { kind: 'imported', source: 'import-1', index: 0 },
        rotation: 0,
        base: { width: 200, height: 200 },
        crop: null,
        paper: null,
      },
    ]

    const first = await buildPdfBytes({ bytes, layout, imports })
    expect((await readBack(first)).map((page) => page.text)).toEqual(['MAIN', 'BORROWED'])

    // 第二次：原件没变（还是那份 bytes），改动也没变 —— 结果必须一样
    const second = await buildPdfBytes({ bytes, layout, imports })
    expect((await readBack(second)).map((page) => page.text)).toEqual(['MAIN', 'BORROWED'])
  })

  it('导入的字节丢了就**抛错**，不静默少几页', async () => {
    const bytes = await makePdf([{ text: 'MAIN', width: 300, height: 400 }])
    const layout: PdfPageRef[] = [
      {
        origin: { kind: 'imported', source: 'import-9', index: 0 },
        rotation: 0,
        base: { width: 200, height: 200 },
        crop: null,
        paper: null,
      },
    ]
    await expect(buildPdfBytes({ bytes, layout, imports: NO_IMPORTS })).rejects.toThrow(
      /导入的页面/,
    )
  })
})

describe('裁剪：只改可视区，内容一字未动', () => {
  it('CropBox 按内缩量缩小，而内容流逐字节相同、文字一个点没动', async () => {
    const bytes = await makePdf([{ text: 'HELLO', width: 600, height: 800, x: 100 }])
    const before = await readBack(bytes)

    const insets = { top: 30, right: 40, bottom: 50, left: 60 }
    const layout = [withCrop(refOf(0, { width: 600, height: 800 }), insets)]
    const out = await buildPdfBytes({ bytes, layout, imports: NO_IMPORTS })

    const doc = await PDFDocument.load(out)
    const crop = doc.getPage(0).getCropBox()
    expect([crop.x, crop.y, crop.width, crop.height]).toEqual([60, 50, 500, 720])

    // **裁剪只写 CropBox 一个键**：内容流前后逐字节相同
    const original = await PDFDocument.load(bytes)
    expect(await contentBytes(doc.getPage(0))).toEqual(await contentBytes(original.getPage(0)))

    const after = await readBack(out)
    expect(after[0]?.text).toBe('HELLO')
    expect(after[0]?.x).toBeCloseTo(before[0]!.x, 3)
    expect(after[0]?.y).toBeCloseTo(before[0]!.y, 3)
  })

  it('裁掉的那一块**取不到文字**（pdf.js 按 CropBox 裁文本层，与实际看到的一致）', async () => {
    const bytes = await makePdf([{ text: 'HELLO', width: 600, height: 800, x: 100 }])
    // 从 x=110 裁起：'H' 整段落在可视区外
    const layout = [
      withCrop(refOf(0, { width: 600, height: 800 }), { top: 0, right: 0, bottom: 0, left: 110 }),
    ]
    const out = await buildPdfBytes({ bytes, layout, imports: NO_IMPORTS })
    const after = await readBack(out)
    expect(after[0]?.text).not.toContain('H')
  })

  it('裁到零面积：抛错，而不是产出一个所有阅读器都打不开的页', async () => {
    const bytes = await makePdf([{ text: 'X', width: 100, height: 100 }])
    const layout = [
      withCrop(refOf(0, { width: 100, height: 100 }), { top: 60, right: 0, bottom: 60, left: 0 }),
    ]
    await expect(buildPdfBytes({ bytes, layout, imports: NO_IMPORTS })).rejects.toThrow(/正数/)
  })

  it('档位与上限：留 20pt 底线，界面上超上限的档位会禁用', () => {
    expect(CROP_PRESETS.every((value) => value > 0)).toBe(true)
    expect(maxCropInset({ width: 595.28, height: 841.89 })).toBe(277)
    expect(maxCropInset({ width: 60, height: 60 })).toBe(10)
  })
})

describe('纸型：scaleContent 与 setSize 必须配对', () => {
  it('换 A4：纸变成 A4，内容是等比放大（取小的一边，不拉伸）', async () => {
    const bytes = await makePdf([{ text: 'SCALE', width: 300, height: 400 }])
    const before = await readBack(bytes)

    const layout = [withPaper(refOf(0, { width: 300, height: 400 }), paperOf('a4', false))]
    const out = await buildPdfBytes({ bytes, layout, imports: NO_IMPORTS })

    const doc = await PDFDocument.load(out)
    const size = doc.getPage(0).getSize()
    expect(size.width).toBeCloseTo(595.28, 2)
    expect(size.height).toBeCloseTo(841.89, 2)

    // k = min(595.28/300, 841.89/400) = 1.9843；内容绕原点（可视区左下角就是原点）缩放
    const k = Math.min(595.28 / 300, 841.89 / 400)
    const after = await readBack(out)
    expect(after[0]?.x).toBeCloseTo(before[0]!.x * k, 2)
    expect(after[0]?.y).toBeCloseTo(before[0]!.y * k, 2)
    expect(after[0]?.width).toBeCloseTo(before[0]!.width * k, 2)
  })

  it('先裁左边 50pt 再换纸型：内容绕**可视区左下角**缩放，不是绕原点', async () => {
    const bytes = await makePdf([{ text: 'ANCHOR', width: 300, height: 400, x: 100 }])
    const before = await readBack(bytes)
    expect(before[0]!.x).toBeCloseTo(100, 3)

    const cropped = withCrop(refOf(0, { width: 300, height: 400 }), {
      top: 0,
      right: 0,
      bottom: 0,
      left: 50,
    })
    // 可视区 250×400，纸 200×400 → k = 0.8
    const layout = [withPaper(cropped, { width: 200, height: 400 })]
    const out = await buildPdfBytes({ bytes, layout, imports: NO_IMPORTS })

    const doc = await PDFDocument.load(out)
    expect(doc.getPage(0).getSize()).toEqual({ width: 200, height: 400 })

    // 期望 x = 50 + (100 - 50)·0.8 = 90。若绕原点缩放（不补平移）会得到 80
    const k = 0.8
    const after = await readBack(out)
    expect(after[0]?.x).toBeCloseTo(50 + (before[0]!.x - 50) * k, 2)
    expect(after[0]?.width).toBeCloseTo(before[0]!.width * k, 2)
  })

  it('换纸型后可视区就是整张新纸', async () => {
    const bytes = await makePdf([{ text: 'FULL', width: 300, height: 400 }])
    const cropped = withCrop(refOf(0, { width: 300, height: 400 }), {
      top: 10,
      right: 10,
      bottom: 10,
      left: 10,
    })
    const out = await buildPdfBytes({
      bytes,
      layout: [withPaper(cropped, paperOf('a5', false))],
      imports: NO_IMPORTS,
    })
    const doc = await PDFDocument.load(out)
    const crop = doc.getPage(0).getCropBox()
    expect([crop.x, crop.y, crop.width, crop.height]).toEqual([0, 0, 419.53, 595.28])
  })
})

describe('isPristine：改回原样就不算改过', () => {
  const original = [
    { width: 600, height: 800, rotation: 0 },
    { width: 600, height: 800, rotation: 90 },
  ]
  const refs = original.map((page, index) => refOf(index, page, page.rotation))

  it('原样 = pristine', () => {
    expect(isPristine(refs, original)).toBe(true)
  })

  it('转过去又转回来 = pristine（不会「打开就重写」）', () => {
    const round = refs.map((ref) => withRotation(withRotation(ref, 90), -90))
    expect(isPristine(round, original)).toBe(true)
  })

  it('旋转过、删过、倒序过、裁过、换过纸型都不算 pristine', () => {
    expect(isPristine([withRotation(refs[0]!, 90), refs[1]!], original)).toBe(false)
    expect(isPristine([refs[1]!], original)).toBe(false)
    expect(isPristine(refs.toReversed(), original)).toBe(false)
    expect(
      isPristine(
        [withCrop(refs[0]!, { top: 1, right: 0, bottom: 0, left: 0 }), refs[1]!],
        original,
      ),
    ).toBe(false)
    expect(isPristine([withPaper(refs[0]!, paperOf('a4', false)), refs[1]!], original)).toBe(false)
    expect(isPristine([{ ...refs[0]!, origin: { kind: 'blank' } }, refs[1]!], original)).toBe(false)
  })

  it('尺寸被改过（打开时读的不一样）也不算 pristine', () => {
    const resized = [{ ...refs[0]!, base: { width: 601, height: 800 } }, refs[1]!]
    expect(isPristine(resized, original)).toBe(false)
  })
})

describe('sameLayout：保存之后与磁盘上那份比', () => {
  const refs: PdfPageRef[] = [
    refOf(0, { width: 300, height: 400 }, 90),
    refOf(1, { width: 300, height: 400 }),
  ]

  it('结构相同就是 true（不同数组也算）', () => {
    expect(
      sameLayout(
        refs,
        refs.map((ref) => ({ ...ref })),
      ),
    ).toBe(true)
    expect(sameLayout(refs, refs)).toBe(true)
  })

  it('任何一处不同就是 false：页数、顺序、旋转、裁剪、纸型、尺寸、来源', () => {
    expect(sameLayout(refs, [refs[0]!])).toBe(false)
    expect(sameLayout(refs, refs.toReversed())).toBe(false)
    expect(sameLayout(refs, [withRotation(refs[0]!, 180), refs[1]!])).toBe(false)
    expect(
      sameLayout(refs, [withCrop(refs[0]!, { top: 5, right: 5, bottom: 5, left: 5 }), refs[1]!]),
    ).toBe(false)
    expect(sameLayout(refs, [withPaper(refs[0]!, paperOf('a4', false)), refs[1]!])).toBe(false)
    expect(sameLayout(refs, [{ ...refs[0]!, base: { width: 301, height: 400 } }, refs[1]!])).toBe(
      false,
    )
    expect(sameLayout(refs, [{ ...refs[0]!, origin: { kind: 'blank' } }, refs[1]!])).toBe(false)
  })

  it('导入页要比来源键：换了文件（同一页号）就是不同的页', () => {
    const a: PdfPageRef[] = [
      {
        origin: { kind: 'imported', source: 'f1', index: 0 },
        rotation: 0,
        base: { width: 10, height: 10 },
        crop: null,
        paper: null,
      },
    ]
    const b: PdfPageRef[] = [
      {
        origin: { kind: 'imported', source: 'f2', index: 0 },
        rotation: 0,
        base: { width: 10, height: 10 },
        crop: null,
        paper: null,
      },
    ]
    expect(sameLayout(a, b)).toBe(false)
    expect(
      sameLayout(a, [{ ...a[0]!, origin: { kind: 'imported', source: 'f1', index: 0 } }]),
    ).toBe(true)
  })

  it('裁剪的四个数各自算：只差一个就不是同一个结构', () => {
    const left = withCrop(refOf(0, { width: 300, height: 400 }), {
      top: 10,
      right: 10,
      bottom: 10,
      left: 10,
    })
    const other = withCrop(refOf(0, { width: 300, height: 400 }), {
      top: 10,
      right: 10,
      bottom: 10,
      left: 11,
    })
    expect(sameLayout([left], [left])).toBe(true)
    expect(sameLayout([left], [other])).toBe(false)
  })
})

describe('派生几何', () => {
  const ref: PdfPageRef = {
    origin: { kind: 'original', index: 0 },
    rotation: 0,
    base: { width: 600, height: 800 },
    crop: null,
    paper: null,
  }

  it('旋转 90 度时显示尺寸交换，盒子尺寸不变（/Rotate 不改 MediaBox）', () => {
    const rotated = withRotation(ref, 90)
    expect(rotated.rotation).toBe(90)
    expect(targetSize(rotated)).toEqual({ width: 600, height: 800 })
    expect(displaySize(rotated)).toEqual({ width: 800, height: 600 })
  })

  it('两次反向旋转回到原样（绝对值语义）', () => {
    expect(withRotation(withRotation(ref, 90), -90).rotation).toBe(0)
    expect(withRotation(ref, -90).rotation).toBe(270)
  })

  it('裁剪后的可视尺寸，以及纸型覆盖它', () => {
    const cropped = withCrop(ref, { top: 20, right: 30, bottom: 40, left: 50 })
    expect(visibleSize(cropped)).toEqual({ width: 520, height: 740 })
    expect(targetSize(cropped)).toEqual({ width: 520, height: 740 })
    const withA4 = withPaper(cropped, paperOf('a4', false))
    expect(targetSize(withA4)).toEqual({ width: 595.28, height: 841.89 })
  })

  it('横向的页面选 A4 得到横向 A4', () => {
    expect(paperOf('a4', true)).toEqual({ width: 841.89, height: 595.28 })
  })

  it('认得出档位（横向也算同一个档位），认不出就是 null（不冒充第一项）', () => {
    expect(paperKeyOf(paperOf('letter', false))).toBe('letter')
    expect(paperKeyOf(paperOf('letter', true))).toBe('letter')
    expect(paperKeyOf(null)).toBeNull()
    expect(paperKeyOf({ width: 500, height: 700 })).toBeNull()
  })
})

/**
 * 画布投影：与 **pdf.js 的 `convertToViewportPoint` 逐个角比对**。
 *
 * 这个函数错了不会报错——裁剪框只是画偏。而它以「实测出来的四条映射」为基础，
 * 所以测试必须对着那份实测（不是对着我推的公式，那等于自己证明自己）。
 */
describe('projectBox / screenSize：与 pdf.js 的 viewport 一致', () => {
  const BASE = { width: 300, height: 400 }

  /** 一块矩形（用户空间，相对可视区左下角）→ 画布坐标 */
  const patch = { x: 40, y: 60, width: 120, height: 150 }

  it('四个旋转角下，四角的外包矩形与 pdf.js 给的一致', async () => {
    const bytes = await makePdf([{ text: 'x', width: BASE.width, height: BASE.height }])
    const task = getDocument({ data: bytes.slice() })
    const doc = await task.promise
    const proxy = await doc.getPage(1)

    const corners: [number, number][] = [
      [patch.x, patch.y],
      [patch.x + patch.width, patch.y],
      [patch.x + patch.width, patch.y + patch.height],
      [patch.x, patch.y + patch.height],
    ]

    for (const rotation of [0, 90, 180, 270]) {
      const viewport = proxy.getViewport({ scale: 1, rotation })
      const projected = corners.map(([x, y]) => viewport.convertToViewportPoint(x, y))
      const xs = projected.map((point) => point[0] as number)
      const ys = projected.map((point) => point[1] as number)
      const want = {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      }

      const got = projectBox(patch, BASE, rotation)
      expect(got.x, `rotation ${rotation} 的 x`).toBeCloseTo(want.x, 6)
      expect(got.y, `rotation ${rotation} 的 y`).toBeCloseTo(want.y, 6)
      expect(got.width, `rotation ${rotation} 的宽`).toBeCloseTo(want.width, 6)
      expect(got.height, `rotation ${rotation} 的高`).toBeCloseTo(want.height, 6)

      // 画布尺寸也要对得上（它是上面那些比例的分母）
      const screen = screenSize(BASE, rotation)
      expect(screen.width, `rotation ${rotation} 的画布宽`).toBeCloseTo(viewport.width, 6)
      expect(screen.height, `rotation ${rotation} 的画布高`).toBeCloseTo(viewport.height, 6)
    }

    await task.destroy()
  })

  it('整页（不裁剪）投影后正好铺满画布', () => {
    const whole = { x: 0, y: 0, ...BASE }
    for (const rotation of [0, 90, 180, 270]) {
      const screen = screenSize(BASE, rotation)
      const got = projectBox(whole, BASE, rotation)
      expect(got.x).toBeCloseTo(0, 6)
      expect(got.y).toBeCloseTo(0, 6)
      expect(got.width).toBeCloseTo(screen.width, 6)
      expect(got.height).toBeCloseTo(screen.height, 6)
    }
  })

  it('90 与 270 不是镜像关系：把 90 的公式反着用会得到错误的位置', () => {
    const at90 = projectBox(patch, BASE, 90)
    const at270 = projectBox(patch, BASE, 270)
    // 90 度：左侧来自用户空间的 y（即 box.y），整体 400×300 上
    expect(at90).toEqual({ x: 60, y: 40, width: 150, height: 120 })
    // 270 度：左侧来自 y 的**上边**（400−60−150），顶边来自 x 的上边（300−40−120）
    expect(at270).toEqual({ x: 190, y: 140, width: 150, height: 120 })
    expect(at90).not.toEqual(at270)
  })
})

/** 一页的内容流字节（解码后的）。用来证明「裁剪没动内容」 */
async function contentBytes(page: ReturnType<PDFDocument['getPage']>): Promise<number[]> {
  const contents = page.node.normalizedEntries().Contents
  if (contents === undefined) return []
  const out: number[] = []
  for (let index = 0; index < contents.size(); index += 1) {
    const stream = page.doc.context.lookup(contents.get(index))
    if (
      stream !== undefined &&
      'getContents' in stream &&
      typeof stream.getContents === 'function'
    ) {
      out.push(...stream.getContents())
    }
  }
  return out
}
