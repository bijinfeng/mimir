import type { SavePlan } from '../vendor/apps/docs/src/renderer/editor/convert.js'
import { mergePPrFormat, splitXmlChildren } from '../vendor/packages/docx-engine/src/generate.js'
import { escapeXmlAttr } from '../vendor/packages/docx-engine/src/xml-utils.js'
import type { Block } from '../vendor/packages/docx-engine/src/types.js'
import type { PmDocJson } from './docx.js'

/** Keep unknown paragraph properties while changing only the native heading identity.
 * Fixed upstream applyRawPPr ignores outline level when deciding raw pPr passthrough.
 */
export function docxOutlineSavePlan(
  edited: PmDocJson,
  original: PmDocJson,
  blocks: readonly Block[],
  plan: SavePlan,
  headingStyles: ReadonlyMap<number, string>,
): void {
  const used = new Set<number>()
  for (const node of edited.content ?? []) {
    const attrs = node.attrs as Record<string, unknown> | undefined
    if (typeof attrs?.docxIndex !== 'number' || used.has(attrs.docxIndex)) continue
    used.add(attrs.docxIndex)
    const baseline = original.content?.find((item) => item.attrs?.docxIndex === attrs.docxIndex)
    if (!baseline || (baseline.type !== 'docHeading' && node.type !== 'docHeading')) continue
    // List identity changes already have a native XML plan that preserves heading styles.
    // Numbered headings cannot be converted by the outline level tool.
    if (baseline.type === 'docListItem' || node.type === 'docListItem') continue
    if (
      baseline.type === node.type &&
      ['level', 'styleId', 'outlineOnly'].every(
        (key) => (baseline.attrs?.[key] ?? null) === (attrs[key] ?? null),
      )
    )
      continue
    const at = plan.saveBlockIndexByDocx.get(attrs.docxIndex),
      block = at === undefined ? null : plan.saveBlocks[at]
    const source = blocks.find((candidate) => candidate.docxIndex === attrs.docxIndex)
    if (!source || block?.kind !== 'generated')
      throw new Error('标题结构已变化，无法可靠保存大纲层级')
    const generated = block.block
    let ppr =
      generated.rawPPr ??
      mergePPrFormat(source.rawPPr ?? '<w:pPr/>', generated.format, source.format)
    if (!ppr) ppr = '<w:pPr></w:pPr>'
    if (ppr.endsWith('/>')) ppr = ppr.slice(0, -2) + '></w:pPr>'
    const set = (name: string, value: string | null) => {
      const children = splitXmlChildren(ppr.slice(ppr.indexOf('>') + 1, ppr.lastIndexOf('</')))
      const previous = children.find((child) => child.name === name)?.xml
      if (value === null) {
        if (previous) ppr = ppr.replace(previous, '')
        return
      }
      const escaped = escapeXmlAttr(value).replace(/'/g, '&apos;')
      let xml = `<${name} w:val="${escaped}"/>`
      if (previous) {
        let found = false
        // Tokenize complete attributes so w:val text inside an unknown value stays untouched.
        xml = previous.replace(
          /(\s+)([^\s=/>]+)(\s*=\s*)(["'])([\s\S]*?)\4/g,
          (attribute, space: string, key: string, equals: string, quote: string) => {
            if (key !== 'w:val') return attribute
            found = true
            return `${space}${key}${equals}${quote}${escaped}${quote}`
          },
        )
        if (!found) xml = xml.replace(/(?=\s*\/?>)/, () => ` w:val="${escaped}"`)
      }
      if (previous) ppr = ppr.replace(previous, () => xml)
      else {
        // pStyle is first in CT_PPr; outlineLvl precedes the terminal property children.
        const following =
          name === 'w:pStyle'
            ? children[0]?.xml
            : children.find((child) =>
                ['w:divId', 'w:cnfStyle', 'w:rPr', 'w:sectPr', 'w:pPrChange'].includes(child.name),
              )?.xml
        const insertAt = following ? ppr.indexOf(following) : ppr.lastIndexOf('</')
        ppr = ppr.slice(0, insertAt) + xml + ppr.slice(insertAt)
      }
    }
    const level = Number(attrs.level) || 1
    const styleId =
      typeof attrs.styleId === 'string'
        ? attrs.styleId
        : node.type === 'docHeading' && !attrs.outlineOnly
          ? headingStyles.get(level)
          : null
    set('w:pStyle', styleId ?? null)
    set(
      'w:outlineLvl',
      node.type === 'docHeading' && attrs.outlineOnly
        ? String(level - 1)
        : node.type === 'docParagraph' && baseline.attrs?.outlineOnly
          ? '9'
          : null,
    )
    generated.rawPPr = ppr
  }
}
