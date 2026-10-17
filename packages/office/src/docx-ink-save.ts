import JSZip from 'jszip'
import type { SaveOptions } from '../vendor/packages/docx-engine/src/patch.js'
import type { ParsedDoc } from '../vendor/packages/docx-engine/src/types.js'
import type { SavePlan } from '../vendor/apps/docs/src/renderer/editor/convert.js'
import {
  findInkRuns,
  injectInkRunsIntoParagraph,
  anchoredInkRunXml,
  stripInkRuns,
} from '../vendor/packages/docx-engine/src/ink.js'
import { splitXmlChildren } from '../vendor/packages/docx-engine/src/generate.js'
import type { PmDocJson } from './docx.js'
import { BoundedZip } from './zip-bounds.js'
import {
  INK_ANCHOR,
  INK_ATTR,
  INK_PARAGRAPHS,
  MAX_INK_STROKES,
  decodeInkPayload,
  encodeInkPayload,
  inkAnnotations,
  inkBounds,
  rasterizeInk,
} from './docx-ink-model.js'

function editableParsedInk(parsed: ParsedDoc, ordinal: number) {
  const ink = parsed.inks[ordinal]!
  const stroke = decodeInkPayload(ink.payload)
  if (!stroke) return null
  const bounds = inkBounds(stroke)
  if (
    [
      bounds.x - ink.offsetXPx,
      bounds.y - ink.offsetYPx,
      bounds.width - ink.widthPx,
      bounds.height - ink.heightPx,
    ].some((value) => Math.abs(value) > 0.11)
  )
    return null
  const siblings = parsed.inks
    .slice(0, ordinal)
    .filter((item) => item.anchorIndex === ink.anchorIndex).length
  const block = parsed.blocks.find((item) => item.docxIndex === ink.anchorIndex)
  const run = findInkRuns(block?.originalXml ?? '')[siblings]
  const id = run && /<wp:docPr\b[^>]*\bid="(\d+)"/.exec(run.xml)?.[1]
  if (
    !run ||
    !run.embedRId ||
    !id ||
    run.xml !==
      anchoredInkRunXml({ ...ink, payload: ink.payload ?? undefined }, run.embedRId, Number(id))
  )
    return null
  return stroke
}
const unsafeResources = new WeakMap<ParsedDoc, string>()
async function inspectInkResources(bytes: Uint8Array, parsed: ParsedDoc) {
  const zip = await BoundedZip.open(bytes)
  const owned = new Set(
    zip.list('word/media/').filter((path) => /^word\/media\/aidocsink\d+\.png$/.test(path)),
  )
  if (!owned.size) return
  const document = (await zip.readText('word/document.xml')) ?? ''
  const nonInk = stripInkRuns(document)
  const ownIds = new Set(
    parsed.blocks.flatMap((block) =>
      findInkRuns(block.originalXml ?? '').flatMap((run) => (run.embedRId ? [run.embedRId] : [])),
    ),
  )
  const exclusivelyOwned = new Set<string>()
  for (const relPath of zip.list().filter((path) => path.endsWith('.rels'))) {
    const sourcePath =
      relPath === '_rels/.rels' ? '' : relPath.replace(/\/_rels\//, '/').replace(/\.rels$/, '')
    for (const tag of (await zip.readText(relPath))?.match(/<Relationship\b[^>]*\/>/g) ?? []) {
      const target = /\bTarget="([^"]+)"/.exec(tag)?.[1],
        id = /\bId="([^"]+)"/.exec(tag)?.[1]
      if (!target || !id) continue
      const path = new URL(target, `https://office.invalid/${sourcePath}`).pathname.slice(1)
      if (!owned.has(path)) continue
      if (
        relPath !== 'word/_rels/document.xml.rels' ||
        !ownIds.has(id) ||
        nonInk.includes(`="${id}"`)
      ) {
        unsafeResources.set(parsed, '原件墨迹与其他图片共享资源，当前无法安全编辑笔迹')
        return
      }
      exclusivelyOwned.add(path)
    }
  }
  if ([...owned].some((path) => !exclusivelyOwned.has(path)))
    unsafeResources.set(parsed, '原件包含无法核对归属的墨迹图片，当前无法安全编辑笔迹')
}
export async function initializeDocxInk(doc: PmDocJson, parsed: ParsedDoc, bytes: Uint8Array) {
  await inspectInkResources(bytes, parsed)
  const anchors = new Map<number, string>()
  for (const [i, node] of (doc.content ?? []).entries()) {
    if (
      INK_PARAGRAPHS.has(node.type) ||
      parsed.inks.some((ink) => ink.anchorIndex === node.attrs?.docxIndex)
    ) {
      node.attrs = { ...node.attrs, [INK_ANCHOR]: `source-${i}` }
      if (typeof node.attrs.docxIndex === 'number') anchors.set(node.attrs.docxIndex, `source-${i}`)
    }
  }
  doc.attrs = {
    ...doc.attrs,
    [INK_ATTR]: parsed.inks.map((ink, i) => ({
      id: `source-ink-${i}`,
      anchor: anchors.get(ink.anchorIndex) ?? `unsupported-${i}`,
      stroke: editableParsedInk(parsed, i),
      image: {
        dataUrl: ink.dataUrl,
        x: ink.offsetXPx,
        y: ink.offsetYPx,
        width: ink.widthPx,
        height: ink.heightPx,
      },
    })),
  }
}
export function docxInkUnavailable(doc: PmDocJson, parsed: ParsedDoc): string | null {
  const unsafe = unsafeResources.get(parsed)
  if (unsafe) return unsafe
  if (
    parsed.inks.some(
      (ink) =>
        doc.content?.find((node) => node.attrs?.docxIndex === ink.anchorIndex)?.type === 'docTable',
    )
  )
    return '表格内复杂墨迹暂未显示；原件完整保留，绘图已禁用'
  if (
    parsed.inks.some(
      (ink) =>
        !INK_PARAGRAPHS.has(
          doc.content?.find((node) => node.attrs?.docxIndex === ink.anchorIndex)?.type ?? '',
        ),
    )
  )
    return '原件墨迹位于复杂段落结构，当前无法安全编辑'
  if (inkAnnotations(doc).some((ink) => !ink.stroke))
    return '原件包含无法识别的墨迹，仅保留显示；请在原编辑器中处理后再绘图'
  for (const ink of parsed.inks) {
    const block = parsed.blocks.find((candidate) => candidate.docxIndex === ink.anchorIndex)
    if (!block?.originalXml?.startsWith('<w:p>') && !/^<w:p\s/.test(block?.originalXml ?? ''))
      return '原件墨迹位于复杂段落结构，当前无法安全编辑'
  }
  return null
}
function anchorBlocks(doc: PmDocJson, plan: SavePlan): Map<string, number> {
  const nodes = doc.content ?? []
  if (nodes.length !== plan.saveBlocks.length) throw new Error('当前正文结构无法可靠保存段落墨迹')
  const result = new Map<string, number>()
  nodes.forEach((node, i) => {
    const anchor = node.attrs?.[INK_ANCHOR]
    if (typeof anchor !== 'string') return
    if (result.has(anchor)) throw new Error('段落墨迹锚点重复，请重新打开绘图工具')
    const idx = node.attrs?.docxIndex
    if (
      typeof idx === 'number' &&
      nodes.filter((candidate) => candidate.attrs?.docxIndex === idx).length === 1 &&
      plan.saveBlockIndexByDocx.has(idx) &&
      plan.saveBlockIndexByDocx.get(idx) !== i
    )
      throw new Error('段落墨迹保存位置不明确')
    result.set(anchor, i)
  })
  return result
}
export function docxInkSaveOptions(
  doc: PmDocJson,
  baseline: PmDocJson,
  parsed: ParsedDoc,
  plan: SavePlan,
  options: SaveOptions,
): SaveOptions {
  if (JSON.stringify(inkAnnotations(doc)) === JSON.stringify(inkAnnotations(baseline)))
    return options
  const reason = docxInkUnavailable(baseline, parsed)
  if (reason) throw new Error(reason)
  const anchors = anchorBlocks(doc, plan),
    annotations = inkAnnotations(doc)
  if (annotations.length > MAX_INK_STROKES) throw new Error('笔迹超过500笔限制')
  return {
    ...options,
    inks: annotations.flatMap((ink) => {
      const blockIndex = anchors.get(ink.anchor)
      if (blockIndex === undefined) return [] // deleting an anchor deletes its visible ink; undo restores it
      const node = doc.content![blockIndex]!
      if (!INK_PARAGRAPHS.has(node.type) || !ink.stroke)
        throw new Error('墨迹必须锚定可编辑正文段落')
      const canonical = decodeInkPayload(encodeInkPayload(ink.stroke))!
      const image = rasterizeInk(canonical)
      return [
        {
          blockIndex,
          base64: image.base64,
          widthPx: image.width,
          heightPx: image.height,
          offsetXPx: image.x,
          offsetYPx: image.y,
          payload: encodeInkPayload(canonical),
        },
      ]
    }),
  }
}
/** Text regeneration otherwise loses untouched anchored runs. Preserve their exact XML,
 * original relationships and media; do not invoke the engine's authoritative ink rewrite. */
