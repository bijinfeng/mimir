import { beforeAll, expect, it } from 'vitest'
import { app, getAuthCookie } from './helpers.js'
import { uploadFile } from '../services/upload.js'
import { xlsxValidationFixture } from '../../../../packages/office/src/editors/xlsx-validation-test-fixture.js'
let cookie: string
beforeAll(async () => {
  cookie = await getAuthCookie()
})
it('returns authenticated manual warning, verifies exact retry and leaves stored original untouched', async () => {
  const f = await xlsxValidationFixture(),
    uploaded = await uploadFile({ filename: 'validation-route.xlsx', data: f.bytes })
  const form = (consent?: unknown, address = 'B2') => {
    const data = new FormData()
    data.set(
      'file',
      new File([new Uint8Array(f.bytes)], 'current.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    )
    data.set('documentId', uploaded.document.id)
    data.set('expectedVersion', '0')
    data.set('ops', JSON.stringify([{ op: 'set_cell', sheetId: f.sheet.id, address, value: 9 }]))
    if (consent !== undefined) data.set('validationConsent', JSON.stringify(consent))
    return data
  }
  const send = (body: FormData, authenticated = true) =>
    app.request('/api/conversations/xlsx-agent/apply-ops', {
      method: 'POST',
      headers: authenticated ? { Cookie: cookie } : {},
      body,
    })
  expect((await send(form({ intent: 'manual_cell' }), false)).status).toBe(401)
  expect((await send(form({ intent: 'manual_cell', allowInvalid: true }))).status).toBe(400)
  expect((await send(form())).status).toBe(400)
  const warning = await send(form({ intent: 'manual_cell' }))
  expect(warning.status).toBe(409)
  const payload = (await warning.json()) as {
    error: {
      code: string
      details: { validationWarning: { token: string; address: string; style: string } }
    }
  }
  expect(payload.error.code).toBe('XLSX_VALIDATION_CONFIRMATION')
  const challenge = payload.error.details.validationWarning
  expect(challenge).toMatchObject({ style: 'warning', address: 'B2' })
  const consent = { intent: 'manual_cell', token: challenge.token }
  expect((await send(form(consent, 'B1'))).status).toBe(400)
  const accepted = await send(form(consent))
  expect(accepted.status).toBe(200)
  expect(await accepted.json()).toMatchObject({ version: 1, changedCells: ['sheet-2:B2'] })
  expect((await send(form(consent))).status).toBe(400)
  const original = await app.request(`/api/documents/${uploaded.document.id}/file`, {
    headers: { Cookie: cookie },
  })
  expect(new Uint8Array(await original.arrayBuffer())).toEqual(f.bytes)
})
