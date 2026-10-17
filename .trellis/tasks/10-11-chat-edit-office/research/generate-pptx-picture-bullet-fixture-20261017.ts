import { writeFileSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { createBlankPptx } from '../../../../packages/office/vendor/packages/pptx-engine/src/blank.js'
import { openPptx, savePptx, groupChildSlices } from '../../../../packages/office/vendor/packages/pptx-engine/src/index.js'
import { runTxn } from '../../../../packages/office/vendor/packages/pptx-ops/src/ops/index.js'
import { pptxSelectionContexts } from '../../../../packages/office/src/editors/pptx-selection.js'
const JSZip = createRequire(new URL('../../../../packages/office/package.json', import.meta.url))('jszip') as typeof import('jszip')
const opened = await openPptx(await createBlankPptx())
const names = ['顶层甲', '顶层乙', '组员甲', '组员乙', '原件保留对象']
const result = runTxn(opened, { isolation: 'atomic', ops: names.map((text,index) => ({
  op: 'addElement', target: { slide: 0 }, kind: 'rect',
  offset: { x: index < 2 ? 700000 + index * 4000000 : 700000 + (index - 2) * 2800000, y: index < 2 ? 700000 : 3000000, cx: 2400000, cy: 1500000 },
  paragraphs: [{ runs: [{ text, fontSize: 24, bold: true }] }, { runs: [{ text: `第二段 ${index + 1}`, fontSize: 18 }] }],
  fill: '#F0F4F8', stroke: { color: '#7A8899', widthPt: 1 },
})) })
if (!result.applied) throw new Error(JSON.stringify(result.failures))
const slide = opened.deck.slides[0]!
const members = slide.elements.slice(2,4)
if (!runTxn(opened, { isolation: 'atomic', ops: [{ op: 'groupElements', target: { slide: 0 }, els: members.map((item) => item.id) }] }).applied) throw new Error('Grouping failed')
const zip = await JSZip.loadAsync(await savePptx(opened))
const xml = await zip.file(slide.path)!.async('string')
zip.file(slide.path, xml.replace(/<a:p>/g, '<a:p><a:pPr defTabSz="777777" hangingPunct="0"><a:tabLst><a:tab pos="333" algn="ctr"/></a:tabLst><a:extLst><a:ext uri="opaque"><m:keep xmlns:m="urn:mimir"/></a:ext></a:extLst></a:pPr>'))
zip.file('customXml/mimir-picture-bullet-opaque.xml', '<m:proof xmlns:m="urn:mimir" keep="exact">非目标原件证据</m:proof>')
const bytes = await zip.generateAsync({ type: 'uint8array' })
const path = '/tmp/mimir-pptx-picture-bullets-browser-20261017.pptx'
writeFileSync(path, bytes)
const read = await openPptx(bytes)
const contexts = pptxSelectionContexts(read.deck.slides[0]!.elements)
const sha = (input: Uint8Array | string) => createHash('sha256').update(input).digest('hex')
const evidence = { path, sha256: sha(bytes), parts: Object.fromEntries(await Promise.all(Object.entries(zip.files).filter(([,entry]) => !entry.dir).map(async ([name,entry]) => [name, sha(await entry.async('uint8array'))]))), elements: contexts.map((context) => ({ ref: context.ref, group: context.group, depth: context.depth, name: context.element.name, nvId: context.element.nvId, xmlSha256: sha(context.group ? groupChildSlices(contexts.find((item) => item.ref === context.group)!.element.anchor.originalXml).find((slice) => slice.nvId === context.element.nvId)!.xml : context.element.anchor.originalXml) })) }
writeFileSync('/tmp/mimir-pptx-picture-bullets-browser-20261017.json', JSON.stringify(evidence, null, 2))
for (const ext of ['png', 'jpg']) writeFileSync(`/tmp/mimir-pptx-picture-bullet-20261017.${ext}`, readFileSync(`packages/office/tests/fixtures/pptx-images/picture.${ext}`))
console.log(JSON.stringify(evidence))