export async function preserveDocxInk(
  bytes: Uint8Array,
  sourceBytes: Uint8Array,
  edited: PmDocJson,
  baseline: PmDocJson,
  parsed: ParsedDoc,
  plan: SavePlan,
  options: SaveOptions,
): Promise<Uint8Array> {
  if (options.inks !== undefined || !parsed.inks.length) return bytes
  const bounded = await BoundedZip.open(bytes),
    xml = await bounded.readText('word/document.xml')
  if (!xml) throw new Error('缺少 DOCX 正文')
  const body = /<w:body\b[^>]*>([\s\S]*?)<\/w:body>/.exec(xml)
  if (!body) throw new Error('无法定位正文墨迹')
  const children = splitXmlChildren(body[1]!)
  const hiddenCount = parsed.blocks.filter(
    (block) => block.hidden && block.docxIndex !== null,
  ).length
  const reliable =
    children.length === plan.saveBlocks.length + hiddenCount &&
    (edited.content ?? []).length === plan.saveBlocks.length
  const changed = children.map((child) => child.xml)
  const required = new Set<string>()
  for (const index of new Set(parsed.inks.map((ink) => ink.anchorIndex))) {
    const original = parsed.blocks.find((block) => block.docxIndex === index)?.originalXml
    if (!original) throw new Error('无法保留原件段落墨迹')
    const runs = findInkRuns(original)
    const anchor = baseline.content?.find((node) => node.attrs?.docxIndex === index)?.attrs?.[
      INK_ANCHOR
    ]
    const at = edited.content?.findIndex((node) => node.attrs?.[INK_ANCHOR] === anchor) ?? -1
    if (!reliable) {
      if (runs.every((run) => xml.includes(run.xml))) continue
      throw new Error('复杂正文结构无法可靠保留段落墨迹')
    }
    // A pasted paragraph can consume the source docxIndex before the original.
    // The PM-only unique anchor determines which paragraph owns the original ink.
    for (const run of runs) {
      for (let i = 0; i < changed.length; i++) {
        if (i !== at && changed[i]!.includes(run.xml))
          changed[i] = changed[i]!.replaceAll(run.xml, '')
      }
      if (at < 0) continue
      if (run.embedRId) required.add(run.embedRId)
      if (changed[at]?.includes(run.xml)) continue
      const next = injectInkRunsIntoParagraph(changed[at] ?? '', run.xml)
      if (!next) throw new Error('复杂段落墨迹无法安全保留，请在原编辑器处理')
      changed[at] = next
    }
  }
  const bodyChanged = !changed.every((value, i) => value === children[i]!.xml)
  // Preserve whitespace and duplicate paragraph bytes by replacing by position.
  let inner = '',
    cursor = 0
  children.forEach((child, i) => {
    const at = body[1]!.indexOf(child.xml, cursor)
    inner += body[1]!.slice(cursor, at) + changed[i]!
    cursor = at + child.xml.length
  })
  inner += body[1]!.slice(cursor)
  const zip = await JSZip.loadAsync(bytes)
  const source = await BoundedZip.open(sourceBytes)
  const relPath = 'word/_rels/document.xml.rels'
  const oldRels = await source.readText(relPath)
  let currentRels = await bounded.readText(relPath)
  if (!oldRels || !currentRels) throw new Error('无法恢复原笔迹图片关系')
  const savedRels = currentRels,
    restoredRels: string[] = []
  const tags = oldRels.match(/<Relationship\b[^>]*\/>/g) ?? []
  const requiredPaths = new Set<string>()
  let mediaChanged = false
  for (const [index, tag] of tags.entries()) {
    const id = /\bId="([^"]+)"/.exec(tag)?.[1]
    if (!id || !required.has(id)) continue
    if (!currentRels.includes(tag)) {
      restoredRels.push(tag)
      if (
        (currentRels.match(/<Relationship\b[^>]*\/>/g) ?? []).some(
          (current) => /\bId="([^"]+)"/.exec(current)?.[1] === id,
        )
      )
        throw new Error('原笔迹图片关系已被替换')
      const following = tags.slice(index + 1).find((candidate) => currentRels!.includes(candidate))
      currentRels = following
        ? currentRels.replace(following, () => tag + following)
        : currentRels.replace('</Relationships>', tag + '</Relationships>')
    }
    const target = /\bTarget="([^"]+)"/.exec(tag)?.[1]
    if (!target || !/^media\/[\w.-]+$/.test(target)) throw new Error('原笔迹媒体路径无法安全恢复')
    const path = `word/${target}`
    requiredPaths.add(path)
    if (!zip.file(path)) {
      const data = await source.read(path)
      if (!data) throw new Error('原笔迹图片缺失')
      zip.file(path, data)
      mediaChanged = true
    }
  }
  // If cleanup only removed these declarations, retain all original whitespace.
  if (restoredRels.reduce((value, tag) => value.replace(tag, ''), oldRels) === savedRels)
    currentRels = oldRels
  const relsChanged = currentRels !== savedRels
  // The engine cleanup also removes per-part content-type overrides for the
  // temporarily unreferenced PNGs. Restore their exact declarations with media.
  const typesPath = '[Content_Types].xml',
    oldTypes = await source.readText(typesPath),
    savedTypes = await bounded.readText(typesPath)
  if (!oldTypes || !savedTypes) throw new Error('无法恢复原笔迹图片类型')
  let currentTypes = savedTypes
  const overrides = oldTypes.match(/<Override\b[^>]*\/>/g) ?? [],
    restoredOverrides: string[] = []
  for (const [index, tag] of overrides.entries()) {
    const name = /\bPartName="([^"]+)"/.exec(tag)?.[1]
    if (!name || !requiredPaths.has(name.replace(/^\//, '')) || currentTypes.includes(tag)) continue
    restoredOverrides.push(tag)
    if (
      (currentTypes.match(/<Override\b[^>]*\/>/g) ?? []).some(
        (current) => /\bPartName="([^"]+)"/.exec(current)?.[1] === name,
      )
    )
      throw new Error('原笔迹图片类型已被替换')
    const following = overrides
      .slice(index + 1)
      .find((candidate) => currentTypes.includes(candidate))
    currentTypes = following
      ? currentTypes.replace(following, () => tag + following)
      : currentTypes.replace('</Types>', () => tag + '</Types>')
  }
  if (restoredOverrides.reduce((value, tag) => value.replace(tag, ''), oldTypes) === savedTypes)
    currentTypes = oldTypes
  const typesChanged = currentTypes !== savedTypes
  if (!bodyChanged && !relsChanged && !mediaChanged && !typesChanged) return bytes
  if (relsChanged) zip.file(relPath, currentRels, { date: zip.file(relPath)!.date })
  if (typesChanged) zip.file(typesPath, currentTypes, { date: zip.file(typesPath)!.date })
  zip.file(
    'word/document.xml',
    xml.replace(body[0], () => body[0].replace(body[1]!, () => inner)),
    { date: zip.file('word/document.xml')!.date },
  )
  return zip.generateAsync({ type: 'uint8array' })
}
