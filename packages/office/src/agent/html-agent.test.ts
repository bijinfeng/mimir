import { describe, expect, it } from 'vitest'
import {
  HtmlAgentHandle,
  HTML_OP_NAMES,
  type HtmlAgentHooks,
  type HtmlBriefDecision,
} from './html-agent.js'
import { readHtmlBrief } from './html-brief.js'
import type { Patch } from '../../vendor/apps/html/src/renderer/document/patch.js'

function setup(
  source = '<!doctype html>\n<html><body><main><p id="a">Hello &amp; world</p><p>Second</p></main></body></html>',
  services: Partial<HtmlAgentHooks> = {},
) {
  let canvas = source
  let selected: number | null = null
  const handle = new HtmlAgentHandle('html-1', source, {
    applyPatches: (patches: Patch[]) => {
      for (const patch of patches.toSorted((a, b) => b.from - a.from))
        canvas = canvas.slice(0, patch.from) + patch.text + canvas.slice(patch.to)
    },
    replaceDoc: (text) => {
      canvas = text
    },
    onDocument: () => {},
    getSelectedSid: () => selected,
    ...services,
  })
  const sid = (tag: string, nth = 0) =>
    handle.getDocument().map.elements.filter((entry) => entry.tag === tag)[nth]!.sid
  return {
    handle,
    sid,
    getCanvas: () => canvas,
    select: (value: number) => {
      selected = value
    },
  }
}

