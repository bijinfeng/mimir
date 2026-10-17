import JSZip from 'jszip'
import { protectedAnchorsFixture } from './docx-protected-anchors-fixture.test-helper.js'
import { protectedFormsFixture } from './docx-protected-forms-fixture.test-helper.js'
import { PASSWORD_VECTORS, PASSWORD_VECTOR_SALT } from './docx-protection-password-test-helper.js'
export const passwordAttrs = (
  vector: (typeof PASSWORD_VECTORS)[number] = PASSWORD_VECTORS[0],
  missingSpin = false,
) =>
  `w:hash="${vector.hash}" w:salt="${PASSWORD_VECTOR_SALT}" w:cryptAlgorithmSid="14"${missingSpin ? '' : ` w:cryptSpinCount="${vector.spinCount}"`}`
export const passwordSettings = (nodes: string) =>
  `<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:x="urn:mimir-password-opaque"><!-- preserve native settings --><w:zoom w:percent="95"/><x:opaque value="keep"/>${nodes}</w:settings>`
export async function passwordDocxFixture({
  mode,
  vector = PASSWORD_VECTORS[0],
  missingSpin = false,
}: { mode?: string; vector?: (typeof PASSWORD_VECTORS)[number]; missingSpin?: boolean } = {}) {
  const zip = await JSZip.loadAsync(
    mode === 'forms' ? await protectedFormsFixture() : await protectedAnchorsFixture(false),
  )
  zip.file(
    'word/settings.xml',
    passwordSettings(
      `${mode ? `<w:documentProtection w:edit="${mode}" w:enforcement="1"/>` : ''}<w:writeProtection w:recommended="1" ${passwordAttrs(vector, missingSpin)}/>`,
    ),
  )
  return zip.generateAsync({ type: 'uint8array' })
}
