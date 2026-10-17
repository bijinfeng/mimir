import JSZip from 'jszip'
import { BoundedZip } from '../../../../packages/office/src/zip-bounds.js'
import { xlsxAttribute as attr } from '../../../../packages/office/src/xlsx-sheet-features.js'
import { formatAddress } from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/cell-address.js'
import {
  inventoryXlsx,
  type CellEdit,
  type XlsxMutation,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/gateway/xlsx-gateway.js'

const tags = (xml: string, name: string) =>
  [...xml.matchAll(new RegExp(`<${name}\\b[^>]*?(?:\\/>|>[\\s\\S]*?<\\/${name}>)`, 'g'))].map(
    ([value]) => value,
  )
const section = (xml: string, name: string) =>
  new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`).exec(xml)?.[1] ?? ''
function attribute(xml: string, key: string, value: string | undefined) {
  return xml.replace(/^<\w+\b[^>]*>/, (opening) => {
    const pattern = new RegExp(`\\s${key}=(?:"[^"]*"|'[^']*')`)
    if (value !== undefined && pattern.test(opening))
      return opening.replace(pattern, ` ${key}="${value}"`)
    const next = opening.replace(pattern, '')
    return value === undefined
      ? next
      : next.replace(/\/?>(?=$)/, (end) => ` ${key}="${value}"${end}`)
  })
}
function child(xml: string, name: string, replacement: string) {
  const pattern = new RegExp(`<${name}\\b[^>]*?(?:\\/>|>[\\s\\S]*?<\\/${name}>)`)
  if (pattern.test(xml)) return xml.replace(pattern, replacement)
  return xml.endsWith('/>')
    ? xml.slice(0, -2) + `>${replacement}</xf>`
    : xml.replace('</xf>', `${replacement}</xf>`)
}
/** Native fill serialization, retaining original xf attributes and children
 * that the smaller preview model does not own. */
export async function preserveXlsxFillStyles(
  source: Buffer,
  mutation: XlsxMutation,
  edits: readonly CellEdit[],
  sheets: readonly { name: string; entry: string }[],
): Promise<XlsxMutation> {
  // A font/alignment patch must also retain the original fill inheritance flags.
  const affected = edits.filter(
    (edit) => edit.style && Object.values(edit.style).some((value) => value !== undefined),
  )
  if (!affected.length) return mutation
  const original = await BoundedZip.open(source),
    output = await BoundedZip.open(mutation.buffer)
  const originalStyles = (await original.readText('xl/styles.xml')) ?? ''
  let styles = (await output.readText('xl/styles.xml')) ?? ''
  const bases = tags(section(originalStyles, 'cellXfs'), 'xf'),
    xfs = tags(section(styles, 'cellXfs'), 'xf')
  if (!xfs.length) throw new Error('填充保存缺少单元格样式定义')
  const zip = await JSZip.loadAsync(mutation.buffer)
  for (const sheet of sheets) {
    const targets = affected.filter((edit) => edit.sheetName === sheet.name)
    if (!targets.length) continue
    const prior = (await original.readText(sheet.entry)) ?? ''
    let xml = (await output.readText(sheet.entry)) ?? ''
    const priorCells = new Map(tags(prior, 'c').map((cell) => [attr(cell, 'r'), cell])),
      cells = new Map(tags(xml, 'c').map((cell) => [attr(cell, 'r'), cell]))
    for (const edit of targets) {
      const address = formatAddress(edit.row, edit.column),
        cell = cells.get(address)
      if (!cell) throw new Error('填充保存丢失目标单元格')
      const generated = xfs[Number(attr(cell, 's') ?? 0)]
      if (!generated) throw new Error('填充保存引用了无效样式')
      const style = edit.style!
      let xf = bases[Number(attr(priorCells.get(address) ?? '', 's') ?? 0)] ?? xfs[0]!
      for (const [changed, names] of [
        [
          Object.keys(style).some((key) =>
            [
              'bold',
              'italic',
              'underline',
              'strikethrough',
              'fontFamily',
              'fontSize',
              'fontColor',
            ].includes(key),
          ),
          ['fontId', 'applyFont'],
        ],
        [style.numberFormat !== undefined, ['numFmtId', 'applyNumberFormat']],
        [Object.keys(style).some((key) => key.startsWith('border')), ['borderId', 'applyBorder']],
      ] as const)
        if (changed) for (const name of names) xf = attribute(xf, name, attr(generated, name))
      if (style.fill !== undefined || style.fillColor !== undefined)
        xf = attribute(attribute(xf, 'fillId', attr(generated, 'fillId') ?? '0'), 'applyFill', '1')
      const alignmentKeys = [
        ['horizontalAlignment', 'horizontal'],
        ['verticalAlignment', 'vertical'],
        ['wrapText', 'wrapText'],
        ['textRotation', 'textRotation'],
        ['indent', 'indent'],
      ] as const
      if (alignmentKeys.some(([key]) => style[key] !== undefined)) {
        let alignment = tags(xf, 'alignment')[0] ?? '<alignment/>'
        const fresh = tags(generated, 'alignment')[0] ?? ''
        for (const [key, name] of alignmentKeys)
          if (style[key] !== undefined) alignment = attribute(alignment, name, attr(fresh, name))
        xf = attribute(child(xf, 'alignment', alignment), 'applyAlignment', '1')
      }
      let index = xfs.indexOf(xf)
      if (index < 0) {
        index = xfs.length
        xfs.push(xf)
      }
      xml = xml.replace(cell, attribute(cell, 's', String(index)))
    }
    zip.file(sheet.entry, xml)
  }
  styles = styles.replace(
    /<cellXfs\b[^>]*>[\s\S]*?<\/cellXfs>/,
    `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>`,
  )
  zip.file('xl/styles.xml', styles)
  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  return { ...mutation, buffer, afterEntries: await inventoryXlsx(buffer) }
}