describe('HTML live canvas and GenOffice operation compiler', () => {
  it('passes structured multi-choice answers through without editing source or advancing version', async () => {
    const response = { answers: '内容: 介绍、联系', selections: { parts: ['介绍', '联系'] } }
    const { handle, getCanvas } = setup(undefined, { askClarification: async () => response })
    const before = getCanvas()
    const version = handle.getVersion()
    expect(
      await handle.execute('ask_clarification', {
        questions: [{ id: 'parts', label: '内容', multi: true, options: ['介绍', '联系'] }],
      }),
    ).toMatchObject({ ok: true, changed: false, data: response })
    expect(getCanvas()).toBe(before)
    expect(handle.getVersion()).toBe(version)
  })

  it('rejects ambiguous questions before opening the user prompt', async () => {
    let opened = 0
    const { handle } = setup(undefined, {
      askClarification: async () => {
        opened++
        return { answers: '' }
      },
    })
    const question = { id: 'parts', label: '内容', options: ['介绍', '联系'] }
    for (const questions of [
      [{ ...question, multi: 'true' }],
      [question, question],
      [{ ...question, options: ['介绍', '介绍'] }],
      [{ ...question, description: { text: 'invalid child' } }],
    ]) {
      expect(await handle.execute('ask_clarification', { questions })).toMatchObject({
        ok: false,
        changed: false,
        error: '问题格式无效。',
      })
    }
    expect(opened).toBe(0)
  })

  it.each(['stop', 'manual'])(
    'rejects a late clarification answer after %s without returning success',
    async (change) => {
      let finish!: (answer: { answers: string }) => void
      const controller = new AbortController()
      const { handle } = setup(undefined, {
        askClarification: (_questions, signal) => {
          expect(signal).toBe(controller.signal)
          return new Promise((resolve) => {
            finish = resolve
          })
        },
      })
      const pending = handle.execute(
        'ask_clarification',
        { questions: [{ id: 'content', label: '内容', options: ['正文'] }] },
        { signal: controller.signal },
      )
      if (change === 'stop') controller.abort()
      else handle.setManualText('<html><body>新的人工正文</body></html>')
      const current = handle.getDocument()
      finish({ answers: '内容：正文' })
      expect(await pending).toMatchObject({ ok: false, changed: false })
      expect(handle.getDocument()).toBe(current)
    },
  )

  it.each(['new', 'restyle', 'extract'])(
    'does not continue %s planning after stop or a manual version change during confirmation',
    async (mode) => {
      for (const change of ['stop', 'manual']) {
        const brief = {
          title: '提纲',
          tone: '简洁',
          audience: '读者',
          sections: [{ title: '正文', purpose: '说明' }],
        }
        let finish!: (answer: typeof brief) => void
        let writes = 0
        const controller = new AbortController()
        const { handle } = setup(undefined, {
          planPage: async () => brief,
          confirmBrief: (_brief, _mode, signal) => {
            expect(signal).toBe(controller.signal)
            return new Promise((resolve) => {
              finish = resolve
            })
          },
          writeDocument: async () => {
            writes++
            return { html: '<html><body>不应写入</body></html>', complete: true }
          },
        })
        const pending = handle.execute(
          'plan_page',
          { mode, instruction: '创建页面' },
          { signal: controller.signal },
        )
        await Promise.resolve()
        if (change === 'stop') controller.abort()
        else handle.setManualText('<html><body>新的人工正文</body></html>')
        const current = handle.getDocument()
        finish(brief)
        expect(await pending).toMatchObject({ ok: false, changed: false })
        expect(writes).toBe(0)
        expect(handle.getDocument()).toBe(current)
      }
    },
  )

  it('does not open confirmation after a stopped planning service returns late', async () => {
    const brief = {
      title: '提纲',
      tone: '简洁',
      audience: '读者',
      sections: [{ title: '正文', purpose: '说明' }],
    }
    let finish!: (answer: typeof brief) => void
    let confirmations = 0
    const controller = new AbortController()
    const { handle } = setup(undefined, {
      planPage: () =>
        new Promise((resolve) => {
          finish = resolve
        }),
      confirmBrief: async () => {
        confirmations++
        return brief
      },
    })
    const pending = handle.execute(
      'plan_page',
      { mode: 'new', instruction: '创建页面' },
      { signal: controller.signal },
    )
    controller.abort()
    finish(brief)
    expect(await pending).toMatchObject({ ok: false, changed: false })
    expect(confirmations).toBe(0)
  })

  it('reads unsaved source and rejects stale versions after typing', async () => {
    const { handle } = setup()
    const before = handle.getVersion()
    handle.setManualText('<main>Changed by user</main>')
    expect((await handle.execute('read_source', {})).data).toMatchObject({
      source: expect.stringContaining('Changed by user'),
    })
    expect(
      (
        await handle.execute(
          'apply_ops',
          { ops: [{ op: 'str_replace', old: 'Changed', new: 'Overwritten' }] },
          { expectedVersion: before },
        )
      ).ok,
    ).toBe(false)
    expect(handle.getDocument().text).toContain('Changed by user')
  })

  it('rejects a batch atomically when a later sid fails', () => {
    const { handle, sid, getCanvas } = setup()
    const source = getCanvas()
    const result = handle.applyOps([
      { op: 'set_text', sid: sid('p'), text: 'Changed' },
      { op: 'remove', sid: 99999 },
    ])
    expect(result.ok).toBe(false)
    expect(getCanvas()).toBe(source)
    expect(handle.getVersion()).toBe(1)
  })

  it('applies all 13 manual operation kinds through one source path', () => {
    const samples = [
      (sid: ReturnType<ReturnType<typeof setup>['sid']>, s: ReturnType<typeof setup>['sid']) => ({
        op: 'str_replace',
        old: 'Second',
        new: 'Another',
        sid: s('p', 1),
      }),
      (_sid: number, s: ReturnType<typeof setup>['sid']) => ({
        op: 'replace_element',
        sid: s('p'),
        html: '<p>New</p>',
      }),
      (_sid: number, s: ReturnType<typeof setup>['sid']) => ({
        op: 'set_inner_html',
        sid: s('p'),
        html: '<b>Bold</b>',
      }),
      (_sid: number, s: ReturnType<typeof setup>['sid']) => ({
        op: 'set_text',
        sid: s('p'),
        text: '<safe>',
      }),
      (_sid: number, s: ReturnType<typeof setup>['sid']) => ({
        op: 'insert_html',
        sid: s('main'),
        position: 'append',
        html: '<p>Third</p>',
      }),
      (_sid: number, s: ReturnType<typeof setup>['sid']) => ({ op: 'remove', sid: s('p', 1) }),
      (_sid: number, s: ReturnType<typeof setup>['sid']) => ({
        op: 'move',
        sid: s('p', 1),
        ref_sid: s('p'),
        position: 'before',
      }),
      (_sid: number, s: ReturnType<typeof setup>['sid']) => ({
        op: 'set_attr',
        sid: s('p'),
        name: 'title',
        value: 'Test',
      }),
      (_sid: number, s: ReturnType<typeof setup>['sid']) => ({
        op: 'set_style',
        sid: s('p'),
        styles: { color: 'red' },
      }),
      (_sid: number, s: ReturnType<typeof setup>['sid']) => ({
        op: 'set_tag',
        sid: s('p'),
        tag: 'div',
      }),
      (_sid: number, s: ReturnType<typeof setup>['sid']) => ({
        op: 'set_text_node',
        sid: s('p'),
        index: 0,
        text: 'Safe',
      }),
      (_sid: number, s: ReturnType<typeof setup>['sid']) => ({
        op: 'wrap_text',
        sid: s('p'),
        index: 0,
        start: 0,
        end: 5,
        tag: 'strong',
      }),
      (_sid: number, s: ReturnType<typeof setup>['sid']) => ({ op: 'unwrap', sid: s('p') }),
    ]
    expect(samples).toHaveLength(HTML_OP_NAMES.length)
    for (let i = 0; i < samples.length; i++) {
      const { handle, sid, getCanvas } = setup()
      const op = samples[i]!(sid('main'), sid)
      expect(op.op).toBe(HTML_OP_NAMES[i])
      const result = handle.applyOps([op])
      expect(result).toMatchObject({ ok: true, changed: true })
      expect(getCanvas()).toBe(handle.getDocument().text)
    }
  })

  it('restores a completed AI round only while its version is current', async () => {
    const { handle, getCanvas } = setup()
    const original = getCanvas()
    expect(
      (
        await handle.execute(
          'apply_ops',
          { ops: [{ op: 'str_replace', old: 'Second', new: 'AI' }] },
          { roundId: 'r1' },
        )
      ).ok,
    ).toBe(true)
    expect(handle.undoRound('r1')).toBe(true)
    expect(getCanvas()).toBe(original)
    await handle.execute(
      'apply_ops',
      { ops: [{ op: 'str_replace', old: 'Second', new: 'AI' }] },
      { roundId: 'r2' },
    )
    handle.setManualText(getCanvas().replace('Hello', 'User'))
    expect(handle.undoRound('r2')).toBe(false)
  })

  it('waits for user answers and a confirmed brief before replacing a page', async () => {
    const brief = {
      title: 'Page',
      tone: 'quiet',
      audience: 'readers',
      sections: [{ title: 'Intro', purpose: 'explain' }],
    }
    const generated =
      '<!doctype html><html><head><title>Page</title></head><body><main>New page</main></body></html>'
    const calls: string[] = []
    const { handle, getCanvas } = setup(undefined, {
      askClarification: async () => {
        calls.push('questions')
        return { answers: 'Audience: readers' }
      },
      planPage: async () => {
        calls.push('plan')
        return brief
      },
      confirmBrief: async () => {
        calls.push('confirm')
        return brief
      },
      writeDocument: async () => {
        calls.push('write')
        return { html: generated, complete: true }
      },
    })
    expect(
      (
        await handle.execute('ask_clarification', {
          questions: [{ id: 'audience', label: 'Audience', options: ['readers'] }],
        })
      ).data,
    ).toEqual({ answers: 'Audience: readers' })
    const before = getCanvas()
    const result = await handle.execute(
      'plan_page',
      { mode: 'new', instruction: 'Build a quiet reading page' },
      { roundId: 'page-round' },
    )
    expect(result).toMatchObject({ ok: true, changed: true })
    expect(calls).toEqual(['questions', 'plan', 'confirm', 'write'])
    expect(getCanvas()).toContain('<body><main>New page</main></body>')
    expect(readHtmlBrief(getCanvas())).toMatchObject(brief)
    expect(handle.getContext()).toMatchObject({
      brief: expect.objectContaining({ title: brief.title }),
    })
    expect(handle.undoRound('page-round')).toBe(true)
    expect(getCanvas()).toBe(before)
  })

  it('keeps incomplete generated pages and stale drafts out of the canvas', async () => {
    const { handle, getCanvas } = setup(undefined, {
      writeDocument: async () => ({ html: '<html><body>Partial', complete: true }),
    })
    const before = getCanvas()
    const failed = await handle.execute(
      'write_document',
      { plan: 'Long guide' },
      { roundId: 'write-1' },
    )
    expect(failed).toMatchObject({ ok: false, changed: false })
    expect(getCanvas()).toBe(before)
    handle.beginDraft('stale')
    handle.appendDraft('stale', '<!doctype html><html><body>Ready</body></html>')
    handle.setManualText(before.replace('Second', 'Human'))
    expect(await handle.commitDraft('stale')).toMatchObject({ ok: false, changed: false })
    expect(getCanvas()).toBe(before)
  })
})

