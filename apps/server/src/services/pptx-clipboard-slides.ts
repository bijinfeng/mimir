import {
  copySlide,
  pasteSlide,
  type OpenedPptx,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/index.js'
import {
  collectPart,
  importClipboardParts,
  type SlideBundle,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/slide-transfer.js'
import {
  relsPathFor,
  resolveTarget,
  type Relationship,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/zip.js'

const PRES = 'ppt/presentation.xml'
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
const escape = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
const relative = (from: string, to: string) => {
  const left = from.split('/').slice(0, -1),
    right = to.split('/')
  while (left.length && right.length && left[0] === right[0]) {
    left.shift()
    right.shift()
  }
  return [...left.map(() => '..'), ...right].join('/')
}
function relsXml(rels: readonly Relationship[]) {
  return (
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    rels
      .map(
        (rel) =>
          `<Relationship Id="${escape(rel.id)}" Type="${escape(rel.type)}" Target="${escape(rel.target)}"${rel.targetMode ? ` TargetMode="${escape(rel.targetMode)}"` : ''}/>`,
      )
      .join('') +
    '</Relationships>'
  )
}
function appendRel(opened: OpenedPptx, path: string, rel: Relationship) {
  const rels = [...opened.archive.readRels(path).values()]
  if (rels.some((item) => item.id === rel.id)) throw new Error('粘贴关系身份冲突，画布未修改')
  opened.archive.entries.set(relsPathFor(path), Buffer.from(relsXml([...rels, rel])))
}
export interface PptxSlidePacket {
  sourcePath: string
  bundle: SlideBundle
  links: { id: string; type: string; path: string }[]
  notes?: {
    path: string
    slideRel: Relationship
    backRel: Relationship
    masterPath?: string
    masterParts?: Record<string, string>
    masterRels?: Record<string, Relationship[]>
    rels: Relationship[]
    parts: Record<string, string>
    contentTypes: Record<string, string>
  }
}

/** Fail before cut: native bundle alone drops notes and does not remap slide links. */
export function preparePptxClipboardSlides(
  opened: OpenedPptx,
  indices: readonly number[],
  cut: boolean,
): PptxSlidePacket[] {
  if (
    !indices.length ||
    indices.length > 40 ||
    new Set(indices).size !== indices.length ||
    indices.some((index) => !Number.isInteger(index) || !opened.deck.slides[index])
  )
    throw new Error('请选择1–40张不同的有效幻灯片')
  if (cut && indices.length >= opened.deck.slides.length) throw new Error('至少保留一张幻灯片')
  const paths = new Set(indices.map((index) => opened.deck.slides[index]!.path))
  if (/<(?:\w+:)?(?:custShowLst|sectionLst)\b/.test(opened.archive.readText(PRES) ?? ''))
    throw new Error('含自定义放映或节的文稿暂不支持幻灯片复制剪切，请先解除关联')
  if (cut) {
    for (const slide of opened.deck.slides) {
      if (paths.has(slide.path)) continue
      for (const rel of opened.archive.readRels(slide.path).values())
        if (
          rel.targetMode !== 'External' &&
          rel.type.endsWith('/slide') &&
          paths.has(resolveTarget(slide.path, rel.target))
        )
          throw new Error('其他幻灯片仍跳转到所选页面，不能剪切，请先解除跳转')
    }
  }
  const validateGraph = (path: string, visited = new Set<string>()) => {
    if (visited.has(path)) return
    visited.add(path)
    if (!opened.archive.has(path)) throw new Error('幻灯片依赖部件缺失，未复制或剪切')
    const xml = path.endsWith('.xml') ? (opened.archive.readText(path) ?? '') : ''
    if (/<(?:\w+:)?(?:sldZoom|sectionZoom|summaryZoom|zoom)\b|ppaction:\/\/customshow/i.test(xml))
      throw new Error('缩放或自定义放映跳转暂不支持复制')
    const relationships = opened.archive.readRels(path)
    for (const match of xml.matchAll(/\br:(?:id|embed|link)=["']([^"']+)["']/g))
      if (!relationships.has(match[1]!)) throw new Error('幻灯片关系引用缺失，未复制或剪切')
    if (/aislides-3d:/.test(xml)) throw new Error('3D占位模型暂不支持页面复制，请先移除模型')
    for (const rel of relationships.values()) {
      if (/\/(?:comments|commentAuthors|threadedComment|person|slideUpdateInfo)$/.test(rel.type))
        throw new Error('含批注关联的幻灯片暂不支持复制')
      if (rel.targetMode === 'External') {
        if (!rel.type.endsWith('/hyperlink')) throw new Error('外链媒体暂不支持复制，请先嵌入媒体')
        continue
      }
      if (rel.type.endsWith('/slide')) {
        if (!paths.has(path) && !path.startsWith('ppt/notesSlides/'))
          throw new Error('依赖部件中的页面关联暂不支持复制')
        const linked = resolveTarget(path, rel.target)
        if (!paths.has(linked)) throw new Error('页面跳转目标须一起选择，复制未应用')
        continue
      }
      validateGraph(resolveTarget(path, rel.target), visited)
    }
  }
  // Validate the whole batch before constructing any payload or modifying the model.
  indices.forEach((index) => validateGraph(opened.deck.slides[index]!.path))
  return indices
    .toSorted((a, b) => a - b)
    .map((index) => {
      const slide = opened.deck.slides[index]!,
        all = [...opened.archive.readRels(slide.path).values()]
      const links = all
        .filter((rel) => rel.type.endsWith('/slide'))
        .map((rel) => ({ id: rel.id, type: rel.type, path: resolveTarget(slide.path, rel.target) }))
      const notesRel = all.find((rel) => rel.type.endsWith('/notesSlide'))
      const kept = all.filter(
        (rel) => !rel.type.endsWith('/slide') && !rel.type.endsWith('/notesSlide'),
      )
      const sourceRels = opened.archive.entries.get(relsPathFor(slide.path))
      let bundle: SlideBundle
      try {
        opened.archive.entries.set(relsPathFor(slide.path), Buffer.from(relsXml(kept)))
        const copied = copySlide(opened, index)
        if (!copied) throw new Error('幻灯片已失效')
        bundle = copied
      } finally {
        if (sourceRels) opened.archive.entries.set(relsPathFor(slide.path), sourceRels)
        else opened.archive.entries.delete(relsPathFor(slide.path))
      }
      const packet: PptxSlidePacket = { sourcePath: slide.path, bundle, links }
      if (notesRel) {
        const path = resolveTarget(slide.path, notesRel.target),
          rels = [...opened.archive.readRels(path).values()]
        const backs = rels.filter((rel) => rel.type.endsWith('/slide'))
        if (backs.length !== 1 || resolveTarget(path, backs[0]!.target) !== slide.path)
          throw new Error('备注回链无效，未复制或剪切')
        const original = opened.archive.entries.get(relsPathFor(path))
        const parts: Record<string, string> = {},
          contentTypes: Record<string, string> = {}
        try {
          opened.archive.entries.set(
            relsPathFor(path),
            Buffer.from(relsXml(rels.filter((rel) => !rel.type.endsWith('/slide')))),
          )
          collectPart(opened.archive, path, parts, contentTypes)
        } finally {
          if (original) opened.archive.entries.set(relsPathFor(path), original)
          else opened.archive.entries.delete(relsPathFor(path))
        }
        const master = rels.find((rel) => rel.type.endsWith('/notesMaster'))
        const masterParts: Record<string, string> = {}
        if (master) collectPart(opened.archive, resolveTarget(path, master.target), masterParts, {})
        packet.notes = {
          path,
          slideRel: notesRel,
          backRel: backs[0]!,
          rels: rels.filter((rel) => !rel.type.endsWith('/slide')),
          parts,
          contentTypes,
          ...(master
            ? {
                masterPath: resolveTarget(path, master.target),
                masterParts,
                masterRels: Object.fromEntries(
                  Object.keys(masterParts)
                    .filter((part) => !part.includes('/_rels/'))
                    .map((part) => [part, [...opened.archive.readRels(part).values()]]),
                ),
              }
            : {}),
        }
      }
      return packet
    })
}

export function pastePptxClipboardSlides(
  opened: OpenedPptx,
  after: number,
  packets: readonly PptxSlidePacket[],
  keepSourceFormatting: boolean,
): number[] {
  if (after < -1 || after >= opened.deck.slides.length) throw new Error('粘贴位置已失效')
  // Reusing a different notes master would silently change notes formatting.
  const existingMaster = [...opened.archive.readRels(PRES).values()].find((rel) =>
    rel.type.endsWith('/notesMaster'),
  )
  const existingPath = existingMaster ? resolveTarget(PRES, existingMaster.target) : null
  for (const packet of packets) {
    if (!packet.notes?.masterPath || !existingPath) continue
    const visited = new Set<string>()
    const sameGraph = (sourcePath: string, destPath: string): boolean => {
      const pair = `${sourcePath}:${destPath}`
      if (visited.has(pair)) return true
      visited.add(pair)
      const bytes = packet.notes!.masterParts?.[sourcePath]
      if (
        !bytes ||
        !Buffer.from(bytes, 'base64').equals(Buffer.from(opened.archive.readBytes(destPath) ?? []))
      )
        return false
      const sourceRels = packet.notes!.masterRels?.[sourcePath] ?? [],
        destRels = opened.archive.readRels(destPath)
      if (sourceRels.length !== destRels.size) return false
      return sourceRels.every((rel) => {
        const destRel = destRels.get(rel.id)
        if (!destRel || rel.type !== destRel.type || rel.targetMode !== destRel.targetMode)
          return false
        return rel.targetMode === 'External'
          ? rel.target === destRel.target
          : sameGraph(
              resolveTarget(sourcePath, rel.target),
              resolveTarget(destPath, destRel.target),
            )
      })
    }
    if (!sameGraph(packet.notes.masterPath, existingPath))
      throw new Error('源备注母版与目标文稿不同，暂无法保真粘贴备注')
  }
  if (
    new Set(
      packets.flatMap((packet) => (packet.notes?.masterPath ? [packet.notes.masterPath] : [])),
    ).size > 1
  )
    throw new Error('多套备注母版暂无法保真粘贴')
  for (const packet of packets)
    if (
      packet.bundle.slideSize &&
      (packet.bundle.slideSize.cx !== opened.deck.size.cx ||
        packet.bundle.slideSize.cy !== opened.deck.size.cy)
    )
      throw new Error('源与目标页面尺寸不同，请先统一页面尺寸')
  const slides = packets.map((packet, offset) => {
    if (keepSourceFormatting && !packet.bundle.chain)
      throw new Error('源版式链缺失，不能保留源格式')
    const slide = pasteSlide(opened, after + offset, packet.bundle, { keepSourceFormatting })
    if (!slide) throw new Error('幻灯片粘贴未应用，请检查目标版式')
    return slide
  })
  const pathMap = new Map(packets.map((packet, index) => [packet.sourcePath, slides[index]!.path]))
  const notesParts: Record<string, string> = {},
    notesTypes: Record<string, string> = {}
  for (const packet of packets) {
    const note = packet.notes
    if (!note) continue
    const parts = { ...note.parts }
    if (existingPath && note.masterPath) {
      for (const path of Object.keys(note.masterParts ?? {})) delete parts[path]
      parts[relsPathFor(note.path)] = Buffer.from(
        relsXml(
          note.rels.map((rel) =>
            rel.type.endsWith('/notesMaster')
              ? { ...rel, target: relative(note.path, existingPath) }
              : rel,
          ),
        ),
      ).toString('base64')
    }
    Object.assign(notesParts, parts)
    Object.assign(notesTypes, note.contentTypes)
  }
  const importedNotes = importClipboardParts(opened.archive, notesParts, notesTypes)
  packets.forEach((packet, index) => {
    const dest = slides[index]!.path
    for (const link of packet.links) {
      const target = pathMap.get(link.path)
      if (!target) throw new Error('页面跳转目标缺失，粘贴未应用')
      appendRel(opened, dest, { id: link.id, type: link.type, target: relative(dest, target) })
    }
    if (!packet.notes) return
    const note = packet.notes,
      notesPath = importedNotes.get(note.path)
    if (!notesPath) throw new Error('备注粘贴未应用')
    // Notes must never be shared: back-link belongs to this newly pasted slide.
    appendRel(opened, notesPath, { ...note.backRel, target: relative(notesPath, dest) })
    appendRel(opened, dest, { ...note.slideRel, target: relative(dest, notesPath) })
    const master = note.masterPath ? importedNotes.get(note.masterPath) : null
    if (
      master &&
      ![...opened.archive.readRels(PRES).values()].some((rel) => rel.type.endsWith('/notesMaster'))
    ) {
      const ids = new Set(opened.archive.readRels(PRES).keys())
      let n = 1
      while (ids.has(`rId${n}`)) n++
      const id = `rId${n}`
      appendRel(opened, PRES, { id, type: `${REL_NS}notesMaster`, target: relative(PRES, master) })
      const xml = opened.archive.readText(PRES)!
      const list = `<p:notesMasterIdLst><p:notesMasterId r:id="${id}"/></p:notesMasterIdLst>`
      opened.archive.entries.set(
        PRES,
        Buffer.from(
          xml
            .replace(/<p:notesMasterIdLst\s*\/>/, '')
            .replace(
              /(<p:handoutMasterIdLst\b|<p:sldIdLst\b|<p:sldSz\b|<p:notesSz\b|<\/p:presentation>)/,
              `${list}$1`,
            ),
        ),
      )
    }
  })
  return slides.map((slide) => opened.deck.slides.indexOf(slide))
}
