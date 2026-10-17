import { describe, expect, it } from 'vitest'
import { normalizeHtmlPageBrief } from '@mimir/shared'
import { htmlBriefMetaTag, htmlBriefPinPatches, readHtmlBrief } from './html-brief.js'
import { applyPatches } from '../../vendor/apps/html/src/renderer/document/patch.js'

const brief = normalizeHtmlPageBrief({
  core_hook: 'A < B & “C”',
  style: {
    name: '阅读',
    tone: '简洁',
    palette: { primary: '#123456' },
    typography: { body: 'Arial' },
  },
  alternatives: [{ tone: '明快' }],
  sections: [{ title: '概述', brief: '说明', type: 'intro', image_queries: ['书籍'] }],
  meta: { title: '标题', audience: '读者', language: '中文' },
  user_edited: ['style.palette.primary'],
})

describe('portable HTML page brief', () => {
  it('normalizes upstream and legacy contracts and rejects invalid palettes or chapter counts', () => {
    expect(brief).toMatchObject({
      title: '标题',
      audience: '读者',
      tone: '简洁',
      sections: [{ purpose: '说明' }],
    })
    expect(
      normalizeHtmlPageBrief({
        title: '旧',
        tone: '平实',
        audience: '',
        sections: [{ title: '正文', purpose: '' }],
      }),
    ).toMatchObject({ core_hook: '旧', style: { palette: {} }, version: 1 })
    expect(() =>
      normalizeHtmlPageBrief({ ...brief, style: { ...brief.style, palette: { primary: 'red' } } }),
    ).toThrow('字段无效')
    expect(() => normalizeHtmlPageBrief({ ...brief, sections: [] })).toThrow('字段无效')
  })

  it('escapes meta content, retains semantic data, and excludes confirmation-only metadata', () => {
    const tag = htmlBriefMetaTag(brief)
    expect(tag).toContain('&lt;')
    expect(tag).toContain('&amp;')
    expect(tag).not.toContain('alternatives')
    expect(tag).not.toContain('user_edited')
    expect(readHtmlBrief(`<html><head>${tag}</head><body>保留</body></html>`)).toMatchObject({
      core_hook: brief.core_hook,
      style: brief.style,
      meta: brief.meta,
      sections: brief.sections,
    })
  })

  it.each([
    '<!doctype html><html><head><title>x</title></head><body><p>原文</p></body></html>',
    '<html><body><p>原文</p></body></html>',
    '<!doctype html><p>原文</p>',
    '\uFEFF<p>原文</p>',
  ])('pins once without rewriting source syntax: %s', (source) => {
    const pinned = applyPatches(source, htmlBriefPinPatches(source, brief))
    expect(readHtmlBrief(pinned)).toMatchObject({ core_hook: brief.core_hook })
    expect(pinned).toContain('<p>原文</p>')
    expect(htmlBriefPinPatches(pinned, brief)).toEqual([])
  })

  it('only replaces actual head metadata, deduplicates it, and preserves scripts, comments and body', () => {
    const old = '<meta name="genoffice:brief" content="{}">'
    const untouched = `<!-- ${old} --><script>const sample = '${old}'</script>`
    const body = `<body>${old}<p>原文</p></body>`
    const source = `<html><head>${untouched}${old}${old}</head>${body}</html>`
    expect(readHtmlBrief(source)).toBeNull()
    const pinned = applyPatches(source, htmlBriefPinPatches(source, brief))
    expect(pinned).toContain(untouched)
    expect(pinned).toContain(body)
    expect(readHtmlBrief(pinned)).toMatchObject({ title: brief.title })
    expect(htmlBriefPinPatches(pinned, brief)).toEqual([])
  })

  it('refuses malformed stored metadata and oversized writes', () => {
    expect(readHtmlBrief('<head><meta name="genoffice:brief" content="bad"></head>')).toBeNull()
    expect(() => htmlBriefPinPatches(`<body>${'x'.repeat(200_000)}</body>`, brief)).toThrow(
      '200000',
    )
  })

  it.each([
    '<html><head><meta charset="utf-8"><title>原文</title></head><body>保留</body></html>',
    '<meta http-equiv="Content-Type" content="text/html; charset=utf-8"><p>保留</p>',
  ])('keeps the existing encoding declaration ahead of a long pinned brief: %s', (source) => {
    const long = normalizeHtmlPageBrief({ ...brief, core_hook: '长'.repeat(2000) })
    const encoding = source.slice(
      source.indexOf('<meta'),
      source.indexOf('>', source.indexOf('<meta')) + 1,
    )
    const pinned = applyPatches(source, htmlBriefPinPatches(source, long))
    expect(pinned.indexOf(encoding)).toBe(source.indexOf(encoding))
    expect(pinned.indexOf('name="genoffice:brief"')).toBeGreaterThan(pinned.indexOf(encoding))
    expect(readHtmlBrief(pinned)?.core_hook).toBe(long.core_hook)
    expect(htmlBriefPinPatches(pinned, long)).toEqual([])
  })

  it('reads a valid rich brief larger than 60000 characters after pinning', () => {
    const long = normalizeHtmlPageBrief({
      ...brief,
      core_hook: 'x'.repeat(2000),
      style: {
        name: 'x'.repeat(100),
        tone: 'x'.repeat(400),
        typography: Object.fromEntries(
          ['heading', 'body', 'scale'].map((key) => [key, 'x'.repeat(400)]),
        ),
        tokens: Object.fromEntries(
          ['radius', 'spacing', 'shadow'].map((key) => [key, 'x'.repeat(400)]),
        ),
        layout: 'x'.repeat(400),
        density: 'x'.repeat(100),
      },
      sections: Array.from({ length: 20 }, () => ({
        title: 'x'.repeat(200),
        purpose: 'x'.repeat(1000),
        type: 'x'.repeat(100),
        layout: 'x'.repeat(400),
        image_queries: Array.from({ length: 5 }, () => 'x'.repeat(200)),
      })),
    })
    const source = '<html><head></head><body>保留</body></html>'
    const pinned = applyPatches(source, htmlBriefPinPatches(source, long))
    expect(JSON.stringify(long).length).toBeGreaterThan(60_000)
    expect(readHtmlBrief(pinned)).toMatchObject({
      core_hook: long.core_hook,
      sections: long.sections,
    })
    expect(htmlBriefPinPatches(pinned, long)).toEqual([])
  })
})
