# Temporary system-font diagnostic

This diagnostic was temporarily run at `packages/office/src/ci-font-probe.test.ts`, then removed. Mocking only the system font index and OS fallback paths allows actual downloaded Ubuntu TTC bytes to flow through the locked vendor extraction and native PDFium layout. The absent-font run must reject; the Ubuntu TTC run must wrap successfully. No product or existing test assertion was changed.

```typescript
import { PDFDocument } from 'pdf-lib'
import { expect, it, vi } from 'vitest'

const probe = vi.hoisted(() => ({ file: process.env.MIMIR_CI_FONT_PROBE_FILE }))
vi.mock('node:fs', async () => {
  const fs = await vi.importActual<typeof import('node:fs')>('node:fs')
  return { ...fs, readFileSync: (...args: Parameters<typeof fs.readFileSync>) => {
    if (String(args[0]) !== probe.file && (String(args[0]).includes('/System/Library/Fonts/') || String(args[0]).includes('/usr/share/fonts/') || String(args[0]).includes('Windows\\\\Fonts'))) throw new Error('diagnostic: OS font absent')
    return fs.readFileSync(...args)
  } }
})
vi.mock('../vendor/packages/font-metrics/src/sfnt.ts', async () => {
  const sfnt = await vi.importActual<typeof import('../vendor/packages/font-metrics/src/sfnt.ts')>('../vendor/packages/font-metrics/src/sfnt.ts')
  const fs = await vi.importActual<typeof import('node:fs')>('node:fs')
  const face = probe.file ? { path: probe.file, offset: fs.readFileSync(probe.file).readUInt32BE(20), names: { ps: ['NotoSansCJKsc-Regular'], families: ['Noto Sans CJK SC'], subfamilies: ['Regular'] } } : undefined
  return { ...sfnt, getFontIndex: () => ({ byPs: new Map(face ? [['notosanscjkscregular', face]] : []), byFamily: new Map(face ? [['notosanscjksc', [face]]] : []) }) }
})
it('diagnoses the exact CJK native layout with an empty system index or actual Ubuntu Noto TTC', async () => {
  const { layoutPdfTextInsert } = await import('../../../apps/server/src/services/pdf-insert-layout.ts')
  const pdf = await PDFDocument.create()
  pdf.addPage([500, 600])
  const operation = layoutPdfTextInsert(await pdf.save(), { pageIndex: 0, text: '第一段中文用于真实字体换行和保存测试 English one', maxWidth: 150, align: 'right', font: 'times', bold: true, italic: true, fontSize: 16, color: [0.07,0.2,0.33] })
  if (!probe.file) {
    await expect(operation).rejects.toThrow('no available font can draw')
    console.log('CONFIRMED: missing installed CJK sfnt rejects real insertion: no available font can draw')
  } else {
    const layout = await operation
    expect(layout.wrappedText).toContain('\n')
    expect(layout.width).toBe(150)
    console.log('CONFIRMED: Ubuntu Noto TTC extracts and embeds in PDFium, native layout=', JSON.stringify(layout))
  }
})
```
