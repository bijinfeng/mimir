import { expect, it } from 'vitest'
import {
  PATTERN_TYPES,
  readXlsxFillViews,
  readXlsxThemePalette,
  resolveStyleColor,
  xlsxFillBackground,
  xlsxFillLabel,
} from './xlsx-fill.js'
const wrap = (fills: string, xfs: string, parents = '<xf fillId="2"/>') =>
  `<styleSheet><fills>${fills}</fills><cellStyleXfs>${parents}</cellStyleXfs><cellXfs>${xfs}</cellXfs></styleSheet>`
const none = '<fill><patternFill patternType="none"/></fill>',
  gray = '<fill><patternFill patternType="gray125"/></fill>',
  themed =
    '<fill><patternFill patternType="solid"><fgColor theme="4" tint="0.4"/></patternFill></fill>'
it('retains theme/tint references and resolves actual document palette using native HLS', () => {
  const palette = readXlsxThemePalette(
    '<a:theme><a:accent1><a:srgbClr val="204060"/></a:accent1></a:theme>',
  )
  const fill = readXlsxFillViews(wrap(none + gray + themed, '<xf fillId="2" applyFill="1"/>'))[0]!
  expect(fill.spec).toEqual({ pattern: 'solid', fg: { theme: 4, tint: 0.4 } })
  expect(palette[4]).toBe('#204060')
  expect(xlsxFillBackground(fill.spec, palette)).toBe(
    resolveStyleColor({ theme: 4, tint: 0.4 }, palette),
  )
  expect(JSON.stringify(fill)).not.toContain('data:image')
})
it('distinguishes inherited fill from explicit clear even when parent has a color', () => {
  const fills = readXlsxFillViews(
    wrap(
      none + gray + themed,
      '<xf fillId="0" xfId="0" applyFill="0"/><xf fillId="0" xfId="0" applyFill="1"/><xf xfId="0"/>',
    ),
  )
  expect(fills.map((f) => f.spec)).toEqual([
    { pattern: 'solid', fg: { theme: 4, tint: 0.4 } },
    null,
    { pattern: 'solid', fg: { theme: 4, tint: 0.4 } },
  ])
  expect(fills.map((f) => f.source)).toEqual(['inherited', 'direct', 'inherited'])
  expect(xlsxFillLabel(fills[0])).toContain('继承样式')
})
it.each(PATTERN_TYPES)(
  'reads and paints native %s foreground/background without losing references',
  (pattern) => {
    const fill = readXlsxFillViews(
      wrap(
        `<fill><patternFill patternType="${pattern}"><fgColor theme="5" tint="-0.2"/><bgColor rgb="FF123456"/></patternFill></fill>`,
        '<xf fillId="0"/>',
      ),
    )[0]!
    expect(fill.spec).toEqual({ pattern, fg: { theme: 5, tint: -0.2 }, bg: '#123456' })
    expect(xlsxFillBackground(fill.spec)).toBeTruthy()
    expect(fill.unsupported).toBeUndefined()
  },
)
it('reads 10-stop path geometry and previews rectangular gradients; linear direction is native clockwise', () => {
  const stops = Array.from(
    { length: 10 },
    (_, i) => `<stop position="${i / 9}"><color theme="${i}"/></stop>`,
  ).join('')
  const fill = readXlsxFillViews(
    wrap(
      `<fill><gradientFill type="path" left="0.2" right="0.7" top="0.3" bottom="0.1">${stops}</gradientFill></fill>`,
      '<xf fillId="0"/>',
    ),
  )[0]!
  expect(fill.spec).toMatchObject({
    gradient: {
      type: 'path',
      left: 0.2,
      right: 0.7,
      top: 0.3,
      bottom: 0.1,
      stops: expect.any(Array),
    },
  })
  expect('gradient' in fill.spec! && fill.spec.gradient.stops).toHaveLength(10)
  expect(xlsxFillBackground(fill.spec)).toContain('%3Crect')
  expect(
    xlsxFillBackground({
      gradient: {
        angle: 90,
        stops: [
          { position: 0, color: '#000000' },
          { position: 1, color: '#FFFFFF' },
        ],
      },
    }),
  ).toBe('linear-gradient(180deg, #000000 0%, #FFFFFF 100%)')
})
it('marks unknown or indexed colors as unsupported rather than silently displaying an editable RGB replacement', () => {
  const fill = readXlsxFillViews(
    wrap(
      '<fill><patternFill patternType="solid"><fgColor indexed="3"/></patternFill></fill>',
      '<xf fillId="0"/>',
    ),
  )[0]!
  expect(fill.spec).toBeNull()
  expect(fill.unsupported).toContain('索引色')
})
it.each([
  '<patternFill patternType="solid"><fgColor rgb="FF204060" tint="0.4"/></patternFill>',
  '<gradientFill><stop position="0"><color rgb="FF204060" tint="-0.2"/></stop><stop position="1"><color theme="0"/></stop></gradientFill>',
])('does not silently discard RGB tint from an original fill', (body) => {
  const fill = readXlsxFillViews(wrap(`<fill>${body}</fill>`, '<xf fillId="0"/>'))[0]!
  expect(fill.spec).toBeNull()
  expect(fill.unsupported).toBeTruthy()
})
it.each([
  ['darkGray', 48],
  ['mediumGray', 32],
  ['lightGray', 16],
  ['gray125', 8],
  ['gray0625', 4],
] as const)(
  'previews exact native %s dot coverage rather than a solid fallback',
  (pattern, dots) => {
    const background = xlsxFillBackground({ pattern, fg: '#112233', bg: '#FFFFFF' })!
    const svg = decodeURIComponent(
      background.slice(background.indexOf(',') + 1, background.indexOf('")')),
    )
    expect([...svg.matchAll(/<rect /g)]).toHaveLength(dots + 1)
  },
)
