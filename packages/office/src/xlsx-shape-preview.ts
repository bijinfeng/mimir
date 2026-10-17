import { XMLValidator } from 'fast-xml-parser'
import { decodeEntities } from '../vendor/packages/docx-engine/src/parse-xml-text.js'
import { parseSlide } from '../vendor/packages/pptx-engine/src/parse.js'
import { evalGuides } from '../vendor/packages/pptx-engine/src/custgeom.js'
import { parseTheme, type Theme } from '../vendor/packages/pptx-engine/src/theme.js'
import type { TextElement } from '../vendor/packages/pptx-engine/src/types.js'

const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const X = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing'
const AS = 'http://purl.oclc.org/ooxml/drawingml/main'
const XS = 'http://purl.oclc.org/ooxml/drawingml/spreadsheetDrawing'
interface Node {
  name: string
  ns: string
  local: string
  start: number
  attrs: Record<string, string>
  namespaces: Record<string, string>
  children: (Node | string)[]
}
export interface XlsxShapePreview {
  element?: TextElement
  unsupported?: true
}
const drawing = (node: Node) => node.ns === A || node.ns === AS
const spreadsheet = (node: Node) => node.ns === X || node.ns === XS
const elements = (node?: Node) =>
  node?.children.filter((c): c is Node => typeof c !== 'string') ?? []
const child = (node: Node | undefined, name: string) =>
  elements(node).find((c) => drawing(c) && c.local === name)
