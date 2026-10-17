import JSZip from 'jszip'
import { xlsxValidationMessageEditSchema } from '@mimir/shared'
import { BoundedZip } from '../../../../packages/office/src/zip-bounds.js'
import { readXlsx } from '../../../../packages/office/src/xlsx.js'
import { encodeXlsxEscapes } from '../../../../packages/office/vendor/packages/xlsx-gateway/src/gateway/xlsx-escapes.js'
import type { XlsxHostResult } from './xlsx-agent-host.js'

const escapeAttribute = (value: string) =>
  encodeXlsxEscapes(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\r', '&#13;')
    .replaceAll('\n', '&#10;')
/** Only message/dropdown flags change; native constraints and all unrelated XML remain exact. */
export async function applyXlsxValidationOptions(
  bytes: Uint8Array,
  raw: unknown,
  version: number,
  signal?: AbortSignal,
): Promise<XlsxHostResult> {
  const operation = xlsxValidationMessageEditSchema.parse(raw)
  const bounded = await BoundedZip.open(bytes)
  await bounded.preflightAll()
  const workbook = await readXlsx(bytes)
  const sheet = workbook.sheets.find((item) => item.id === operation.sheetId)
  if (!sheet || sheet.extras?.protected) throw new Error('工作表不存在或已保护')
  const matching = sheet.extras?.validations?.filter((item) => item.xml === operation.ruleXml) ?? []
  if (
    matching.length !== 1 ||
    matching[0]!.unsupported ||
    !['stop', 'warning', 'information'].includes(matching[0]!.errorStyle ?? 'stop') ||
    !['none', 'list', 'custom', 'whole', 'decimal', 'date', 'time', 'textLength'].includes(
      matching[0]!.type,
    )
  )
    throw new Error('原件验证规则无法唯一可靠映射，请重新选择')
  const source = await bounded.readText(sheet.entry)
  if (!source || /<(?:\w+:)dataValidation\b/.test(source))
    throw new Error('扩展数据验证暂不支持修改')
  let rule = operation.ruleXml
  const opening = /^<dataValidation\b(?:"[^"]*"|'[^']*'|[^'">])*?>/.exec(rule)?.[0]
  if (!opening) throw new Error('原件验证规则标签无法可靠读取')
  const end = opening.endsWith('/>') ? '/>' : '>'
  let attributes = opening.slice(0, -end.length)
  const originalOptions = operation.options
  const values = { ...originalOptions, showDropDown: !originalOptions.showDropDown }
  for (const [name, value] of Object.entries(values)) {
    const original = matching[0]![name as keyof (typeof matching)[0]]
    const nativeValue = name === 'showDropDown' ? matching[0]!.showDropDown : original
    if (nativeValue === value) continue
    attributes = attributes.replace(
      /\s+([^\s=/>]+)\s*=\s*(?:"[^"]*"|'[^']*')/g,
      (whole, key: string) => (key === name ? '' : whole),
    )
    attributes += ` ${name}="${typeof value === 'boolean' ? (value ? '1' : '0') : escapeAttribute(value)}"`
  }
  rule = attributes + end + rule.slice(opening.length)
  if (signal?.aborted) throw new Error('验证提示编辑已取消')
  if (rule === operation.ruleXml) throw new Error('验证提示没有改动')
  const zip = await JSZip.loadAsync(bytes)
  zip.file(
    sheet.entry,
    source.replace(operation.ruleXml, () => rule),
  )
  const result = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
  if (signal?.aborted) throw new Error('验证提示编辑已取消')
  await (await BoundedZip.open(result)).preflightAll()
  if (signal?.aborted) throw new Error('验证提示编辑已取消')
  return { bytes: result, version: version + 1, changedCells: [], touchedEntries: [sheet.entry] }
}