it.each(['restyle', 'extract'])(
  'pins %s metadata in one reversible mutation without rewriting visible content',
  async (mode) => {
    const source =
      '<!doctype html><html><head><style>p{color:red}</style><script>const x=1</script></head><body><p>保留原文</p></body></html>'
    const brief = {
      title: '设计',
      tone: '安静',
      audience: '读者',
      sections: [{ title: '正文', purpose: '说明' }],
    }
    let writes = 0
    const { handle, getCanvas } = setup(source, {
      planPage: async () => brief,
      confirmBrief: async (value) => ({ kind: 'confirmed', brief: value }),
      writeDocument: async () => {
        writes++
        return { html: '', complete: true }
      },
    })
    const version = handle.getVersion()
    const result = await handle.execute(
      'plan_page',
      { mode, instruction: '规划' },
      { roundId: 'pin' },
    )
    expect(result).toMatchObject({ ok: true, changed: true, data: { pinned: true } })
    expect(writes).toBe(0)
    expect(getCanvas()).toContain(
      '<style>p{color:red}</style><script>const x=1</script></head><body><p>保留原文</p></body>',
    )
    expect(readHtmlBrief(getCanvas())).toMatchObject(brief)
    expect(handle.getVersion()).toBe(version + 1)
    expect(handle.undoRound('pin')).toBe(true)
    expect(getCanvas()).toBe(source)
  },
)

