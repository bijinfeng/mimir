import type { Slide } from '../vendor/packages/pptx-engine/src/types.js'
import { type PptxArchive, relsPathFor, resolveTarget } from './pptx-archive.js'
import { patchSlideXml } from './pptx-save.js'

const SLIDE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide'
const LAYOUT_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout'
const SLIDE_CONTENT = 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml'
const encoder = new TextEncoder()

export interface PptxPage {
  path: string
  slideId: number
  relationId: string
  idTag: string
  relsXml?: string
}

export type EntryPatch = Map<string, Uint8Array | null>

function attribute(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}\\s*=(?:"([^"]*)"|'([^']*)')`).exec(tag)?.slice(1).find(Boolean)
}

function xmlPart(archive: PptxArchive, path: string): string {
  const xml = archive.readText(path)
  if (!xml) throw new Error(`PPTX 缺少必要部件：${path}`)
  return xml
}

/** Retain original tags so moving a page changes only order, not unknown attributes. */
export function readPptxPages(archive: PptxArchive): PptxPage[] {
  const presentation = xmlPart(archive, 'ppt/presentation.xml')
  const list = /<p:sldIdLst\b[^>]*>([\s\S]*?)<\/p:sldIdLst>/.exec(presentation)
  if (!list) throw new Error('PPTX 幻灯片列表结构无法安全编辑')
  const tags = [...list[1]!.matchAll(/<p:sldId\b[^>]*\/>/g)].map((m) => m[0])
  if (tags.length === 0 || list[1]!.replace(/<p:sldId\b[^>]*\/>/g, '').trim()) {
    throw new Error('PPTX 幻灯片列表含不支持的结构')
  }
  const rels = archive.readRels('ppt/presentation.xml')
  return tags.map((tag) => {
    const slideId = Number(attribute(tag, 'id'))
    const relationId = attribute(tag, 'r:id')
    const rel = relationId ? rels.get(relationId) : undefined
    if (!Number.isSafeInteger(slideId) || !relationId || !rel || !rel.type.endsWith('/slide')) {
      throw new Error('PPTX 幻灯片标识或关系无效，无法安全编辑')
    }
    const path = resolveTarget('ppt/presentation.xml', rel.target)
    if (!archive.has(path)) throw new Error(`PPTX 幻灯片部件缺失：${path}`)
    return { path, slideId, relationId, idTag: tag }
  })
}

export function assertPresentationStructureSafe(archive: PptxArchive): void {
  const xml = xmlPart(archive, 'ppt/presentation.xml')
  if (/<(?:[\w.-]+:)?(?:custShowLst|sectionLst)\b/.test(xml)) {
    throw new Error('这份 PPTX 含自定义放映或分节，暂不能安全调整幻灯片')
  }
}

export function assertPageCanDetach(archive: PptxArchive, page: PptxPage): void {
  const relsXml = page.relsXml ?? archive.readText(relsPathFor(page.path)) ?? ''
  for (const tag of relsXml.match(/<Relationship\b[^>]*>/g) ?? []) {
    const type = attribute(tag, 'Type') ?? ''
    if (/(?:notesSlide|comments|comment|threadedComment|person|handoutMaster)$/.test(type)) {
      throw new Error('这张幻灯片含备注或批注，暂不能安全复制或删除')
    }
  }
}

function partPathFromRelsPath(path: string): string | null {
  const match = /^(.*)\/_rels\/([^/]+)\.rels$/.exec(path)
  return match ? `${match[1]}/${match[2]}` : null
}

export function assertNoIncomingSlideReferences(
  archive: PptxArchive,
  target: PptxPage,
  pages: readonly PptxPage[],
): void {
  const pending = new Map(
    pages.filter((p) => p.relsXml).map((p) => [relsPathFor(p.path), p.relsXml!]),
  )
  for (const path of [...archive.entryNames(), ...pending.keys()]) {
    if (!path.endsWith('.rels') || path === 'ppt/_rels/presentation.xml.rels') continue
    const source = partPathFromRelsPath(path)
    if (!source || source === target.path) continue
    const xml = pending.get(path) ?? archive.readText(path) ?? ''
    for (const tag of xml.match(/<Relationship\b[^>]*>/g) ?? []) {
      if (attribute(tag, 'TargetMode') === 'External') continue
      const targetPath = attribute(tag, 'Target')
      if (targetPath && resolveTarget(source, targetPath) === target.path) {
        throw new Error('其他幻灯片或部件链接到此页，暂不能安全删除')
      }
    }
  }
}

export function allocatePptxPage(archive: PptxArchive, pages: readonly PptxPage[]): PptxPage {
  const usedPaths = new Set([...archive.entryNames(), ...pages.map((p) => p.path)])
  let part = 1
  while (
    usedPaths.has(`ppt/slides/slide${part}.xml`) ||
    usedPaths.has(relsPathFor(`ppt/slides/slide${part}.xml`))
  ) {
    part += 1
  }
  const path = `ppt/slides/slide${part}.xml`
  const usedIds = new Set(pages.map((p) => p.slideId))
  let slideId = Math.max(255, ...usedIds) + 1
  while (usedIds.has(slideId)) slideId += 1
  const usedRels = new Set([
    ...archive.readRels('ppt/presentation.xml').keys(),
    ...pages.map((p) => p.relationId),
  ])
  let relation = 1
  while (usedRels.has(`rId${relation}`)) relation += 1
  const relationId = `rId${relation}`
  return { path, slideId, relationId, idTag: `<p:sldId id="${slideId}" r:id="${relationId}"/>` }
}