const escape = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')
function fail(): never {
  throw new Error('Unsupported DrawingML preview')
}
/** Read-only, bounded, namespace-expanded tree. No DOM, external entities, or native writes. */
function tree(xml: string): Node {
  if (
    xml.length > 4_000_000 ||
    /<!DOCTYPE|<!ENTITY/i.test(xml) ||
    XMLValidator.validate(xml) !== true
  )
    fail()
  const stack: Node[] = [],
    roots: Node[] = []
  const tokens =
    /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[\w:.-]+(?:\s+(?:"[^"]*"|'[^']*'|[^<>"'])*)?\s*\/?>/g
  let count = 0,
    cursor = 0
  for (const match of xml.matchAll(tokens)) {
    const token = match[0],
      text = xml.slice(cursor, match.index)
    if (text.includes('<')) fail()
    if (text && stack.length) stack.at(-1)!.children.push(decodeEntities(text))
    cursor = match.index + token.length
    if (token.startsWith('<!--') || token.startsWith('<?')) continue
    if (token.startsWith('<![CDATA[')) {
      stack.at(-1)?.children.push(token.slice(9, -3))
      continue
    }
    if (token.startsWith('</')) {
      if (stack.pop()?.name !== token.slice(2, -1).trim()) fail()
      continue
    }
    if (++count > 30_000 || stack.length > 48) fail()
    const name = /^<([^\s/>]+)/.exec(token)![1]!,
      namespaces: Record<string, string> = {
        xml: 'http://www.w3.org/XML/1998/namespace',
        ...stack.at(-1)?.namespaces,
      }
    const raw = [...token.matchAll(/([\w:.-]+)\s*=\s*(["'])([\s\S]*?)\2/g)]
    if (raw.length > 64) fail()
    for (const a of raw) {
      if (a[1] === 'xmlns') namespaces[''] = decodeEntities(a[3]!)
      else if (a[1]!.startsWith('xmlns:')) namespaces[a[1]!.slice(6)] = decodeEntities(a[3]!)
    }
    const ns = (key: string, attribute = false) =>
      key.includes(':')
        ? (namespaces[key.slice(0, key.indexOf(':'))] ?? '')
        : attribute
          ? ''
          : (namespaces[''] ?? '')
    const attrs: Record<string, string> = {},
      expanded = new Set<string>()
    for (const a of raw) {
      const key = a[1]!
      if (key === 'xmlns' || key.startsWith('xmlns:')) continue
      const uri = ns(key, true),
        local = key.slice(key.indexOf(':') + 1),
        identity = uri + '|' + local
      if ((key.includes(':') && !uri) || expanded.has(identity)) fail()
      expanded.add(identity)
      // Foreign attributes cannot masquerade as unqualified DrawingML attributes.
      if (!uri) attrs[local] = decodeEntities(a[3]!)
    }
    const node: Node = {
      name,
      ns: ns(name),
      local: name.slice(name.indexOf(':') + 1),
      start: match.index,
      attrs,
      namespaces,
      children: [],
    }
    if (!node.ns) fail()
    if (stack.length) stack.at(-1)!.children.push(node)
    else roots.push(node)
    if (!token.endsWith('/>')) stack.push(node)
  }
  if (stack.length || roots.length !== 1 || xml.slice(cursor).trim()) fail()
  return roots[0]!
}
/** Only recognized namespaces reach the fixed vendor reader, under its canonical prefixes. */
function canonical(node: Node): string {
  if (!drawing(node) && !spreadsheet(node)) return ''
  if (node.local === 'extLst') return ''
  const name = `${drawing(node) ? 'a' : 'p'}:${node.local}`
  return `<${name}${Object.entries(node.attrs)
    .map(([key, value]) => ` ${key}="${escape(value)}"`)
    .join(
      '',
    )}>${node.children.map((c) => (typeof c === 'string' ? escape(c) : canonical(c))).join('')}</${name}>`
}
function nodes(root: Node): Node[] {
  return [root, ...elements(root).flatMap(nodes)]
}
const BUILTINS = new Set(
  'w h ss ls hc vc l t r b wd2 wd3 wd4 wd5 wd6 wd8 wd10 wd12 wd32 hd2 hd3 hd4 hd5 hd6 hd8 hd10 hd12 ssd2 ssd4 ssd6 ssd8 ssd16 ssd32 cd2 cd4 cd8 3cd4 3cd8 5cd8 7cd8'.split(
    ' ',
  ),
)
const OPS: Record<string, number> = {
  val: 1,
  '+-': 3,
  '*/': 3,
  '+/': 3,
  '?:': 3,
  abs: 1,
  at2: 2,
  cat2: 3,
  cos: 2,
  max: 2,
  min: 2,
  mod: 3,
  pin: 3,
  sat2: 3,
  sin: 2,
  sqrt: 1,
  tan: 2,
}
function validateGeometry(geometry: Node, width: number, height: number) {
  if (geometry.local === 'prstGeom' && !geometry.attrs.prst?.trim()) fail()
  const all = nodes(geometry)
  if (all.length > 4000 || all.some((n) => !drawing(n))) fail()
  const allowed = new Set(
    'custGeom prstGeom avLst gdLst gd ahLst ahXY ahPolar pos cxnLst cxn rect pathLst path moveTo lnTo quadBezTo cubicBezTo pt arcTo close'.split(
      ' ',
    ),
  )
  if (all.some((n) => !allowed.has(n.local))) fail()
  const env = new Set(BUILTINS)
  const token = (value: string) =>
    /^-?\d+(?:\.\d+)?$/.test(value)
      ? Number.isFinite(Number(value)) && Math.abs(Number(value)) <= 1e10
      : env.has(value)
  const guides = all.filter((n) => n.local === 'gd')
  if (guides.length > 256) fail()
  for (const guide of guides) {
    const parts = (guide.attrs.fmla ?? '').trim().split(/\s+/),
      name = guide.attrs.name ?? ''
    if (
      env.has(name) ||
      !/^[a-zA-Z][\w]{0,63}$/.test(name) ||
      parts.length !== (OPS[parts[0]!] ?? -1) + 1 ||
      !parts.slice(1).every(token)
    )
      fail()
    env.add(name)
  }
  // The vendor expands arcs before returning a model. Check resolved formulas first:
  // a bounded numeric operand can still produce an unbounded sweep via multiplication.
  const resolved = evalGuides(
    guides.map((guide) => ({ name: guide.attrs.name!, fmla: guide.attrs.fmla! })),
    width,
    height,
  )
  if (Object.values(resolved).some((value) => !Number.isFinite(value) || Math.abs(value) > 1e10))
    fail()
  const value = (input: string) => {
    const number = /^-?\d+(?:\.\d+)?$/.test(input) ? Number(input) : resolved[input]
    if (number === undefined) fail()
    return number
  }
  for (const n of all) {
    for (const key of ['x', 'y', 'w', 'h', 'wR', 'hR', 'stAng', 'swAng']) {
      if (n.attrs[key] !== undefined && !token(n.attrs[key]!)) fail()
    }
    if (
      n.local === 'path' &&
      ['w', 'h'].some((key) => n.attrs[key] !== undefined && !/^[1-9]\d*$/.test(n.attrs[key]!))
    )
      fail()
    if (
      n.local === 'arcTo' &&
      (['wR', 'hR', 'stAng', 'swAng'].some((key) => n.attrs[key] === undefined) ||
        Math.abs(value(n.attrs.swAng!)) > 21600000 ||
        value(n.attrs.wR!) < 0 ||
        value(n.attrs.hR!) < 0)
    )
      fail()
    if (
      n.local === 'path' &&
      ((n.attrs.fill !== undefined &&
        !['none', 'norm', 'lighten', 'lightenLess', 'darken', 'darkenLess'].includes(
          n.attrs.fill,
        )) ||
        (n.attrs.stroke !== undefined &&
          !['0', '1', 'true', 'false', 'none'].includes(n.attrs.stroke)))
    )
      fail()
    const required = (
      { moveTo: 1, lnTo: 1, quadBezTo: 2, cubicBezTo: 3 } as Record<string, number>
    )[n.local]
    if (
      required &&
      (elements(n).length !== required ||
        elements(n).some(
          (p) => p.local !== 'pt' || p.attrs.x === undefined || p.attrs.y === undefined,
        ))
    )
      fail()
  }
}
export function readXlsxShapeThemeTarget(xml: string): string | undefined {
  try {
    const root = tree(xml),
      ns = 'http://schemas.openxmlformats.org/package/2006/relationships'
    if (root.ns !== ns || root.local !== 'Relationships') return undefined
    const matches = elements(root).filter(
      (c) =>
        c.ns === ns &&
        c.local === 'Relationship' &&
        [
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme',
          'http://purl.oclc.org/ooxml/officeDocument/relationships/theme',
        ].includes(c.attrs.Type ?? ''),
    )
    if (matches.length !== 1 || matches[0]!.attrs.TargetMode === 'External') return undefined
    const target = matches[0]!.attrs.Target
    return target && !/[\\?#:]/.test(target) ? target : undefined
  } catch {
    return undefined
  }
}
export function readXlsxShapeTheme(xml: string): Theme | undefined {
  try {
    const root = tree(xml)
    if (!drawing(root) || root.local !== 'theme') return undefined
    return parseTheme(canonical(root))
  } catch {
    return undefined
  }
}
/** Keys use source offsets, so an opaque anchor never changes the existing native object identity. */
export function readXlsxShapePreviews(xml: string, theme?: Theme): Map<number, XlsxShapePreview> {
  const result = new Map<number, XlsxShapePreview>()
  try {
    const root = tree(xml)
    if (!spreadsheet(root) || root.local !== 'wsDr') return result
    for (const anchor of elements(root)) {
      if (
        !spreadsheet(anchor) ||
        !['twoCellAnchor', 'oneCellAnchor', 'absoluteAnchor'].includes(anchor.local)
      )
        continue
      const entry: XlsxShapePreview = { unsupported: true }
      result.set(anchor.start, entry)
      try {
        const shapes = elements(anchor).filter((c) => spreadsheet(c) && c.local === 'sp')
        if (shapes.length !== 1) continue
        const shape = shapes[0]!,
          properties = elements(shape).filter((c) => spreadsheet(c) && c.local === 'spPr')
        if (properties.length !== 1 || nodes(shape).length > 8000) continue
        // The synthetic reader has no image relationships. Do not silently drop native paint.
        if (nodes(shape).some((n) => drawing(n) && n.local === 'blipFill')) continue
        const style = elements(shape).find((n) => spreadsheet(n) && n.local === 'style'),
          fillIndex = Number(child(style, 'fillRef')?.attrs.idx ?? 0),
          lineIndex = Number(child(style, 'lnRef')?.attrs.idx ?? 0),
          templates = [
            fillIndex > 1000
              ? theme?.bgFillStyles?.[fillIndex - 1001]
              : theme?.fillStyles?.[fillIndex - 1],
            theme?.lnStyles?.[lineIndex - 1],
          ]
        if (
          templates.some(
            (template) => template && JSON.stringify(template).includes('"a:blipFill":'),
          )
        )
          continue
        const spPr = properties[0]!,
          geometries = elements(spPr).filter(
            (c) => drawing(c) && ['prstGeom', 'custGeom'].includes(c.local),
          )
        if (
          geometries.length > 1 ||
          elements(spPr).some(
            (n) => ['prstGeom', 'custGeom', 'xfrm'].includes(n.local) && !drawing(n),
          ) ||
          elements(spPr).filter((n) => drawing(n) && n.local === 'xfrm').length > 1
        )
          continue
        const geometry = geometries[0]
        const xfrm = child(spPr, 'xfrm'),
          ext = child(xfrm, 'ext')
        if (
          xfrm &&
          (elements(xfrm).filter((n) => drawing(n) && n.local === 'ext').length !== 1 ||
            elements(xfrm).filter((n) => drawing(n) && n.local === 'off').length > 1)
        )
          continue
        if (
          xfrm &&
          (!ext ||
            !['cx', 'cy'].every(
              (key) =>
                /^\d+$/.test(ext.attrs[key] ?? '') &&
                Number(ext.attrs[key]) >= 0 &&
                Number(ext.attrs[key]) <= 1e10,
            ))
        )
          continue
        if (ext && (Number(ext.attrs.cx) === 0) !== (Number(ext.attrs.cy) === 0)) continue
        if (
          xfrm &&
          ['rot', 'flipH', 'flipV'].some(
            (key) =>
              xfrm.attrs[key] !== undefined &&
              (key === 'rot'
                ? !/^-?\d{1,10}$/.test(xfrm.attrs[key]!)
                : !/^(0|1|true|false)$/.test(xfrm.attrs[key]!)),
          )
        )
          continue
        if (geometry)
          validateGeometry(geometry, Number(ext?.attrs.cx ?? 0), Number(ext?.attrs.cy ?? 0))
        const fragment = canonical(shape)
        const slide = parseSlide({
          path: 'xlsx-preview',
          ctx: { theme },
          slideXml: `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="${A}"><p:cSld><p:spTree>${fragment}</p:spTree></p:cSld></p:sld>`,
        })
        const element = slide.elements[0]
        if (!element || (element.type !== 'shape' && element.type !== 'text')) continue
        if (
          geometry?.local === 'custGeom' &&
          !Object.values(element.customGeometry ?? {}).some(Boolean)
        )
          continue
        if (
          Object.values(element.customGeometry ?? {}).some(
            (p) => p && (p.length > 300000 || /NaN|Infinity/.test(p)),
          )
        )
          continue
        if (
          JSON.stringify(element, (_key, value: unknown) => {
            if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > 1e10))
              fail()
            return value
          }).length > 1_000_000
        )
          continue
        if (
          [element.fill, element.stroke?.fill].some(
            (fill) =>
              fill &&
              (fill.type === 'image' ||
                fill.type === 'pattern' ||
                (fill.type === 'gradient' && (fill.path || fill.stops.length > 64))),
          )
        )
          continue
        // The synthetic reader is not a writer or an identity source. Drop source XML and anchors.
        element.anchor.originalXml = ''
        result.set(anchor.start, { element })
      } catch {
        /* One unsupported shape must not hide ordinary sibling shapes. */
      }
    }
  } catch {
    /* Invalid/over-budget native DrawingML remains opaque and preserved. */
  }
  return result
}
