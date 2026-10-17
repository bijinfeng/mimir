import JSZip from 'jszip'
import { describe, expect, it, vi } from 'vitest'
import { XlsxValidationConfirmationError } from '@mimir/shared'
import { xlsxValidationFixture } from '../../../../packages/office/src/editors/xlsx-validation-test-fixture.js'
import { readXlsx } from '../../../../packages/office/src/xlsx.js'
import { applyXlsxOpsOnHost, type XlsxHostRequest } from '../services/xlsx-agent-host.js'
vi.mock('../services/documents.js', () => ({
  getDocument: async () => ({
    id: 'xlsx-1',
    kind: 'file',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileExtension: 'xlsx',
  }),
}))
async function request(address = 'B2'): Promise<XlsxHostRequest> {
  const f = await xlsxValidationFixture()
  return {
    bytes: f.bytes,
    documentId: 'xlsx-1',
    principal: 'admin@example.com',
    expectedVersion: 0,
    ops: [{ op: 'set_cell', sheetId: f.sheet.id, address, value: 9 }],
    validationConsent: { intent: 'manual_cell' },
  }
}
async function challenge(input: XlsxHostRequest) {
  const error = await applyXlsxOpsOnHost(input).then(
    () => null,
    (caught: unknown) => caught,
  )
  expect(error).toBeInstanceOf(XlsxValidationConfirmationError)
  return (error as XlsxValidationConfirmationError).warning
}
async function entries(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes)
  return new Map(
    await Promise.all(
      Object.values(zip.files)
        .filter((entry) => !entry.dir)
        .map(async (entry) => [entry.name, await entry.async('uint8array')] as const),
    ),
  )
}
describe('native validation manual confirmation and options', () => {
  it('shifts relative numeric validation limits from the first sqref anchor and preserves absolute references', async () => {
    const input = await request(),
      zip = await JSZip.loadAsync(input.bytes),
      path = 'xl/worksheets/sheet2.xml'
    const original = await zip.file(path)!.async('string')
    const withRule = (formula: string) =>
      original.replace(
        '</dataValidations>',
        `<dataValidation type="whole" operator="greaterThan" sqref="C1:C2" showErrorMessage="1"><formula1>${formula}</formula1></dataValidation></dataValidations>`,
      )
    const limits = [
      { op: 'set_cell', sheetId: 'sheet-2', address: 'D1', value: 1 },
      { op: 'set_cell', sheetId: 'sheet-2', address: 'D2', value: 10 },
    ]
    zip.file(path, withRule('D1'))
    const prepared = await applyXlsxOpsOnHost({
      ...input,
      bytes: await zip.generateAsync({ type: 'uint8array' }),
      ops: limits,
      validationConsent: undefined,
    })
    const change = {
      ...input,
      bytes: prepared.bytes,
      expectedVersion: 1,
      ops: [{ op: 'set_cell', sheetId: 'sheet-2', address: 'C2', value: 5 }],
      validationConsent: undefined,
    }
    await expect(applyXlsxOpsOnHost(change)).rejects.toThrow('未修改')
    const missing = await JSZip.loadAsync(prepared.bytes)
    missing.file(
      path,
      (await missing.file(path)!.async('string')).replace(
        /(<c r="D2"[^>]*>)<v>10<\/v>/,
        '$1<f>SUM(5,5)</f>',
      ),
    )
    await expect(
      applyXlsxOpsOnHost({ ...change, bytes: await missing.generateAsync({ type: 'uint8array' }) }),
    ).rejects.toThrow('未缓存')
    const absolute = await JSZip.loadAsync(prepared.bytes)
    absolute.file(
      path,
      (await absolute.file(path)!.async('string')).replace(
        '<formula1>D1</formula1>',
        '<formula1>$D$1</formula1>',
      ),
    )
    expect(
      (
        await applyXlsxOpsOnHost({
          ...change,
          bytes: await absolute.generateAsync({ type: 'uint8array' }),
        })
      ).version,
    ).toBe(2)
  })
  it('expires pending consent and refuses unknown styles/operators even when errors are disabled', async () => {
    const input = await request(),
      warning = await challenge(input)
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 300001)
    try {
      await expect(
        applyXlsxOpsOnHost({
          ...input,
          validationConsent: { intent: 'manual_cell', token: warning.token },
        }),
      ).rejects.toThrow('过期')
    } finally {
      clock.mockRestore()
    }
    for (const replacement of ['errorStyle="future"', 'operator="future"']) {
      const zip = await JSZip.loadAsync(input.bytes),
        path = 'xl/worksheets/sheet2.xml'
      let xml = await zip.file(path)!.async('string')
      xml = replacement.startsWith('errorStyle')
        ? xml.replaceAll('errorStyle="warning"', replacement)
        : xml.replaceAll('operator="between"', replacement)
      xml = xml.replaceAll('showErrorMessage="1"', 'showErrorMessage="0"')
      zip.file(path, xml)
      await expect(
        applyXlsxOpsOnHost({ ...input, bytes: await zip.generateAsync({ type: 'uint8array' }) }),
      ).rejects.toThrow('无法识别')
    }
  })
  it.each(['B2', 'B3'])(
    'requires one explicit manual confirmation for %s and consumes it once',
    async (address) => {
      const input = await request(address),
        original = input.bytes.slice(),
        warning = await challenge(input)
      expect(input.bytes).toEqual(original)
      expect(warning).toMatchObject({
        address,
        title: '输入检查',
        style: address === 'B2' ? 'warning' : 'information',
      })
      const confirmed = {
        ...input,
        validationConsent: { intent: 'manual_cell' as const, token: warning.token },
      }
      const result = await applyXlsxOpsOnHost(confirmed)
      expect(result.version).toBe(1)
      expect(
        (await readXlsx(result.bytes)).sheets[1]!.rows.find(
          (row) => row.number === Number(address.slice(1)),
        )!.cells[1]!.text,
      ).toBe('9')
      await expect(applyXlsxOpsOnHost(confirmed)).rejects.toThrow('过期')
      const before = await entries(original),
        after = await entries(result.bytes)
      for (const [path, bytes] of [...before].filter(
        ([entryPath]) => !result.touchedEntries.includes(entryPath),
      ))
        expect(after.get(path)).toEqual(bytes)
    },
  )
  it.each(['principal', 'documentId', 'expectedVersion', 'bytes', 'cell', 'value', 'rule'])(
    'binds confirmation to %s',
    async (field) => {
      const input = await request(),
        warning = await challenge(input)
      const changed = {
        ...input,
        ops: structuredClone(input.ops),
        validationConsent: { intent: 'manual_cell' as const, token: warning.token },
      }
      if (field === 'principal') changed.principal = 'another-principal'
      if (field === 'documentId') changed.documentId = 'xlsx-other'
      if (field === 'expectedVersion') changed.expectedVersion = 1
      if (field === 'cell') (changed.ops[0] as { address: string }).address = 'B3'
      if (field === 'value') (changed.ops[0] as { value: number }).value = 10
      if (field === 'bytes' || field === 'rule') {
        const zip = await JSZip.loadAsync(input.bytes)
        if (field === 'bytes') zip.file('customXml/test.xml', '<keep/>')
        else {
          const path = 'xl/worksheets/sheet2.xml'
          zip.file(
            path,
            (await zip.file(path)!.async('string')).replace(
              'errorStyle="warning"',
              'errorStyle="information"',
            ),
          )
        }
        changed.bytes = await zip.generateAsync({ type: 'uint8array' })
      }
      await expect(applyXlsxOpsOnHost(changed)).rejects.toThrow('过期')
    },
  )
  it('refuses Agent, batches, stop forgery and unsupported rules atomically; disabled error permits known invalid values', async () => {
    const input = await request(),
      before = input.bytes.slice()
    await expect(applyXlsxOpsOnHost({ ...input, validationConsent: undefined })).rejects.toThrow(
      'Agent',
    )
    await expect(applyXlsxOpsOnHost({ ...input, principal: undefined })).rejects.toThrow('显式确认')
    await expect(
      applyXlsxOpsOnHost({
        ...input,
        ops: [
          ...input.ops,
          { op: 'set_cell', sheetId: 'sheet-2', address: 'C1', value: 'must not publish' },
        ],
        validationConsent: undefined,
      }),
    ).rejects.toThrow('Agent')
    const warning = await challenge(input)
    await expect(
      applyXlsxOpsOnHost({
        ...(await request('B1')),
        validationConsent: { intent: 'manual_cell', token: warning.token },
      }),
    ).rejects.toThrow('未修改')
    await expect(applyXlsxOpsOnHost(await request('B5'))).rejects.toThrow('未修改')
    expect((await applyXlsxOpsOnHost(await request('B4'))).version).toBe(1)
    expect(input.bytes).toEqual(before)
  })
  it('refuses all-rules stop even if an earlier rule warns and rejects malformed consent', async () => {
    const input = await request(),
      zip = await JSZip.loadAsync(input.bytes),
      path = 'xl/worksheets/sheet2.xml'
    zip.file(
      path,
      (await zip.file(path)!.async('string')).replace(
        '</dataValidations>',
        '<dataValidation type="whole" sqref="B2" showErrorMessage="1"><formula1>1</formula1><formula2>2</formula2></dataValidation></dataValidations>',
      ),
    )
    await expect(
      applyXlsxOpsOnHost({ ...input, bytes: await zip.generateAsync({ type: 'uint8array' }) }),
    ).rejects.toThrow('未修改')
    await expect(
      applyXlsxOpsOnHost({ ...input, validationConsent: { intent: 'manual_cell', token: 'bad' } }),
    ).rejects.toThrow('UUID')
  })
  it('edits only native message flags while retaining constraints, unrelated ZIP and escaping literal XML/Excel strings', async () => {
    const f = await xlsxValidationFixture(),
      rule = f.sheet.extras!.validations![0]!,
      options = {
        showErrorMessage: true,
        errorStyle: 'information' as const,
        errorTitle: '错误 $& "引号"',
        error: 'a\nb',
        showInputMessage: true,
        promptTitle: '_x0041_',
        prompt: '中文\n$1<&\r',
        showDropDown: false,
      }
    const result = await applyXlsxOpsOnHost({
      bytes: f.bytes,
      documentId: 'xlsx-1',
      expectedVersion: 0,
      ops: [{ op: 'edit_validation_options', sheetId: f.sheet.id, ruleXml: rule.xml, options }],
    })
    const read = (await readXlsx(result.bytes)).sheets[1]!.extras!.validations![0]!
    expect(read).toMatchObject({
      ...options,
      showDropDown: true,
      formula1: rule.formula1,
      range: rule.range,
      type: rule.type,
    })
    const before = await entries(f.bytes),
      after = await entries(result.bytes)
    for (const [path, bytes] of [...before].filter(([entryPath]) => entryPath !== f.sheet.entry))
      expect(after.get(path)).toEqual(bytes)
    await expect(
      applyXlsxOpsOnHost({
        bytes: result.bytes,
        documentId: 'xlsx-1',
        expectedVersion: 1,
        ops: [{ op: 'edit_validation_options', sheetId: f.sheet.id, ruleXml: read.xml, options }],
      }),
    ).rejects.toThrow('没有改动')
    await expect(
      applyXlsxOpsOnHost({
        bytes: result.bytes,
        documentId: 'xlsx-1',
        expectedVersion: 1,
        ops: [{ op: 'edit_validation_options', sheetId: f.sheet.id, ruleXml: rule.xml, options }],
      }),
    ).rejects.toThrow('映射')
  })
})
