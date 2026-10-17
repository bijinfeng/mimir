import {
  readXlsxRangeXmlTree,
  type XlsxRangeXmlNode as Node,
} from '../../../../packages/office/src/xlsx-native-xml.js'
export {
  readXlsxRangeXmlTree,
  rewriteXlsxRangeFormulas,
  xlsxRangeXmlTokens,
  type XlsxRangeXmlNode,
} from '../../../../packages/office/src/xlsx-native-xml.js'
import { BoundedZip } from '../../../../packages/office/src/zip-bounds.js'
import {
  parseRange,
  formatAddress,
  type RangeBounds,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/cell-address.js'

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const OFFICE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PACKAGE = 'http://schemas.openxmlformats.org/package/2006/relationships'
const fail = (detail: string): never => {
  throw new Error(`范围合并/链接无法安全迁移：${detail}`)
}
const escape = (s: string) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\r', '&#13;')
    .replaceAll('\n', '&#10;')
    .replaceAll('\t', '&#9;')
const tree = readXlsxRangeXmlTree
const overlap = (a: RangeBounds, b: RangeBounds) =>
  a.startRow <= b.endRow &&
  b.startRow <= a.endRow &&
  a.startColumn <= b.endColumn &&
  b.startColumn <= a.endColumn
const contains = (a: RangeBounds, b: RangeBounds) =>
  a.startRow <= b.startRow &&
  a.endRow >= b.endRow &&
  a.startColumn <= b.startColumn &&
  a.endColumn >= b.endColumn
function area(ref: string | undefined): RangeBounds {
  if (!ref || !/^\$?[A-Z]{1,3}\$?[1-9]\d*(?::\$?[A-Z]{1,3}\$?[1-9]\d*)?$/.test(ref))
    fail('原生 ref 无效')
  const a = parseRange(ref!)
  if (a.endRow >= 1048576 || a.endColumn >= 16384) fail('原生 ref 越界')
  return a
}
function attributes(node: Node, allowed: string[]) {
  for (const name of node.attrs.keys())
    if (name !== 'xmlns' && !name.startsWith('xmlns:') && !allowed.includes(name))
      fail(`未知 ${node.local} 属性`)
}
function relationId(node: Node): string | undefined {
  const ids = [...node.attrs].filter(([key]) => {
    const [prefix, local] = key.split(':')
    return local === 'id' && node.namespaces.get(prefix!) === OFFICE
  })
  if (ids.length > 1) fail('链接关系 ID 重复')
  return ids[0]?.[1]
}
interface Feature {
  node: Node
  bounds: RangeBounds
  id?: string
}
interface Sheet {
  entry: string
  xml: string
  root: Node
  merges: Feature[]
  links: Feature[]
}
function readSheet(entry: string, xml: string): Sheet {
  const root = tree(xml)
  if (root.ns !== MAIN || root.local !== 'worksheet') fail('工作表命名空间无效')
  const collect = (container: string, child: string): Feature[] => {
    const containers = root.children.filter((n) => n.local === container)
    if (containers.length > 1) fail(`${container} 重复`)
    const parent = containers[0]
    if (!parent) return []
    if (parent.ns !== MAIN) fail('结构命名空间无效')
    attributes(parent, container === 'mergeCells' ? ['count'] : [])
    if (!parent.children.length) fail('空结构容器')
    const count = parent.attrs.get('count')
    if (count !== undefined && (!/^\d+$/.test(count) || Number(count) !== parent.children.length))
      fail('结构 count 无效')
    if (
      xml
        .slice(parent.openEnd, parent.closeStart)
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<(?:"[^"]*"|'[^']*'|[^'">])*?>/g, '')
        .trim()
    )
      fail('结构含未知文字')
    const features = parent.children.map((node) => {
      if (node.ns !== MAIN || node.local !== child || node.children.length) fail('结构子节点无效')
      if (
        xml
          .slice(node.openEnd, node.closeStart)
          .replace(/<!--[\s\S]*?-->/g, '')
          .trim()
      )
        fail('结构子节点含未知内容')
      const id = child === 'hyperlink' ? relationId(node) : undefined
      const idName = [...node.attrs.keys()].find(
        (k) =>
          k.includes(':') &&
          !k.startsWith('xmlns:') &&
          k.split(':')[1] === 'id' &&
          node.namespaces.get(k.split(':')[0]!) === OFFICE,
      )
      attributes(
        node,
        child === 'mergeCell'
          ? ['ref']
          : ['ref', 'location', 'display', 'tooltip', ...(idName ? [idName] : [])],
      )
      if (child === 'hyperlink') {
        const location = node.attrs.get('location')
        if ((!id && !location) || (id && location) || id === '') fail('链接目标缺失或有歧义')
        if (
          location &&
          !/^(?:'(?:[^']|'')+'|[\p{L}_][\p{L}\p{N}_. ]*)!\$?[A-Z]{1,3}\$?[1-9]\d*(?::\$?[A-Z]{1,3}\$?[1-9]\d*)?$/u.test(
            location,
          )
        )
          fail('链接内部位置不是工作表限定的固定位置')
        if (location) area(location.slice(location.lastIndexOf('!') + 1))
      }
      return { node, bounds: area(node.attrs.get('ref')), id }
    })
    // A sweep is bounded by the package's 4MiB XML budget; stop pathological quadratic input.
    if (features.length > 20000) fail('结构数量超过预算')
    const sorted = features.toSorted((a, b) => a.bounds.startRow - b.bounds.startRow)
    let comparisons = 0
    for (let i = 0; i < sorted.length; i++)
      for (
        let j = i + 1;
        j < sorted.length && sorted[j]!.bounds.startRow <= sorted[i]!.bounds.endRow;
        j++
      ) {
        if (++comparisons > 200000) fail('结构交叉校验超过预算')
        if (overlap(sorted[i]!.bounds, sorted[j]!.bounds)) fail('合并或链接范围重叠/重复')
      }
    return features
  }
  return {
    entry,
    xml,
    root,
    merges: collect('mergeCells', 'mergeCell'),
    links: collect('hyperlinks', 'hyperlink'),
  }
}
interface Relationship {
  id: string
  target: string
}
interface Relationships {
  path: string
  xml: string | undefined
  root: Node | undefined
  items: Map<string, Relationship>
  allIds: Set<string>
}
const relPath = (entry: string) => {
  const slash = entry.lastIndexOf('/')
  return `${entry.slice(0, slash)}/_rels/${entry.slice(slash + 1)}.rels`
}
async function readRelationships(
  zip: Pick<BoundedZip, 'readText'>,
  entry: string,
): Promise<Relationships> {
  const path = relPath(entry),
    xml = await zip.readText(path),
    root = xml ? tree(xml) : undefined,
    items = new Map<string, Relationship>(),
    allIds = new Set<string>()
  if (root) {
    if (root.ns !== PACKAGE || root.local !== 'Relationships') fail('关系根节点无效')
    attributes(root, [])
    if (
      xml!
        .slice(root.openEnd, root.closeStart)
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<(?:"[^"]*"|'[^']*'|[^'">])*?>/g, '')
        .trim()
    )
      fail('关系含未知文字')
    for (const node of root.children) {
      if (node.ns !== PACKAGE || node.local !== 'Relationship' || node.children.length)
        fail('关系节点无效')
      if (
        xml!
          .slice(node.openEnd, node.closeStart)
          .replace(/<!--[\s\S]*?-->/g, '')
          .trim()
      )
        fail('关系节点含未知内容')
      attributes(node, ['Id', 'Type', 'Target', 'TargetMode'])
      const id = node.attrs.get('Id'),
        type = node.attrs.get('Type'),
        target = node.attrs.get('Target'),
        mode = node.attrs.get('TargetMode')
      if (
        !id ||
        !type ||
        !target ||
        allIds.has(id) ||
        (mode !== undefined && !['Internal', 'External'].includes(mode))
      )
        fail('关系身份无效或重复')
      allIds.add(id!)
      if (type === `${OFFICE}/hyperlink`) {
        if (
          mode !== 'External' ||
          !/^(?:https?:\/\/[^\s/?#]+(?:[^\s]*)?|mailto:[^\s]+)$/i.test(target!) ||
          [...target!].some((char) => char.codePointAt(0)! <= 32 || char.codePointAt(0) === 127) ||
          target!.includes('\\')
        )
          fail('链接关系目标或 TargetMode 有歧义')
        try {
          const url = new URL(target!)
          if (
            !['http:', 'https:', 'mailto:'].includes(url.protocol) ||
            (url.protocol !== 'mailto:' && !url.hostname)
          )
            fail('链接关系目标无效')
        } catch {
          fail('链接关系目标无效')
        }
        items.set(id!, { id: id!, target: target! })
      }
    }
  }
  return { path, xml: xml ?? undefined, root, items, allIds }
}
function select(features: Feature[], range: RangeBounds, ignored = new Set<Feature>()): Feature[] {
  return features.filter((feature) => {
    if (ignored.has(feature) || !overlap(feature.bounds, range)) return false
    if (!contains(range, feature.bounds)) fail('源/目标与合并或链接部分相交')
    return true
  })
}
interface Patch {
  start: number
  end: number
  value: string
}
const patch = (xml: string, patches: Patch[]) =>
  patches
    .toReversed()
    .toSorted((a, b) => b.start - a.start || b.end - a.end)
    .reduce((text, p) => text.slice(0, p.start) + p.value + text.slice(p.end), xml)
