import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { openPptx, savePptx } from '../../vendor/packages/pptx-engine/src/index.js'
import { runTxn, type Op } from '../../vendor/packages/pptx-ops/src/ops/index.js'
import { openPptxForEdit } from '../pptx.js'
import { createPptxAgentHandle, type PptxHostApply } from './pptx-agent.js'
import { compilePptxSlideScript, auditPptxSlide } from './pptx-script.js'
const load = () =>
  new Uint8Array(readFileSync(new URL('../../tests/fixtures/title-layout.pptx', import.meta.url)))
const host: PptxHostApply = async ({ bytes, expectedVersion, ops }) => {
  const file = await openPptx(bytes)
  const result = runTxn(file, { ops: ops as Op[], isolation: 'atomic' })
  if (!result.applied) throw new Error(result.failures?.[0]?.error ?? '失败')
  return {
    bytes: await savePptx(file),
    version: expectedVersion + 1,
    records: result.records ?? [],
  }
}
describe('fixed PPTX bounded edit script', () => {
  it('audits live post-edit geometry and rejects late service results after edits or cancellation', async () => {
    const session = await openPptxForEdit(load())
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let entered!: () => void
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    const handle = createPptxAgentHandle(
      session,
      'doc',
      () => ({ slideIndex: 0, elementId: null }),
      () => {},
      async ({ bytes, expectedVersion }) => {
        entered()
        await gate
        return { bytes, version: expectedVersion + 1, records: [], changed: true }
      },
    )
    const pending = handle.execute('generate_deck', { topic: '测试' }, {})
    await started
    const element = session.slides()[0]!.elements.find((el) => el.type === 'text')!
    session.setText(0, element.id, [{ runs: [{ text: '人工编辑' }] }])
    release()
    expect(await pending).toMatchObject({
      ok: false,
      changed: false,
      error: expect.stringContaining('画布已变化'),
    })
    expect(JSON.stringify(auditPptxSlide(session, 0))).not.toContain('NaN')
    const scripted = createPptxAgentHandle(
      session,
      'doc',
      () => ({ slideIndex: 0, elementId: null }),
      () => {},
      host,
    )
    const moved = await scripted.execute(
      'execute_slide_script',
      { slideIndex: 0, code: 'moveBy(els.find(e=>e.type==="text").id,-2000,0)' },
      {},
    )
    expect(moved).toMatchObject({
      ok: true,
      changed: true,
      data: {
        layoutAudit: {
          passed: false,
          findings: expect.arrayContaining([expect.objectContaining({ code: 'out_of_bounds' })]),
        },
      },
    })
    const controller = new AbortController()
    controller.abort()
    expect(
      await handle.execute('generate_deck', { topic: '取消' }, { signal: controller.signal }),
    ).toMatchObject({ ok: false, changed: false })
  })
  it('computes from live geometry and atomically saves geometry, text and style twice', async () => {
    const bytes = load(),
      session = await openPptxForEdit(bytes)
    const handle = createPptxAgentHandle(
      session,
      'doc',
      () => ({ slideIndex: 0, elementId: null }),
      () => {},
      host,
    )
    const first = compilePptxSlideScript(session, 0, 'return 1').elements.find(
      (el) => el.type === 'text',
    )!
    const code = `const e=els.find(e=>e.id===${JSON.stringify(first.id)}); moveBy(e.id,12,8); setText(e.id,"脚本中文正文"); setStyle(e.id,{bold:true,color:"#245A9B",fontSize:30}); return e.x;`
    expect(
      await handle.execute(
        'execute_slide_script',
        { slideIndex: 0, code },
        { roundId: 'one', expectedVersion: 0 },
      ),
    ).toMatchObject({ ok: true, changed: true })
    const firstBytes = await session.save()
    session.commit()
    const changed = compilePptxSlideScript(session, 0, 'return 1').elements.find((el) =>
      el.text.includes('脚本中文正文'),
    )!
    expect(changed.x).toBeCloseTo(first.x + 12, 1)
    expect(changed.y).toBeCloseTo(first.y + 8, 1)
    expect(changed.textColor).toBe('#245A9B')
    expect(
      await handle.execute(
        'execute_slide_script',
        {
          slideIndex: 0,
          code: 'els.filter(e=>e.text.includes("脚本中文正文")).forEach(e=>moveBy(e.id,3,0))',
        },
        { expectedVersion: session.version() },
      ),
    ).toMatchObject({ ok: true })
    const secondBytes = await session.save(),
      reopened = await openPptxForEdit(secondBytes)
    expect(
      compilePptxSlideScript(reopened, 0, 'return 1').elements.find((el) =>
        el.text.includes('脚本中文正文'),
      )!.x,
    ).toBeCloseTo(first.x + 15, 1)
    const zip = await JSZip.loadAsync(secondBytes),
      original = await JSZip.loadAsync(bytes)
    const xml = await zip.file('ppt/slides/slide1.xml')!.async('string')
    expect(xml).toContain('b="1"')
    expect(xml).toContain('sz="3000"')
    expect(await zip.file('ppt/theme/theme1.xml')!.async('uint8array')).toEqual(
      await original.file('ppt/theme/theme1.xml')!.async('uint8array'),
    )
    expect(
      (await openPptx(firstBytes)).deck.slides[0]!.elements.some((el) =>
        el.anchor.originalXml.includes('脚本中文正文'),
      ),
    ).toBe(true)
  })
  it('blocks ambient APIs, runaway loops, prototype access and invalid batches before applying', async () => {
    const session = await openPptxForEdit(load())
    const handle = createPptxAgentHandle(
      session,
      'doc',
      () => ({ slideIndex: 0, elementId: null }),
      () => {},
      host,
    )
    for (const code of [
      'fetch("https://example.com")',
      'while(true){}',
      'return els.constructor.constructor("return process")()',
      'setText(els[0].id,"temporary"); setFill("missing","#000000")',
    ])
      expect(
        await handle.execute('execute_slide_script', { slideIndex: 0, code }, {}),
      ).toMatchObject({ ok: false, changed: false, version: 0 })
    expect(
      await handle.execute(
        'execute_slide_script',
        { slideIndex: 0, code: 'log("查看"); return canvas.w' },
        {},
      ),
    ).toMatchObject({ ok: true, changed: false, version: 0 })
  })
  it('keeps planning and template reads independent of canvas versions', async () => {
    const session = await openPptxForEdit(load())
    const handle = createPptxAgentHandle(
      session,
      'doc',
      () => ({ slideIndex: 0, elementId: null }),
      () => {},
      async () => ({ bytes: load(), version: 0, records: [], changed: false, data: {} }),
    )
    expect(await handle.execute('list_style_templates', {}, {})).toMatchObject({
      ok: true,
      changed: false,
      version: 0,
    })
    expect(await handle.execute('save_style_template', { name: '蓝色' }, {})).toMatchObject({
      ok: false,
    })
    expect(
      await handle.execute(
        'plan_deck',
        {
          core_hook: '主线',
          style: '蓝白',
          pages: [{ title: '标题', brief: '内容', layout: 'two_column' }],
        },
        {},
      ),
    ).toMatchObject({ ok: true, changed: false })
    expect(await handle.execute('save_style_template', { name: '蓝色' }, {})).toMatchObject({
      ok: true,
      changed: false,
    })
  })
})