export const BLANK_SLIDE_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
  '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/>' +
  '<p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr>' +
  '<a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>' +
  '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm>' +
  '</p:grpSpPr></p:spTree></p:cSld>' +
  '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'

export function blankSlideRels(layoutPath: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    `<Relationship Id="rId1" Type="${LAYOUT_REL}" Target="/${layoutPath}"/>` +
    '</Relationships>'
  )
}

/** Build a small overlay; unrelated archive entries retain their original bytes. */
export function buildPptxStructurePatch(
  archive: PptxArchive,
  baseline: readonly PptxPage[],
  pages: readonly PptxPage[],
  slides: readonly Slide[],
): EntryPatch {
  assertPresentationStructureSafe(archive)
  if (pages.length !== slides.length || pages.some((p, i) => p.path !== slides[i]?.path)) {
    throw new Error('PPTX 幻灯片顺序与编辑模型不一致')
  }
  const patch: EntryPatch = new Map()
  const pres = xmlPart(archive, 'ppt/presentation.xml')
  const listRe = /(<p:sldIdLst\b[^>]*>)[\s\S]*?(<\/p:sldIdLst>)/
  if (!listRe.test(pres)) throw new Error('PPTX 幻灯片列表结构无法安全编辑')
  patch.set(
    'ppt/presentation.xml',
    encoder.encode(pres.replace(listRe, `$1${pages.map((p) => p.idTag).join('')}$2`)),
  )

  const baselineByPath = new Map(baseline.map((p) => [p.path, p]))
  const currentPaths = new Set(pages.map((p) => p.path))
  const removed = baseline.filter((p) => !currentPaths.has(p.path))
  const added = pages.filter((p) => !baselineByPath.has(p.path))
  if (currentPaths.size !== pages.length) throw new Error('PPTX 幻灯片部件路径重复')
  for (const page of removed) {
    assertPageCanDetach(archive, page)
    assertNoIncomingSlideReferences(archive, page, pages)
  }

  if (removed.length || added.length) {
    const relPath = 'ppt/_rels/presentation.xml.rels'
    let relXml = xmlPart(archive, relPath)
    for (const page of removed) {
      const tag = [...relXml.matchAll(/<Relationship\b[^>]*\/>/g)].find(
        (m) => attribute(m[0], 'Id') === page.relationId,
      )?.[0]
      if (!tag) throw new Error(`PPTX 幻灯片关系丢失：${page.relationId}`)
      relXml = relXml.replace(tag, '')
      patch.set(page.path, null)
      if (archive.has(relsPathFor(page.path))) patch.set(relsPathFor(page.path), null)
    }
    const relationTags = added
      .map(
        (page) =>
          `<Relationship Id="${page.relationId}" Type="${SLIDE_REL}" Target="slides/${page.path.split('/').at(-1)}"/>`,
      )
      .join('')
    if (!relXml.includes('</Relationships>')) throw new Error('PPTX 演示文稿关系结构无效')
    patch.set(
      relPath,
      encoder.encode(relXml.replace('</Relationships>', `${relationTags}</Relationships>`)),
    )

    let contentTypes = xmlPart(archive, '[Content_Types].xml')
    for (const page of removed) {
      const tag = [...contentTypes.matchAll(/<Override\b[^>]*\/>/g)].find(
        (m) => attribute(m[0], 'PartName') === `/${page.path}`,
      )?.[0]
      if (!tag) throw new Error(`PPTX 幻灯片内容类型丢失：${page.path}`)
      contentTypes = contentTypes.replace(tag, '')
    }
    const addedTypes = added
      .map((page) => `<Override PartName="/${page.path}" ContentType="${SLIDE_CONTENT}"/>`)
      .join('')
    if (!contentTypes.includes('</Types>')) throw new Error('PPTX 内容类型表结构无效')
    patch.set(
      '[Content_Types].xml',
      encoder.encode(contentTypes.replace('</Types>', `${addedTypes}</Types>`)),
    )
    for (const page of added) {
      const slide = slides.find((s) => s.path === page.path)!
      patch.set(page.path, encoder.encode(patchSlideXml(slide)))
      if (!page.relsXml) throw new Error(`PPTX 新幻灯片缺少关系表：${page.path}`)
      patch.set(relsPathFor(page.path), encoder.encode(page.relsXml))
    }
  }
  return patch
}

export function pageSequenceChanged(a: readonly PptxPage[], b: readonly PptxPage[]): boolean {
  return a.length !== b.length || a.some((page, index) => page.path !== b[index]?.path)
}
