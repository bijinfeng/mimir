import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { buildThemeXml, DEFAULT_THEME_COLORS } from '../../vendor/packages/docx-engine/src/theme.js'
export const DESIGN_TEST_SECTION =
  '<w:sectPr w:rsidR="KEEP"><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/><w:pgBorders w:offsetFrom="text" w:display="firstPage"><w:top w:val="double" w:sz="12" w:space="8" w:color="AABBCC"/></w:pgBorders><w:cols w:space="708"/><w:docGrid w:linePitch="312"/></w:sectPr>'
export async function designFixture(theme = true) {
  const zip = await JSZip.loadAsync(
    readFileSync(
      join(
        import.meta.dirname,
        '../../vendor/apps/docs/tests/pagination-corpus/docx/01-simple-english.docx',
      ),
    ),
  )
  const source = await zip.file('word/document.xml')!.async('string')
  const body = `<w:body><w:p><w:pPr>${DESIGN_TEST_SECTION}</w:pPr><w:r><w:t>First section</w:t></w:r></w:p><w:p><w:r><w:rPr><w:rFonts w:asciiTheme="minorHAnsi" w:eastAsiaTheme="minorEastAsia"/><w:color w:val="4472C4" w:themeColor="accent1" w:themeTint="80"/></w:rPr><w:t>Theme run</w:t></w:r><w:r><w:rPr><w:rFonts w:ascii="Courier New"/><w:color w:val="123456"/></w:rPr><w:t> Explicit run</w:t></w:r></w:p>${DESIGN_TEST_SECTION}</w:body>`
  zip.file('word/document.xml', source.replace(/<w:body\b[^>]*>[\s\S]*?<\/w:body>/, body))
  zip.file(
    'word/styles.xml',
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:asciiTheme="minorHAnsi"/><w:color w:val="4472C4" w:themeColor="accent1"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>',
  )
  const rels = await zip.file('word/_rels/document.xml.rels')!.async('string')
  const withoutTheme = rels.replace(/<Relationship\b[^>]*Type="[^"]*\/theme"[^>]*\/>/g, '')
  zip.file(
    'word/_rels/document.xml.rels',
    theme
      ? withoutTheme.replace(
          '</Relationships>',
          '<Relationship Id="rTheme" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/></Relationships>',
        )
      : withoutTheme,
  )
  if (theme)
    zip.file(
      'word/theme/theme1.xml',
      buildThemeXml(
        { major: 'Calibri Light', minor: 'Calibri', eastAsia: '等线' },
        DEFAULT_THEME_COLORS,
      ),
    )
  else zip.remove('word/theme/theme1.xml')
  zip.file('custom/untouched.xml', '<keep unknown="true">unchanged</keep>')
  return zip.generateAsync({ type: 'uint8array' })
}
