import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { join } from 'node:path'
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml'
const W15 = 'http://schemas.microsoft.com/office/word/2012/wordml'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
export async function protectedAnchorsFixture(empty = false) {
  const zip = await JSZip.loadAsync(
    readFileSync(
      join(
        import.meta.dirname,
        '../vendor/apps/docs/tests/pagination-corpus/docx/kitchen-sink.docx',
      ),
    ),
  )
  zip.file(
    'word/settings.xml',
    `<w:settings xmlns:w="${W}"><w:documentProtection w:edit="comments" w:enforcement="1"/></w:settings>`,
  )
  zip.file(
    'word/document.xml',
    `<w:document xmlns:w="${W}" xmlns:x="urn:mimir-anchor-keep" xmlns:r="${R}"><w:body><w:p x:keep="paragraph"><w:pPr><w:spacing w:after="120"/><x:opaque value="untouched"/></w:pPr><w:r x:keep="rich-run"><w:rPr><w:b/><w:color w:val="345678"/><x:format value="keep"/></w:rPr><w:t x:keep="text" xml:space='default'>普通单段可以添加批注</w:t></w:r></w:p><w:p>${empty ? '' : '<w:commentRangeStart w:id="0"/>'}<w:r><w:rPr><w:i/></w:rPr><w:t>已有讨论</w:t></w:r>${empty ? '' : '<w:commentRangeEnd w:id="0"/><w:r x:keep="reference-shell"><w:rPr><w:vanish/></w:rPr><w:commentReference w:id="0"/></w:r>'}<w:r><w:t xml:space="preserve"> 其他文字</w:t></w:r></w:p><w:p>${empty ? '' : '<w:commentRangeStart w:id="2"/>'}<w:hyperlink r:id="link"><w:r><w:t>复杂超链接目标</w:t></w:r></w:hyperlink>${empty ? '' : '<w:commentRangeEnd w:id="2"/><w:r><w:commentReference w:id="2"/></w:r>'}</w:p><w:p><w:r x:keep="first"><w:rPr><w:b/></w:rPr><w:t>富格式</w:t></w:r><w:r x:keep="second"><w:rPr><w:i/></w:rPr><w:t xml:space="preserve"> 中文🙂 尾部</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:bottom="1440" w:left="1440" w:right="1440"/></w:sectPr></w:body></w:document>`,
  )
  zip.file(
    'word/_rels/document.xml.rels',
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="settings" Type="${R}/settings" Target="settings.xml"/><Relationship Id="link" Type="${R}/hyperlink" Target="https://example.com" TargetMode="External"/>${empty ? '' : `<Relationship Id="comments" Type="${R}/comments" Target="comments.xml"/><Relationship Id="extended" Type="http://schemas.microsoft.com/office/2011/relationships/commentsExtended" Target="commentsExtended.xml"/>`}</Relationships>`,
  )
  if (!empty) {
    zip.file(
      'word/comments.xml',
      `<w:comments xmlns:w="${W}" xmlns:w14="${W14}" xmlns:x="urn:mimir-anchor-keep"><w:comment w:id="0" w:author="原作者" x:keep="root"><w:p w14:paraId="11110001"><w:r><w:rPr><w:b/></w:rPr><w:t>可删除的原生讨论</w:t></w:r></w:p></w:comment><w:comment w:id="1" w:author="回复者"><w:p w14:paraId="11110002"><w:r><w:t>单独可删除的回复</w:t></w:r></w:p></w:comment><w:comment w:id="2" w:author="复杂锚点"><w:p w14:paraId="11110003"><w:r><w:t>复杂锚点原件保留</w:t></w:r></w:p></w:comment></w:comments>`,
    )
    zip.file(
      'word/commentsExtended.xml',
      `<w15:commentsEx xmlns:w15="${W15}"><w15:commentEx w15:paraId="11110001" w15:done="0"/><w15:commentEx w15:paraId="11110002" w15:paraIdParent="11110001" w15:done="0"/><w15:commentEx w15:paraId="11110003" w15:done="0"/></w15:commentsEx>`,
    )
  }
  let types = await zip.file('[Content_Types].xml')!.async('string')
  types = types.replace(
    /<Override\b[^>]*PartName="\/word\/comments(?:Extended)?\.xml"[^>]*\/>/g,
    '',
  )
  if (!empty)
    types = types.replace(
      '</Types>',
      '<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/><Override PartName="/word/commentsExtended.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtended+xml"/></Types>',
    )
  zip.file('[Content_Types].xml', types)
  zip.file(
    'customXml/mimir-anchor-opaque.xml',
    '<opaque preserve="byte-for-byte">中文 &amp; unknown</opaque>',
  )
  return zip.generateAsync({ type: 'uint8array' })
}
