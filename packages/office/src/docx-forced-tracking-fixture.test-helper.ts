import JSZip from 'jszip'
import { protectedAnchorsFixture } from './docx-protected-anchors-fixture.test-helper.js'
import { passwordSettings } from './docx-protection-password-fixture.test-helper.js'
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
export async function forcedTrackingFixture(mode = 'trackedChanges') {
  const zip = await JSZip.loadAsync(await protectedAnchorsFixture(true))
  zip.file(
    'word/settings.xml',
    passwordSettings(`<w:documentProtection w:edit="${mode}" w:enforcement="1"/>`),
  )
  zip.file(
    'word/document.xml',
    `<w:document xmlns:w="${W}" xmlns:x="urn:keep"><w:body><w:p><w:r><w:t>Alpha beta 中文🙂</w:t></w:r></w:p><w:p><w:r><w:t>Before </w:t></w:r><w:ins w:id="11" w:author="Original" w:date="2020-01-01T00:00:00Z"><w:r><w:t>existing insertion</w:t></w:r></w:ins><w:del w:id="12" w:author="Original" w:date="2020-01-01T00:00:00Z"><w:r><w:delText>existing deletion</w:delText></w:r></w:del><w:r><w:t> After</w:t></w:r></w:p><w:p x:keep="opaque"><w:r x:keep="yes"><w:t>Untouched</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>`,
  )
  return zip.generateAsync({ type: 'uint8array' })
}