it('replans only after the explicit redo decision and carries its note before a final pin', async () => {
  const original = '<html><body>原文</body></html>'
  const brief = {
    title: '设计',
    tone: '安静',
    audience: '读者',
    sections: [{ title: '正文', purpose: '说明' }],
  }
  const notes: Array<string | undefined> = []
  let confirmations = 0
  const { handle, getCanvas } = setup(original, {
    planPage: async (request) => {
      notes.push(request.notes)
      return brief
    },
    confirmBrief: async (value) => {
      expect(getCanvas()).toBe(original)
      return ++confirmations === 1
        ? { kind: 'redo', note: '更紧凑，保留中文' }
        : { kind: 'confirmed', brief: value }
    },
  })
  expect(await handle.execute('plan_page', { mode: 'extract', instruction: '规划' })).toMatchObject(
    { ok: true, changed: true },
  )
  expect(notes).toHaveLength(2)
  expect(notes[1]).toContain('更紧凑，保留中文')
  expect(readHtmlBrief(getCanvas())).toMatchObject(brief)
})

it.each(['confirm', 'stop', 'manual'])(
  'prioritizes redo notes and waits for the next confirmation before %s',
  async (completion) => {
    const original = '<html><body>原文</body></html>'
    const brief = {
      title: '设计',
      tone: '安静',
      audience: '读者',
      sections: [{ title: '正文', purpose: '说明' }],
    }
    const notes: Array<string | undefined> = []
    let decide!: (decision: HtmlBriefDecision) => void
    let opened!: () => void
    const secondOpened = new Promise<void>((resolve) => {
      opened = resolve
    })
    const controller = new AbortController()
    const { handle, getCanvas } = setup(original, {
      planPage: async (request) => {
        notes.push(request.notes)
        return brief
      },
      confirmBrief: () =>
        new Promise<HtmlBriefDecision>((resolve) => {
          decide = resolve
          if (notes.length === 2) opened()
        }),
    })
    const pending = handle.execute(
      'plan_page',
      {
        mode: 'extract',
        instruction: '规划',
        notes: '原'.repeat(2000),
      },
      { signal: controller.signal, roundId: 'redo-wait' },
    )
    await Promise.resolve()
    expect(notes).toHaveLength(1)
    expect(getCanvas()).toBe(original)
    decide({ kind: 'redo', note: '减少留白，保留中文' })
    await secondOpened
    expect(notes[1]).toContain('减少留白，保留中文')
    expect(notes[1]!.length).toBeLessThanOrEqual(2000)
    expect(getCanvas()).toBe(original)
    expect(handle.getVersion()).toBe(1)
    if (completion === 'stop') controller.abort()
    if (completion === 'manual') handle.setManualText('<html><body>人工编辑</body></html>')
    decide({ kind: 'confirmed', brief })
    expect(await pending).toMatchObject({
      ok: completion === 'confirm',
      changed: completion === 'confirm',
    })
    expect(handle.getVersion()).toBe(completion === 'stop' ? 1 : 2)
    expect(readHtmlBrief(getCanvas())?.title ?? null).toBe(
      completion === 'confirm' ? brief.title : null,
    )
    expect(handle.undoRound('redo-wait')).toBe(completion === 'confirm')
    expect(getCanvas()).toBe(original)
    expect(handle.getDocument().text).toBe(
      completion === 'manual' ? '<html><body>人工编辑</body></html>' : original,
    )
  },
)
