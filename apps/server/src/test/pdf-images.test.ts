import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts, PDFName } from 'pdf-lib'
import jpeg from 'jpeg-js'
import { applyPdfImageOperation, readPdfImages } from '../services/pdf-images.js'
import { decodePdfImage, encodePdfPng, pdfNativeImageCodec } from '../services/pdf-image-codec.js'
import {
  renderImagePng,
  renderPagePreviewPng,
} from '../../../../packages/office/vendor/apps/pdf/src/main/image-edit.js'

function pixels(alpha = 255) {
  const data = new Uint8ClampedArray(20 * 10 * 4)
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 20; x++) {
      const at = (y * 20 + x) * 4
      data[at] = x < 10 ? 255 : 0
      data[at + 2] = x < 10 ? 0 : 255
      data[at + 3] = alpha
    }
  return { width: 20, height: 10, data }
}
async function fixture(repeated = false) {
  const pdf = await PDFDocument.create(),
    page = pdf.addPage([400, 500])
  page.drawText('KEEP ORIGINAL', {
    x: 30,
    y: 460,
    size: 12,
    font: await pdf.embedFont(StandardFonts.Helvetica),
  })
  const image = await pdf.embedPng(encodePdfPng(pixels()))
  page.drawImage(image, { x: 40, y: 300, width: 80, height: 40 })
  if (repeated) page.drawImage(image, { x: 150, y: 300, width: 80, height: 40 })
  return pdf.save()
}
async function target(bytes: Uint8Array) {
  return (await readPdfImages(bytes)).images[0]!.target
}
async function raster(bytes: Uint8Array) {
  const t = await target(bytes)
  const png = await renderImagePng(bytes, t.pageIndex, t.bounds)
  if (!png) throw new Error('missing preview')
  return decodePdfImage(Buffer.from(png, 'base64'))
}

