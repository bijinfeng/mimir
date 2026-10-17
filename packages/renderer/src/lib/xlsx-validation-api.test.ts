import { expect, it, vi } from 'vitest'
import { XlsxValidationConfirmationError } from '@mimir/shared'
import { api, configureApiTransport, ApiRequestError } from './api'
it('bridges a strict manual warning in a separate multipart field', async () => {
  const warning = {
    token: '40d7522e-c40a-4102-8e98-e9416c6f014e',
    title: '检查',
    message: '值超出范围',
    style: 'warning',
    address: 'B2',
  }
  const fetchImpl = vi.fn<typeof fetch>(
    async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 'XLSX_VALIDATION_CONFIRMATION',
            message: warning.message,
            details: { validationWarning: warning },
          },
        }),
        { status: 409, headers: { 'content-type': 'application/json' } },
      ),
  )
  configureApiTransport({ fetchImpl })
  const input = {
    documentId: 'xlsx-1',
    bytes: new Uint8Array([1, 2]),
    expectedVersion: 0,
    ops: [{ op: 'set_cell', sheetId: 'sheet-1', address: 'B2', value: 9 }],
    validationConsent: { intent: 'manual_cell' as const },
  }
  await expect(api.documents.applyXlsxOps(input)).rejects.toBeInstanceOf(
    XlsxValidationConfirmationError,
  )
  const form = fetchImpl.mock.calls[0]![1]!.body as FormData
  expect(JSON.parse(String(form.get('validationConsent')))).toEqual({ intent: 'manual_cell' })
  expect(JSON.parse(String(form.get('ops')))).toEqual(input.ops)
  expect(form.get('ops')).not.toContain('validationConsent')
})
it('retains ordinary API errors for malformed warning details', async () => {
  configureApiTransport({
    fetchImpl: vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'XLSX_VALIDATION_CONFIRMATION',
              message: 'bad warning',
              details: { validationWarning: { token: 'not-a-uuid' } },
            },
          }),
          { status: 409 },
        ),
    ),
  })
  await expect(
    api.documents.applyXlsxOps({
      documentId: 'xlsx-1',
      bytes: new Uint8Array([1]),
      expectedVersion: 0,
      ops: [{ op: 'set_cell' }],
    }),
  ).rejects.toBeInstanceOf(ApiRequestError)
})
