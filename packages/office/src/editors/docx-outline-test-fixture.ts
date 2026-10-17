import JSZip from 'jszip'
import { designFixture, DESIGN_TEST_SECTION } from './docx-design-test-fixture.js'

/** Rich headings and list/style edge cases, using real native styles 1–9. */
export async function outlineFixture(protectedDocument = false) {
  const zip = await JSZip.loadAsync(await designFixture())
  const source = await zip.file('word/document.xml')!.async('string')
  const headings = Array.from({ length: 9 }, (_, index) => {
    const level = index + 1
    return `<w:p><w:pPr><w:pStyle w:val="Heading${level}"/><w:spacing w:before="120"/><w:cnfStyle w:val="100000000000"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="123456"/></w:rPr><w:t xml:space="preserve">${level === 1 ? '重复  中文' : `标题 ${level}`}</w:t></w:r><w:hyperlink r:id="outlineLink"><w:r><w:t xml:space="preserve"> Link</w:t></w:r></w:hyperlink></w:p>`
  }).join('')
  const body = `<w:body>${headings}<w:p><w:r><w:t>Visible body between headings</w:t></w:r></w:p><w:p><w:pPr><w:outlineLvl w:val="1"/></w:pPr><w:r><w:rPr><w:i/></w:rPr><w:t>显式  大纲</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="StyledHeading"/></w:pPr><w:r><w:t>样式标题</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="NumberedHeading"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="30"/></w:numPr></w:pPr><w:r><w:t>编号标题</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="OffHeading"/></w:pPr><w:r><w:t>Body outline off</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>重复  中文</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading9"/></w:pPr></w:p>${DESIGN_TEST_SECTION}</w:body>`
  zip.file('word/document.xml', source.replace(/<w:body\b[^>]*>[\s\S]*?<\/w:body>/, body))
  zip.file(
    'word/styles.xml',
    `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>${Array.from({ length: 9 }, (_, index) => `<w:style w:type="paragraph" w:styleId="Heading${index + 1}"><w:name w:val="heading ${index + 1}"/><w:pPr><w:outlineLvl w:val="${index}"/></w:pPr></w:style>`).join('')}<w:style w:type="paragraph" w:styleId="StyledHeading"><w:name w:val="Styled heading"/><w:basedOn w:val="Heading3"/></w:style><w:style w:type="paragraph" w:styleId="NumberedHeading"><w:name w:val="Numbered heading"/><w:basedOn w:val="Heading2"/><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="30"/></w:numPr></w:pPr></w:style><w:style w:type="paragraph" w:styleId="OffHeading"><w:name w:val="Body off"/><w:basedOn w:val="Heading1"/><w:pPr><w:outlineLvl w:val="9"/></w:pPr></w:style></w:styles>`,
  )
  zip.file(
    'word/numbering.xml',
    '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="30"><w:lvl w:ilvl="0"><w:start w:val="5"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="30"><w:abstractNumId w:val="30"/></w:num></w:numbering>',
  )
  const rels = await zip.file('word/_rels/document.xml.rels')!.async('string')
  zip.file(
    'word/_rels/document.xml.rels',
    rels.replace(
      '</Relationships>',
      '<Relationship Id="outlineNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="outlineLink" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/outline" TargetMode="External"/>' +
        (protectedDocument
          ? '<Relationship Id="outlineSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>'
          : '') +
        '</Relationships>',
    ),
  )
  if (protectedDocument)
    zip.file(
      'word/settings.xml',
      '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:documentProtection w:edit="readOnly" w:enforcement="1"/></w:settings>',
    )
  const types = await zip.file('[Content_Types].xml')!.async('string')
  zip.file(
    '[Content_Types].xml',
    types.replace(
      '</Types>',
      '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
        (protectedDocument
          ? '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>'
          : '') +
        '</Types>',
    ),
  )
  return zip.generateAsync({ type: 'uint8array' })
}
