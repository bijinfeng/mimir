// @vitest-environment node
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { copyPdfOcrAssets } from '../../vite-preset.js'

describe('offline PDF OCR assets', () => {
  it('copies the real portable core, two local language files and original notices without duplicate embedded WASM', async () => {
    const target = await mkdtemp(join(tmpdir(), 'mimir-ocr-assets-test-'))
    try {
      const hook = copyPdfOcrAssets(target).buildStart
      if (typeof hook !== 'function') throw new Error('Asset hook missing')
      const context = { info() {} } as unknown as ThisParameterType<typeof hook>
      await hook.call(context, {} as Parameters<typeof hook>[0])
      const files = await readdir(join(target, 'pdf-ocr'))
      expect(files.toSorted()).toEqual([
        'LICENSE-tessdata-Apache-2.0.txt',
        'LICENSE-tesseract.js-core.txt',
        'LICENSE-tesseract.js.txt',
        'NOTICE-chi_sim.txt',
        'NOTICE-eng.txt',
        'lang',
        'tesseract-core-lstm.js',
        'tesseract-core-lstm.wasm',
        'worker.min.js',
      ])
      expect(
        Array.from(
          (await readFile(join(target, 'pdf-ocr/tesseract-core-lstm.wasm'))).subarray(0, 4),
        ),
      ).toEqual([0, 97, 115, 109])
      for (const lang of ['eng', 'chi_sim']) {
        const bytes = await readFile(join(target, `pdf-ocr/lang/${lang}.traineddata.gz`))
        expect(Array.from(bytes.subarray(0, 2))).toEqual([0x1f, 0x8b])
        expect(bytes.length).toBeGreaterThan(1_000_000)
        const notice = await readFile(join(target, `pdf-ocr/NOTICE-${lang}.txt`), 'utf8')
        expect(notice).toContain(`@tesseract.js-data/${lang}`)
        expect(notice).toContain('1.0.0')
      }
      expect(
        await readFile(join(target, 'pdf-ocr/LICENSE-tessdata-Apache-2.0.txt'), 'utf8'),
      ).toContain('Apache License')
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })
})
