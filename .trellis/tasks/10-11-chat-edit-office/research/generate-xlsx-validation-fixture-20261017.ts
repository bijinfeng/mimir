import { writeFileSync } from 'node:fs'
import { xlsxValidationFixture } from '../../../../packages/office/src/editors/xlsx-validation-test-fixture.js'
const fixture = await xlsxValidationFixture()
const path = '/tmp/mimir-xlsx-validation-20261017.xlsx'
writeFileSync(path, fixture.bytes)
console.log(JSON.stringify({ path, sheet: fixture.sheet.name, sheetId: fixture.sheet.id, rules: fixture.rules.length }))
