import JSZip from 'jszip'
import { protectedAnchorsFixture } from './docx-protected-anchors-fixture.test-helper.js'
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml'
export function legacyCheckbox(name = '同形控件', extra = '', state = '<w:default w:val="0"/>') {
  return `<w:r x:keep="begin"><w:rPr><w:b/></w:rPr><w:fldChar w:fldCharType="begin"><w:ffData x:keep="ffData"><w:name w:val="${name}"/>${extra}<x:opaque value="keep"/><w:checkBox x:keep="box"><w:sizeAuto/>${state}</w:checkBox></w:ffData></w:fldChar></w:r><w:r><w:instrText xml:space="preserve"> FORMCHECKBOX </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`
}
export function sdtCheckbox(extra = '', checked = false, pair = '') {
  return `<w:sdt x:keep="sdt"><w:sdtPr x:keep="properties"><w:id w:val="7"/>${extra}<x:opaque value="keep"/><w14:checkbox x:keep="checkbox"><w14:checked w14:val="${checked ? '1' : '0'}" x:keep="state"/>${pair}</w14:checkbox></w:sdtPr><w:sdtContent><w:r x:keep="glyph"><w:rPr><w:rFonts w:ascii="Arial"/></w:rPr><w:t x:keep="text">${checked ? '☒' : '☐'}</w:t></w:r></w:sdtContent></w:sdt>`
}
export async function protectedFormsFixture(body?: string) {
  const zip = await JSZip.loadAsync(await protectedAnchorsFixture(true))
  zip.file(
    'word/settings.xml',
    `<w:settings xmlns:w="${W}"><w:documentProtection w:edit="forms" w:enforcement="1"/></w:settings>`,
  )
  zip.file(
    'word/document.xml',
    `<w:document xmlns:w="${W}" xmlns:w14="${W14}" xmlns:x="urn:mimir-forms-keep"><w:body>${body ?? `<w:p x:keep="paragraph"><w:r><w:t>相邻旧式复选框：</w:t></w:r>${legacyCheckbox()}${legacyCheckbox()}</w:p><w:p><w:r><w:t>内容控件：</w:t></w:r>${sdtCheckbox()}</w:p><w:p><w:r><w:t>普通文字方框 ☐ 保持只读</w:t></w:r></w:p><w:p><w:r><w:t>禁用控件：</w:t></w:r>${legacyCheckbox('禁用控件', '<w:enabled w:val="0"/>')}</w:p><w:p><w:r><w:t>锁定控件：</w:t></w:r>${sdtCheckbox('<w:lock w:val="sdtContentLocked"/>')}</w:p>`}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:bottom="1440" w:left="1440" w:right="1440"/></w:sectPr></w:body></w:document>`,
  )
  return zip.generateAsync({ type: 'uint8array' })
}