function patchFeatures(
  sheet: Sheet,
  mergeRemove: Set<Feature>,
  linkRemove: Set<Feature>,
  merges: string[],
  links: string[],
): string {
  const patches: Patch[] = []
  for (const [name, features, remove, added] of [
    ['mergeCells', sheet.merges, mergeRemove, merges],
    ['hyperlinks', sheet.links, linkRemove, links],
  ] as const) {
    if (!remove.size && !added.length) continue
    const container = sheet.root.children.find((n) => n.ns === MAIN && n.local === name),
      count = features.length - remove.size + added.length
    if (container) {
      if (!count) {
        patches.push({ start: container.start, end: container.end, value: '' })
        continue
      }
      for (const f of remove) patches.push({ start: f.node.start, end: f.node.end, value: '' })
      if (added.length)
        patches.push({
          start: container.closeStart,
          end: container.closeStart,
          value: added.join(''),
        })
      const open = sheet.xml.slice(container.start, container.openEnd)
      if (container.attrs.has('count'))
        patches.push({
          start: container.start,
          end: container.openEnd,
          value: open.replace(/\s+count\s*=\s*(?:"[^"]*"|'[^']*')/, ` count="${count}"`),
        })
    } else if (added.length) {
      const before = new Set(
        name === 'mergeCells'
          ? [
              'phoneticPr',
              'conditionalFormatting',
              'dataValidations',
              'hyperlinks',
              'printOptions',
              'pageMargins',
              'pageSetup',
              'headerFooter',
              'rowBreaks',
              'colBreaks',
              'customProperties',
              'cellWatches',
              'ignoredErrors',
              'smartTags',
              'drawing',
              'legacyDrawing',
              'legacyDrawingHF',
              'picture',
              'oleObjects',
              'controls',
              'webPublishItems',
              'tableParts',
              'extLst',
            ]
          : [
              'printOptions',
              'pageMargins',
              'pageSetup',
              'headerFooter',
              'rowBreaks',
              'colBreaks',
              'customProperties',
              'cellWatches',
              'ignoredErrors',
              'smartTags',
              'drawing',
              'legacyDrawing',
              'legacyDrawingHF',
              'picture',
              'oleObjects',
              'controls',
              'webPublishItems',
              'tableParts',
              'extLst',
            ],
      )
      const at =
        sheet.root.children.find((n) => n.ns === MAIN && before.has(n.local))?.start ??
        sheet.root.closeStart
      patches.push({
        start: at,
        end: at,
        value: `<${name} xmlns="${MAIN}"${name === 'mergeCells' ? ` count="${count}"` : ''}>${added.join('')}</${name}>`,
      })
    }
  }
  return patch(sheet.xml, patches)
}
/** Private, source-bound permit: only plans validated here can widen the R1 guard. */
const permits = new WeakMap<object, Map<string, { xml: string; areas: string }>>()
export interface XlsxRangeStructurePlan {
  readonly replacements: Map<string, string>
  readonly permit: object
}
export function hasXlsxRangeStructurePermit(
  permit: object | undefined,
  entry: string,
  xml: string,
  areas: RangeBounds[],
): boolean {
  const found = permit && permits.get(permit)?.get(entry)
  return !!found && found.xml === xml && found.areas === JSON.stringify(areas)
}
export async function planXlsxRangeStructures(
  zip: BoundedZip,
  source: { entry: string; xml: string; bounds: RangeBounds },
  target: { entry: string; xml: string; bounds: RangeBounds },
  move: boolean,
  options: { features?: 'all' | 'merge' | 'preserve'; tiles?: readonly RangeBounds[] } = {},
): Promise<XlsxRangeStructurePlan> {
  const from = readSheet(source.entry, source.xml),
    to = source.entry === target.entry ? from : readSheet(target.entry, target.xml)
  const mode = options.features ?? 'all',
    tiles = options.tiles ?? [target.bounds]
  if (!['all', 'merge', 'preserve'].includes(mode)) fail('未知结构粘贴方式')
  if (options.tiles) {
    const height = source.bounds.endRow - source.bounds.startRow + 1,
      width = source.bounds.endColumn - source.bounds.startColumn + 1,
      targetHeight = target.bounds.endRow - target.bounds.startRow + 1,
      targetWidth = target.bounds.endColumn - target.bounds.startColumn + 1
    for (const bounds of [source.bounds, target.bounds, ...tiles])
      if (
        !Object.values(bounds).every(Number.isInteger) ||
        bounds.startRow < 0 ||
        bounds.startColumn < 0 ||
        bounds.endRow < bounds.startRow ||
        bounds.endColumn < bounds.startColumn ||
        bounds.endRow >= 1048576 ||
        bounds.endColumn >= 16384
      )
        fail('平铺范围无效')
    if (
      height * width > 2000 ||
      targetHeight * targetWidth > 2000 ||
      targetHeight % height ||
      targetWidth % width ||
      tiles.length !== (targetHeight / height) * (targetWidth / width)
    )
      fail('平铺范围须完整覆盖整数倍目标')
    let index = 0
    for (let row = target.bounds.startRow; row <= target.bounds.endRow; row += height)
      for (let col = target.bounds.startColumn; col <= target.bounds.endColumn; col += width) {
        const tile = tiles[index++]!
        if (
          tile.startRow !== row ||
          tile.startColumn !== col ||
          tile.endRow !== row + height - 1 ||
          tile.endColumn !== col + width - 1
        )
          fail('平铺范围须按顺序完整覆盖目标')
      }
  }
  if (move && (mode !== 'all' || tiles.length !== 1)) fail('剪切结构不支持选择性粘贴或平铺')
  const sourceMerge = mode === 'preserve' ? [] : select(from.merges, source.bounds),
    sourceLink = mode === 'all' ? select(from.links, source.bounds) : [],
    same = from === to
  const removedSource = new Set(move && same ? [...sourceMerge, ...sourceLink] : [])
  const selectedTargetMerges = select(to.merges, target.bounds, removedSource)
  const targetMerge = mode === 'preserve' ? [] : selectedTargetMerges,
    targetLink = mode === 'all' ? select(to.links, target.bounds, removedSource) : []
  const fromRels = await readRelationships(zip, source.entry),
    toRels = same ? fromRels : await readRelationships(zip, target.entry)
  for (const [sheet, relationships] of [
    [from, fromRels],
    [to, toRels],
  ] as const)
    for (const link of sheet.links)
      if (link.id && !relationships.items.has(link.id)) fail('链接关系不存在或不是标准外部链接')
  const shifted = (feature: Feature, tile: RangeBounds) => {
    const dr = tile.startRow - source.bounds.startRow,
      dc = tile.startColumn - source.bounds.startColumn
    const b = feature.bounds,
      r1 = b.startRow + dr,
      c1 = b.startColumn + dc,
      r2 = b.endRow + dr,
      c2 = b.endColumn + dc
    const ref = `${formatAddress(r1, c1)}${r1 !== r2 || c1 !== c2 ? ':' + formatAddress(r2, c2) : ''}`
    const bounds = area(ref)
    if (!contains(target.bounds, bounds)) fail('迁移后结构越出目标范围')
    return ref
  }
  const mergeAdds = tiles.flatMap((tile) =>
    sourceMerge.map((f) => `<mergeCell xmlns="${MAIN}" ref="${shifted(f, tile)}"/>`),
  )
  const relationshipAdds: string[] = [],
    idMap = new Map<string, string>()
  const linkAdds = tiles.flatMap((tile) =>
    sourceLink.map((f) => {
      const attrs = [`xmlns="${MAIN}"`, `ref="${shifted(f, tile)}"`]
      if (f.id) {
        let id = f.id
        if (!same) {
          const known = idMap.get(id)
          if (known) id = known
          else {
            const equivalent = [...toRels.items.values()].find(
              (item) => item.target === fromRels.items.get(id)!.target,
            )
            if (equivalent) {
              idMap.set(id, equivalent.id)
              id = equivalent.id
            } else {
              let n = 1
              while (toRels.allIds.has(`rId${n}`)) n++
              const assigned = `rId${n}`
              toRels.allIds.add(assigned)
              idMap.set(id, assigned)
              relationshipAdds.push(
                `<Relationship xmlns="${PACKAGE}" Id="${assigned}" Type="${OFFICE}/hyperlink" Target="${escape(fromRels.items.get(id)!.target)}" TargetMode="External"/>`,
              )
              toRels.items.set(assigned, { id: assigned, target: fromRels.items.get(id)!.target })
              id = assigned
            }
          }
        }
        attrs.push(`xmlns:r="${OFFICE}"`, `r:id="${escape(id)}"`)
      }
      for (const name of ['location', 'display', 'tooltip'])
        if (f.node.attrs.has(name)) attrs.push(`${name}="${escape(f.node.attrs.get(name)!)}"`)
      return `<hyperlink ${attrs.join(' ')}/>`
    }),
  )
  const replacements = new Map<string, string>()
  const put = (entry: string, original: string, value: string) => {
    if (original !== value) replacements.set(entry, value)
  }
  if (same)
    put(
      from.entry,
      from.xml,
      patchFeatures(
        from,
        new Set([...targetMerge, ...(move ? sourceMerge : [])]),
        new Set([...targetLink, ...(move ? sourceLink : [])]),
        mergeAdds,
        linkAdds,
      ),
    )
  else {
    if (move)
      put(
        from.entry,
        from.xml,
        patchFeatures(from, new Set(sourceMerge), new Set(sourceLink), [], []),
      )
    put(
      to.entry,
      to.xml,
      patchFeatures(to, new Set(targetMerge), new Set(targetLink), mergeAdds, linkAdds),
    )
  }
  if (relationshipAdds.length) {
    const r = toRels,
      body = relationshipAdds.join('')
    const output =
      r.xml && r.root
        ? r.xml.slice(r.root.start, r.root.openEnd).endsWith('/>')
          ? patch(r.xml, [
              {
                start: r.root.start,
                end: r.root.end,
                value:
                  r.xml.slice(r.root.start, r.root.openEnd - 2) + '>' + body + `</${r.root.tag}>`,
              },
            ])
          : patch(r.xml, [{ start: r.root.closeStart, end: r.root.closeStart, value: body }])
        : `<Relationships xmlns="${PACKAGE}">${body}</Relationships>`
    replacements.set(r.path, output)
  }
  // Reparse the actual candidate structure, including newly allocated relationship IDs.
  for (const candidate of [from, to]) {
    const updated = replacements.get(candidate.entry)
    if (updated) {
      const actual = readSheet(candidate.entry, updated)
      const actualRels = await readRelationships(
        { readText: async (path) => replacements.get(path) ?? zip.readText(path) },
        candidate.entry,
      )
      for (const link of actual.links)
        if (link.id && !actualRels.items.has(link.id)) fail('迁移后链接关系无效')
    }
  }
  const permit = {}
  const bound = new Map<string, { xml: string; areas: string }>()
  bound.set(source.entry, {
    xml: source.xml,
    areas: JSON.stringify(same ? [source.bounds, target.bounds] : [source.bounds]),
  })
  if (!same) bound.set(target.entry, { xml: target.xml, areas: JSON.stringify([target.bounds]) })
  permits.set(permit, bound)
  return { replacements, permit }
}
