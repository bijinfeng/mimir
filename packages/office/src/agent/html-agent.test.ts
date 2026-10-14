import { describe, expect, it } from 'vitest'
import { HtmlAgentHandle, HTML_OP_NAMES, type HtmlAgentHooks } from './html-agent.js'
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
    expect(getCanvas()).toBe(generated)
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