async function pageRaster(bytes: Uint8Array) {
  const snapshot = await readPdfImages(bytes),
    item = snapshot.images[0]!
  const preview = await renderPagePreviewPng(bytes, {
    pageIndex: item.page - 1,
    excludeRects: [],
    clip: { x: item.x, y: item.y, width: item.width, height: item.height },
    pxWidth: 100,
    rotate: 0,
  })
  if (!preview) throw new Error('missing page preview')
  return decodePdfImage(Buffer.from(preview.png, 'base64'))
}
describe('PDF bounded image codec and object host', () => {
  it('decodes PNG/JPEG, preserves straight alpha through BGRA and bounds decompression', () => {
    const png = encodePdfPng(pixels(128))
    const decoded = decodePdfImage(png)
    expect(Array.from(decoded.data.slice(0, 4))).toEqual([255, 0, 0, 128])
    const native = pdfNativeImageCodec.createFromBuffer(png)
    expect(Array.from(native.toBitmap().slice(0, 4))).toEqual([0, 0, 128, 128])
    const bitmap = pdfNativeImageCodec.createFromBitmap(Buffer.from([40, 45, 220, 128]), {
      width: 1,
      height: 1,
    })
    expect(Array.from(decodePdfImage(bitmap.toPNG()).data)).toEqual([220, 45, 40, 128])
    const jpegBytes = jpeg.encode(
      { width: 20, height: 10, data: Buffer.from(pixels().data) },
      95,
    ).data
    expect(decodePdfImage(jpegBytes)).toMatchObject({ width: 20, height: 10 })
    const huge = Buffer.from(png)
    huge.writeUInt32BE(9000, 16)
    expect(() => decodePdfImage(huge)).toThrow('尺寸')
    expect(() => decodePdfImage(Buffer.concat([png.subarray(0, 33), png.subarray(8)]))).toThrow(
      '图片头',
    )
    expect(() => decodePdfImage(Buffer.from('bad'))).toThrow('PNG')
  })
  it('binds SHA/object/resource identity and rejects reused/overlapping/unsafe image targets', async () => {
    const repeated = await fixture(true),
      listed = await readPdfImages(repeated)
    expect(listed.images).toHaveLength(2)
    expect(listed.images.every((image) => !image.editable)).toBe(true)
    await expect(
      applyPdfImageOperation(repeated, { op: 'delete_image', target: listed.images[0]!.target }),
    ).rejects.toThrow('重复')
    const bytes = await fixture(),
      t = await target(bytes),
      copy = bytes.slice()
    await expect(
      applyPdfImageOperation(bytes, {
        op: 'delete_image',
        target: { ...t, sha256: '0'.repeat(64) },
      }),
    ).rejects.toThrow('过期')
    const pdf = await PDFDocument.load(bytes)
    pdf.catalog.set(PDFName.of('Lang'), pdf.context.obj('en-US'))
    await expect(
      applyPdfImageOperation(await pdf.save(), { op: 'delete_image', target: t }),
    ).rejects.toThrow('结构')
    expect(bytes).toEqual(copy)
  })
  it('modifies geometry, rotated pixels and absolute opacity, then crops/replaces/deletes with independent readback', async () => {
    let bytes = await fixture()
    const original = bytes.slice()
    let result = await applyPdfImageOperation(bytes, {
      op: 'transform_image',
      target: await target(bytes),
      x: 50,
      y: 100,
      width: 100,
      layer: 'above_text',
    })
    bytes = result.bytes!
    expect(result.images.images[0]).toMatchObject({
      x: 50,
      y: 100,
      width: 100,
      height: 50,
      layer: 'above_text',
    })
    result = await applyPdfImageOperation(bytes, {
      op: 'rotate_image',
      target: await target(bytes),
      direction: 'cw',
    })
    bytes = result.bytes!
    expect(result.images.images[0]).toMatchObject({ width: 50, height: 100 })
    result = await applyPdfImageOperation(bytes, {
      op: 'flip_image',
      target: await target(bytes),
      axis: 'vertical',
    })
    bytes = result.bytes!
    const beforeAlpha = await pageRaster(bytes)
    result = await applyPdfImageOperation(bytes, {
      op: 'set_image_opacity',
      target: await target(bytes),
      alpha: 0.5,
    })
    bytes = result.bytes!
    const firstAlpha = await pageRaster(bytes)
    result = await applyPdfImageOperation(bytes, {
      op: 'set_image_opacity',
      target: await target(bytes),
      alpha: 0.5,
    })
    bytes = result.bytes!
    const secondAlpha = await pageRaster(bytes)
    const color = (image: typeof firstAlpha) => {
      const at = (Math.floor(image.height / 2) * image.width + Math.floor(image.width / 4)) * 4
      return Math.min(...image.data.slice(at, at + 3))
    }
    expect(color(firstAlpha)).toBeGreaterThan(120)
    expect(color(firstAlpha)).toBeLessThan(135)
    expect(color(secondAlpha)).toBe(color(firstAlpha))
    expect(color(beforeAlpha)).toBe(0)
    const footprint = (await readPdfImages(bytes)).images[0]!
    result = await applyPdfImageOperation(bytes, {
      op: 'crop_image',
      target: await target(bytes),
      left: 0.1,
      top: 0.2,
      right: 0.1,
      bottom: 0.2,
    })
    bytes = result.bytes!
    expect(result.images.images[0]!.width).toBeCloseTo(footprint.width * 0.8, 1)
    expect(result.images.images[0]!.height).toBeCloseTo(footprint.height * 0.6, 1)
    result = await applyPdfImageOperation(bytes, {
      op: 'remove_image_background',
      target: await target(bytes),
      tolerance: 0,
    })
    bytes = result.bytes!
    result = await applyPdfImageOperation(bytes, {
      op: 'replace_image',
      target: await target(bytes),
      image: encodePdfPng(pixels(128)).toString('base64'),
    })
    bytes = result.bytes!
    result = await applyPdfImageOperation(bytes, {
      op: 'delete_image',
      target: await target(bytes),
    })
    bytes = result.bytes!
    expect(result.images.images).toEqual([])
    expect(original).not.toEqual(bytes)
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const task = getDocument({ data: bytes.slice() })
    try {
      expect((await (await (await task.promise).getPage(1)).getTextContent()).items).toEqual(
        expect.arrayContaining([expect.objectContaining({ str: 'KEEP ORIGINAL' })]),
      )
    } finally {
      await task.destroy()
    }
  })
  it('flips intrinsic pixels and trims the selected displayed side', async () => {
    let bytes = await fixture()
    const first = await raster(bytes)
    expect(first.data[0]).toBeGreaterThan(240)
    bytes = (
      await applyPdfImageOperation(bytes, {
        op: 'flip_image',
        target: await target(bytes),
        axis: 'horizontal',
      })
    ).bytes!
    const flipped = await raster(bytes)
    expect(flipped.data[2]).toBeGreaterThan(240)
    expect(flipped.data[0]).toBeLessThan(10)
    bytes = (
      await applyPdfImageOperation(bytes, {
        op: 'crop_image',
        target: await target(bytes),
        left: 0,
        top: 0,
        right: 0.5,
        bottom: 0,
      })
    ).bytes!
    const cropped = await raster(bytes)
    expect(cropped.data[cropped.data.length - 2]).toBeGreaterThan(240)
  })
  it('preserves colored half-transparent pixels during actual image baking', async () => {
    const pdf = await PDFDocument.create(),
      page = pdf.addPage([200, 200])
    const png = encodePdfPng({
      width: 2,
      height: 2,
      data: new Uint8ClampedArray([
        220, 45, 40, 128, 220, 45, 40, 128, 220, 45, 40, 128, 220, 45, 40, 128,
      ]),
    })
    page.drawImage(await pdf.embedPng(png), { x: 40, y: 80, width: 80, height: 80 })
    const bytes = await pdf.save(),
      before = await pageRaster(bytes)
    const result = await applyPdfImageOperation(bytes, {
      op: 'flip_image',
      target: await target(bytes),
      axis: 'horizontal',
    })
    const after = await pageRaster(result.bytes!)
    const center = (image: typeof before) =>
      Array.from(
        image.data.slice(
          (Math.floor(image.height / 2) * image.width + Math.floor(image.width / 2)) * 4,
          (Math.floor(image.height / 2) * image.width + Math.floor(image.width / 2)) * 4 + 4,
        ),
      )
    for (const [at, value] of center(before).entries())
      expect(center(after)[at]).toBeCloseTo(value, -1)
    expect(center(after)[0]).toBeGreaterThan(230)
    expect(center(after)[1]).toBeLessThan(160)
  })
  it('restores zero opacity to one and preserves opacity through JPEG replacement and crop', async () => {
    let bytes = await fixture()
    for (const alpha of [0, 1, 0.5]) {
      const changed = await applyPdfImageOperation(bytes, {
        op: 'set_image_opacity',
        target: await target(bytes),
        alpha,
      })
      bytes = changed.bytes!
      expect(changed.images.images[0]!.opacity).toBe(alpha)
      const rendered = await pageRaster(bytes)
      const at =
        (Math.floor(rendered.height / 2) * rendered.width + Math.floor(rendered.width / 4)) * 4
      const minimum = Math.min(...rendered.data.slice(at, at + 3))
      expect(minimum).toBeCloseTo(Math.round(255 * (1 - alpha)), -1)
    }
    const jpegBytes = jpeg.encode(
      { width: 20, height: 10, data: Buffer.from(pixels().data) },
      95,
    ).data
    let result = await applyPdfImageOperation(bytes, {
      op: 'replace_image',
      target: await target(bytes),
      image: jpegBytes.toString('base64'),
    })
    bytes = result.bytes!
    expect(result.images.images[0]!.opacity).toBe(0.5)
    result = await applyPdfImageOperation(bytes, {
      op: 'crop_image',
      target: await target(bytes),
      left: 0,
      top: 0,
      right: 0.5,
      bottom: 0,
    })
    expect(result.images.images[0]!.opacity).toBe(0.5)
    expect((await pageRaster(result.bytes!)).data.some((value) => value === 128)).toBe(true)
  })
  it('inserts real transparent PNG and JPEG bytes with displayed page rotation and preserves two saves', async () => {
    const pdf = await PDFDocument.create()
    const page = pdf.addPage([300, 400])
    page.setRotation((await import('pdf-lib')).degrees(90))
    let bytes = await pdf.save()
    let result = await applyPdfImageOperation(bytes, {
      op: 'insert_image',
      pageIndex: 0,
      image: encodePdfPng(pixels(128)).toString('base64'),
      x: 40,
      y: 50,
      width: 80,
    })
    bytes = result.bytes!
    expect(result.images.images[0]).toMatchObject({ x: 40, y: 50, width: 80, height: 40 })
    const jpegBytes = jpeg.encode(
      { width: 20, height: 10, data: Buffer.from(pixels().data) },
      90,
    ).data
    const secondImage = await applyPdfImageOperation(bytes, {
      op: 'insert_image',
      pageIndex: 0,
      image: jpegBytes.toString('base64'),
      x: 200,
      y: 50,
      width: 80,
    })
    bytes = secondImage.bytes!
    expect(secondImage.images.images).toHaveLength(2)
    const first = await PDFDocument.load(bytes)
    const saved = await first.save()
    result = await applyPdfImageOperation(saved, {
      op: 'transform_image',
      target: await target(saved),
      x: 70,
      y: 80,
      height: 60,
    })
    bytes = result.bytes!
    const second = await PDFDocument.load(bytes)
    const reopened = await second.save()
    expect((await readPdfImages(reopened)).images[0]).toMatchObject({
      x: 70,
      y: 80,
      width: 120,
      height: 60,
    })
  })
})
