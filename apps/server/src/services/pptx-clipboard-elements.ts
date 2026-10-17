import {
  copyElementData,
  deleteElement,
  groupChildSlices,
  patchedElementXml,
  type OpenedPptx,
  type ElementClipboardItem,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/index.js'
import type {
  GroupElement,
  Slide,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/types.js'
import { resolveTarget } from '../../../../packages/office/vendor/packages/pptx-engine/src/zip.js'
import {
  cNvPrIdsInXml,
  getSlideAnimations,
  pruneTimingForSpids,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/animation.js'
import { cleanupDeletedElementResources } from '../../../../packages/office/vendor/packages/pptx-engine/src/resource-cleanup.js'
import {
  resolvePptxClipboardTargets,
  type PptxClipboardTarget,
} from '../../../../packages/office/src/pptx-selection-clipboard.js'

const MAX_BYTES = 64 * 1024 * 1024
function validateItem(opened: OpenedPptx, item: ElementClipboardItem) {
  if (/<a:(?:stCxn|endCxn)\b/.test(item.xml))
    throw new Error('所选对象带连接线附着引用，暂不能复制或剪切；请先解除连接')
  const ids = new Set(
    [...item.xml.matchAll(/\br:(?:embed|link|id)\s*=\s*["']([^"']+)["']/g)].map(
      (match) => match[1],
    ),
  )
  for (const id of ids)
    if (!item.rels.some((rel) => rel.rid === id))
      throw new Error('所选对象含失效或不支持的资源关系，请先修复原件')
  const inspect = (type: string, external: boolean, target: string) => {
    if (external) {
      if (!type.endsWith('/hyperlink')) throw new Error('所选对象含外链媒体，暂不能复制或剪切')
    } else {
      if (type.endsWith('/slide'))
        throw new Error('所选对象含幻灯片跳转或缩放引用，请复制整张幻灯片')
      if (!opened.archive.entries.has(target)) throw new Error('复制资源已失效，请先修复原件')
    }
  }
  for (const rel of item.rels) inspect(rel.type, !!rel.external, rel.target)
  for (const path of Object.keys(item.parts ?? {})) {
    if (path.endsWith('.rels')) continue
    for (const rel of opened.archive.readRels(path).values())
      inspect(rel.type, rel.targetMode === 'External', resolveTarget(path, rel.target))
  }
}
function withoutChildren(parent: GroupElement, retained: ReadonlySet<string>): string {
  if (/<mc:AlternateContent\b/.test(parent.anchor.originalXml))
    throw new Error('此组合含兼容性分支，暂不能单独复制成员；请选择整个组合')
  const slices = groupChildSlices(parent.anchor.originalXml)
  if (
    slices.length !== parent.children.length ||
    parent.children.some(
      (child) => !child.nvId || slices.filter((slice) => slice.nvId === child.nvId).length !== 1,
    )
  )
    throw new Error('此组合的原生成员身份不完整，请选择整个组合')
  let xml = parent.anchor.originalXml
  for (const slice of slices.toReversed())
    if (!slice.nvId || !retained.has(slice.nvId))
      xml = xml.slice(0, slice.start) + xml.slice(slice.end)
  return xml
}
/** Build all snapshots before changing the private source deck. Preserve each parent's coordinate wrapper. */
export function preparePptxClipboardElements(
  opened: OpenedPptx,
  slide: Slide,
  targets: readonly PptxClipboardTarget[],
  cut: boolean,
) {
  const resolved = resolvePptxClipboardTargets(slide.elements, targets)
  const selected = new Set(resolved.map((context) => context.element))
  const parents = new Map<GroupElement, Set<string>>()
  const removedXml: string[] = []
  for (const context of resolved) {
    if (context.parent) {
      const members = parents.get(context.parent) ?? new Set<string>()
      if (!context.element.nvId) throw new Error('组合成员原生身份已失效')
      const slices = groupChildSlices(context.parent.anchor.originalXml).filter(
        (slice) => slice.nvId === context.element.nvId,
      )
      if (slices.length !== 1) throw new Error('组合成员原生XML已失效')
      const slice = slices[0]!
      removedXml.push(context.parent.anchor.originalXml.slice(slice.start, slice.end))
      members.add(context.element.nvId)
      parents.set(context.parent, members)
    } else removedXml.push(patchedElementXml(context.element))
  }
  const ids = new Set<number>()
  for (const xml of removedXml) for (const id of cNvPrIdsInXml(xml)) ids.add(id)
  if (cut) {
    const retained = slide.elements
      .map((element) => {
        if (selected.has(element)) return ''
        const members = element.type === 'group' ? parents.get(element) : undefined
        return members && element.type === 'group'
          ? withoutChildren(
              element,
              new Set(
                element.children
                  .filter((child) => !members.has(child.nvId!))
                  .map((child) => child.nvId!),
              ),
            )
          : patchedElementXml(element)
      })
      .join('')
    for (const match of retained.matchAll(/<a:(?:stCxn|endCxn)\b[^>]*\bid=["'](\d+)["']/g))
      if (ids.has(Number(match[1]))) throw new Error('未选连接线仍附着于剪切对象，请先解除连接')
  }
  const items: ElementClipboardItem[] = []
  let size = 0
  for (const element of slide.elements) {
    const members = element.type === 'group' ? parents.get(element) : undefined
    if (!selected.has(element) && !members) continue
    let source = element
    if (element.type === 'group' && members) {
      const xml = withoutChildren(element, members)
      source = {
        ...element,
        children: element.children.filter((child) => members.has(child.nvId!)),
        anchor: { ...element.anchor, originalXml: xml },
      }
    }
    const item = copyElementData(opened, slide, source)
    validateItem(opened, item)
    size += Buffer.byteLength(JSON.stringify(item))
    if (size > MAX_BYTES) throw new Error('复制内容超过64 MiB，请减少对象或媒体数量')
    items.push(item)
  }
  const animationCount = getSlideAnimations(slide).filter((animation) =>
    ids.has(animation.spid),
  ).length
  const remove = () => {
    for (const [parent, members] of parents) {
      const remaining = parent.children.filter((child) => !members.has(child.nvId!))
      if (!remaining.length) {
        if (!deleteElement(opened, slide, parent.id)) throw new Error('剪切组合已失效')
      } else {
        const previous = parent.anchor.originalXml
        parent.anchor.originalXml = withoutChildren(
          parent,
          new Set(remaining.map((child) => child.nvId!)),
        )
        parent.children = remaining
        slide.structureDirty = true
        cleanupDeletedElementResources(opened, slide, previous)
      }
    }
    for (const { element, parent } of resolved)
      if (!parent && !deleteElement(opened, slide, element.id)) throw new Error('剪切对象已失效')
    pruneTimingForSpids(slide, ids)
  }
  return { items, count: resolved.length, groupWrapperCount: parents.size, animationCount, remove }
}
