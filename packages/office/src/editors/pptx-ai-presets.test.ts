import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { createPptxAgentHandle } from '../agent/pptx-agent.js'
import { editableElements, openPptxForEdit } from '../pptx.js'
import { PPTX_AI_LANGUAGES, pptxAiPresetInstruction, validPptxAiTarget } from './pptx-ai-presets.js'

const target = { documentId: 'doc', slidePath: 'ppt/slides/slide1.xml', slideIndex: 0, version: 0 }
it('keeps exact fixed-upstream language coverage and declares deck/page scope without fake screenshots', () => {
  expect(PPTX_AI_LANGUAGES).toEqual([
    '英语',
    '简体中文',
    '繁体中文',
    '日语',
    '韩语',
    '法语',
    '德语',
    '西班牙语',
  ])
  expect(pptxAiPresetInstruction('spelling', target)).toContain('检查范围为整个演示文稿')
  expect(pptxAiPresetInstruction('fact-check', target)).toContain('检查范围为整个演示文稿')
  expect(pptxAiPresetInstruction('beautify', target)).toContain('请处理准备指令时的第 1 页')
  expect(pptxAiPresetInstruction('translate', target, '英语')).toContain('无法确认目标时停止修改')
  expect(() => pptxAiPresetInstruction('translate', target)).toThrow('翻译语言')
})
it.each([
  { documentId: '' },
  { slidePath: '../slide1.xml' },
  { slidePath: 'ppt/slides/slide0.xml' },
  { slideIndex: -1 },
  { slideIndex: 0.5 },
  { version: -1 },
  { version: NaN },
])('rejects incomplete or stale target metadata %j', (bad) => {
  const input = { ...target, ...bad }
  expect(validPptxAiTarget(input)).toBe(false)
  expect(() => pptxAiPresetInstruction('beautify', input)).toThrow('幻灯片')
})
it('the concise page marker can locate a reordered page and read actual unsaved text using an integer', async () => {
  const bytes = new Uint8Array(
    readFileSync(new URL('../../tests/fixtures/title-layout.pptx', import.meta.url)),
  )
  const session = await openPptxForEdit(bytes)
  const element = editableElements(session.slides()[0]!)[0]!
  expect(
    session.setText(0, element.id, [
      { srcPara: 0, runs: [{ srcRun: 0, text: '尚未保存的校对文字' }] },
    ]),
  ).toBe(true)
  const handle = createPptxAgentHandle(
    session,
    'doc',
    () => ({ slideIndex: 0, elementId: element.id }),
    () => {},
  )
  const context = { ...target, slidePath: session.slides()[0]!.path, version: session.version() }
  const instruction = pptxAiPresetInstruction('spelling', context)
  const pageMarker = instruction.match(/页面标识：(s_\d+)/)![1]!
  session.insertBlank(0)
  session.move(0, 1)
  const current = handle.getContext() as { slides: { id: string; index: number }[] }
  const index = current.slides.find((slide) => slide.id === pageMarker)!.index
  expect(index).toBe(1)
  const version = session.version()
  const result = await handle.execute('read_slide', { slide: index }, { expectedVersion: version })
  expect(result).toMatchObject({ ok: true, changed: false, data: { path: context.slidePath } })
  expect(JSON.stringify(result)).toContain('尚未保存的校对文字')
  expect(session.version()).toBe(version)
  handle.dispose()
})
