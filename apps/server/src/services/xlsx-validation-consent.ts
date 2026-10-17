import { createHash, randomUUID } from 'node:crypto'
import {
  XlsxValidationConfirmationError,
  xlsxValidationConsentSchema,
  type XlsxValidationConsent,
} from '@mimir/shared'
import type { XlsxValidationIssue } from '../../../../packages/office/src/xlsx-cell-effects.js'

const entries = new Map<string, { key: string; expires: number }>()
const TTL = 5 * 60_000
export function authorizeXlsxValidationWarning(
  request: {
    principal?: string
    documentId: string
    bytes: Uint8Array
    expectedVersion: number
    ops: unknown[]
    validationConsent?: XlsxValidationConsent
  },
  warnings: { sheetId: string; address: string; issue: XlsxValidationIssue }[],
): void {
  const consent = request.validationConsent
    ? xlsxValidationConsentSchema.parse(request.validationConsent)
    : undefined
  const operation = request.ops[0] as
    | { op?: string; sheetId?: string; address?: string }
    | undefined
  if (!warnings.length) {
    if (consent?.token) throw new Error('确认引用不适用于当前输入，请重新应用')
    return
  }
  if (
    !consent ||
    !request.principal ||
    request.ops.length !== 1 ||
    operation?.op !== 'set_cell' ||
    warnings.some(
      (item) => item.sheetId !== operation.sheetId || item.address !== operation.address,
    )
  )
    throw new Error('输入不符合验证规则；警告或信息需要用户在当前格显式确认，批量和Agent操作未修改')
  const key = createHash('sha256')
    .update(request.bytes)
    .update(
      JSON.stringify([
        request.principal,
        request.documentId,
        request.expectedVersion,
        request.ops,
        warnings,
      ]),
    )
    .digest('hex')
  const now = Date.now()
  for (const [id, entry] of entries) if (entry.expires <= now) entries.delete(id)
  if (consent.token) {
    const entry = entries.get(consent.token)
    if (!entry || entry.key !== key)
      throw new Error('数据验证确认已过期或输入、规则、账号、文档及版本已变化')
    entries.delete(consent.token)
    return
  }
  while (entries.size >= 128) entries.delete(entries.keys().next().value!)
  const token = randomUUID()
  entries.set(token, { key, expires: now + TTL })
  const first = warnings[0]!.issue
  throw new XlsxValidationConfirmationError({
    token,
    style: first.style === 'information' ? 'information' : 'warning',
    title: first.title.slice(0, 256),
    message: warnings
      .map((item) => item.issue.message)
      .join('\n')
      .slice(0, 4096),
    address: warnings[0]!.address,
  })
}
