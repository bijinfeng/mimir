/** Reproducible, small-paper DOCX for browser footnote reflow and section-endnote pagination. */
import JSZip from 'jszip'
import { readFile, writeFile } from 'node:fs/promises'
const source = new URL(
  '../vendor/apps/docs/tests/pagination-corpus/docx/06-with-footnotes.docx',
  import.meta.url,
)
const zip = await JSZip.loadAsync(await readFile(source))
const escape = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
const para = (text, ref = '') =>
  `<w:p><w:pPr><w:spacing w:after="80" w:line="280" w:lineRule="auto"/></w:pPr><w:r><w:t>${escape(text)}</w:t></w:r>${ref}</w:p>`
const sect = (pos) =>
  `<w:sectPr><w:endnotePr><w:pos w:val="${pos}"/></w:endnotePr><w:pgSz w:w="9000" w:h="6000"/><w:pgMar w:top="600" w:right="900" w:bottom="600" w:left="900"/></w:sectPr>`
const before = Array.from({ length: 9 }, (_, i) =>
  para(`第一节正文 ${i + 1}：固定纸张尺寸，脚注须参与容量计算。`),
).join('')
const reference = para(
  '第一节末尾引用，下面的尾注必须出现在第二节正文之前。',
  '<w:r><w:footnoteReference w:id="1"/></w:r><w:r><w:endnoteReference w:id="1"/></w:r>',
)
const after = Array.from({ length: 8 }, (_, i) =>
  para(
    `第二节正文 ${i + 1}：这一节只能排在第一节尾注之后。`,
    i === 2 ? '<w:r><w:footnoteReference w:id="2"/></w:r>' : '',
  ),
).join('')
const body =
  before +
  reference +
  `<w:p><w:pPr>${sect('sectEnd')}</w:pPr></w:p>` +
  after +
  para('文末尾注引用。', '<w:r><w:endnoteReference w:id="2"/></w:r>') +
  sect('docEnd')
const original = await zip.file('word/document.xml').async('string')
zip.file(
  'word/document.xml',
  original.replace(/<w:body>[\s\S]*<\/w:body>/, `<w:body>${body}</w:body>`),
)
const root = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const firstFootnote = process.argv.includes('--oversized')
  ? Array.from({ length: 36 }, (_, i) =>
      para(`长脚注续行 ${i + 1}：注释超过一张纸时仍应按原纸高续到下一页。`),
    ).join('')
  : para('脚注一：这段脚注有多行内容，需要正文在既定纸高内为它留出位置。'.repeat(4))
zip.file(
  'word/footnotes.xml',
  `<w:footnotes ${root}><w:footnote w:id="1">${firstFootnote}</w:footnote><w:footnote w:id="2">${para('脚注二：第二节引用的注释必须保留在对应页。'.repeat(2))}</w:footnote></w:footnotes>`,
)
zip.file(
  'word/endnotes.xml',
  `<w:endnotes ${root}><w:endnote w:id="1">${Array.from({ length: 24 }, (_, i) => para(`节尾注第 ${i + 1} 行：保留长尾注正文，分页后继续显示，不延长纸张。`)).join('')}</w:endnote><w:endnote w:id="2">${para('文末尾注正文：只位于第二节末尾。')}</w:endnote></w:endnotes>`,
)
const rels = await zip.file('word/_rels/document.xml.rels').async('string')
zip.file(
  'word/_rels/document.xml.rels',
  rels.replace(
    '</Relationships>',
    '<Relationship Id="mimirEndnotesFixture" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes" Target="endnotes.xml"/></Relationships>',
  ),
)
const types = await zip.file('[Content_Types].xml').async('string')
zip.file(
  '[Content_Types].xml',
  types.replace(
    '</Types>',
    '<Override PartName="/word/endnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml"/></Types>',
  ),
)
const output = process.argv[2] ?? '/tmp/mimir-docx-notes-pagination.docx'
await writeFile(output, await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }))
process.stdout.write(`${output}\n`)
