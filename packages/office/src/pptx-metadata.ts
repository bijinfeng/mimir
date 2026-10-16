import { XMLParser } from 'fast-xml-parser'
import type { Slide, SlideElement } from '../vendor/packages/pptx-engine/src/types.js'
import { parseTheme } from '../vendor/packages/pptx-engine/src/theme.js'
import { PptxArchive, resolveTarget } from './pptx-archive.js'

export interface PptxLayoutInfo {
  index: number
  path: string
  name: string
  type: string
}
export interface PptxThemeInfo {
  path: string
  name: string
  colors: Record<string, string>
  majorFont: string
  minorFont: string
}
export interface PptxSectionInfo {
  id: string
  name: string
  slideIndices: number[]
}
export interface PptxCommentInfo {
  authorId: number
  idx: number
  author: string
  text: string
  date: string
}
export type PptxLink =
  | { kind: 'url'; url: string }
  | { kind: 'slide'; slideIndex: number }
  | { kind: 'action'; action: string }
export interface PptxMetadata {
  layouts: PptxLayoutInfo[]
  themes: PptxThemeInfo[]
  sections: PptxSectionInfo[]
  comments: PptxCommentInfo[]
}
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  trimValues: false,
})
type Xml = Record<string, unknown>
const obj = (value: unknown): Xml =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Xml) : {}
const list = (value: unknown): Xml[] =>
  (Array.isArray(value) ? value : value === undefined ? [] : [value]).map(obj)
const str = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : ''
const read = (xml: string | null): Xml => (xml ? obj(parser.parse(xml)) : {})

/** Browser-safe projection of the CURRENT archive. Resource indices match the pinned host engine. */
export function readPptxMetadata(
  archive: PptxArchive,
  slides: readonly Slide[],
  index: number,
): PptxMetadata {
  const layouts = [...archive.entries.keys()]
    .filter((path) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(path))
    .toSorted((a, b) => Number(/(\d+)\.xml$/.exec(a)?.[1]) - Number(/(\d+)\.xml$/.exec(b)?.[1]))
    .map((path, at) => {
      const root = obj(read(archive.readText(path))['p:sldLayout'])
      return {
        index: at,
        path,
        name: str(obj(root['p:cSld'])['@_name']) || path.split('/').at(-1)!,
        type: str(root['@_type']),
      }
    })
  const themes = [...archive.entries.keys()]
    .filter((path) => /^ppt\/theme\/theme\d+\.xml$/.test(path))
    .map((path) => {
      const xml = archive.readText(path)!
      const theme = parseTheme(xml)
      const root = obj(read(xml)['a:theme'])
      const colorScheme = obj(obj(root['a:themeElements'])['a:clrScheme'])
      return {
        path,
        // Native applyTheme names the palette, while the outer resource name is preserved.
        name: str(colorScheme['@_name']) || str(root['@_name']) || path,
        colors: theme.colors,
        majorFont: theme.majorFont ?? '',
        minorFont: theme.minorFont ?? '',
      }
    })
  const presentation = obj(read(archive.readText('ppt/presentation.xml'))['p:presentation'])
  const idToIndex = new Map<string, number>()
  const rels = archive.readRels('ppt/presentation.xml')
  for (const sld of list(obj(presentation['p:sldIdLst'])['p:sldId'])) {
    const rid = str(sld['@_r:id'])
    const rel = rels.get(rid)
    const at = rel
      ? slides.findIndex(
          (slide) => slide.path === resolveTarget('ppt/presentation.xml', rel.target),
        )
      : -1
    if (at >= 0) {
      idToIndex.set(str(sld['@_id']), at)
      idToIndex.set(rid, at)
    }
  }
  const sectionNodes: Xml[] = []
  const walk = (node: Xml): void => {
    for (const [key, value] of Object.entries(node)) {
      if (key === 'p14:section') sectionNodes.push(...list(value))
      else for (const child of list(value)) walk(child)
    }
  }
  walk(presentation)
  const sections = sectionNodes.map((section) => ({
    id: str(section['@_id']),
    name: str(section['@_name']),
    slideIndices: list(obj(section['p14:sldIdLst'])['p14:sldId'])
      .map((item) => idToIndex.get(str(item['@_id'])))
      .filter((at): at is number => at !== undefined),
  }))
  const authors = new Map(
    list(obj(read(archive.readText('ppt/commentAuthors.xml'))['p:cmAuthorLst'])['p:cmAuthor']).map(
      (author) => [Number(author['@_id']), str(author['@_name'])],
    ),
  )
  const slide = slides[index]
  const commentRel =
    slide &&
    [...archive.readRels(slide.path).values()].find((rel) => rel.type.endsWith('/comments'))
  const comments =
    commentRel && slide
      ? list(
          obj(read(archive.readText(resolveTarget(slide.path, commentRel.target)))['p:cmLst'])[
            'p:cm'
          ],
        ).map((comment) => ({
          authorId: Number(comment['@_authorId']),
          idx: Number(comment['@_idx']),
          author: authors.get(Number(comment['@_authorId'])) ?? '未知作者',
          text: str(comment['p:text']),
          date: str(comment['@_dt']),
        }))
      : []
  return { layouts, themes, sections, comments }
}

/** Whole-object links live on cNvPr, separate from run links. Never follow a URL during editing. */
export function readPptxLink(
  archive: PptxArchive,
  slides: readonly Slide[],
  index: number,
  element: SlideElement,
): PptxLink | null {
  const raw = /<p:cNvPr\b[^>]*>([\s\S]*?)<\/p:cNvPr>/.exec(element.anchor.originalXml)?.[1]
  if (!raw) return null
  const tag = /<a:hlinkClick\b[^>]*\/?\s*>/.exec(raw)?.[0]
  if (!tag) return null
  const link = obj(read(tag.endsWith('/>') ? tag : tag + '</a:hlinkClick>')['a:hlinkClick'])
  const action = str(link['@_action'])
  if (action.startsWith('ppaction://hlinkshowjump?jump='))
    return { kind: 'action', action: action.split('jump=')[1]! }
  const rel = archive.readRels(slides[index]!.path).get(str(link['@_r:id']))
  if (!rel) return null
  if (rel.type.endsWith('/slide')) {
    const slideIndex = slides.findIndex(
      (slide) => slide.path === resolveTarget(slides[index]!.path, rel.target),
    )
    return slideIndex >= 0 ? { kind: 'slide', slideIndex } : null
  }
  return rel.type.endsWith('/hyperlink') ? { kind: 'url', url: rel.target } : null
}
