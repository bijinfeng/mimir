import type { GroupElement, SlideElement } from '../vendor/packages/pptx-engine/src/types.js'
import {
  elementDurableId,
  groupChildDurableId,
  matchesElementRef,
} from '../vendor/packages/pptx-engine/src/identity.js'

export interface PptxClipboardTarget {
  elementId: string
  group?: string
}
export interface PptxClipboardSelection {
  element: SlideElement
  parent?: GroupElement
  target: PptxClipboardTarget
}
function uniqueMatch(elements: readonly SlideElement[], ref: string) {
  const matches = elements.filter((element) => matchesElementRef(element, ref))
  if (matches.length !== 1) throw new Error('复制对象已失效或身份不唯一，请重新选择')
  return matches[0]!
}
/** Resolve every explicit target strictly. Never filter missing refs or expand whole groups. */
export function resolvePptxClipboardTargets(
  elements: readonly SlideElement[],
  targets: readonly PptxClipboardTarget[],
): PptxClipboardSelection[] {
  if (!targets.length || targets.length > 100) throw new Error('请选择1–100个复制对象')
  const seen = new Set<SlideElement>()
  const result = targets.map((target): PptxClipboardSelection => {
    let parent: GroupElement | undefined
    let element: SlideElement
    if (target.group !== undefined) {
      const group = uniqueMatch(elements, target.group)
      if (group.type !== 'group') throw new Error('复制成员的父组合已失效')
      parent = group
      const matches = group.children.filter(
        (child) =>
          groupChildDurableId(group, child) === target.elementId ||
          matchesElementRef(child, target.elementId),
      )
      if (matches.length !== 1) throw new Error('复制成员不属于指定组合或身份已失效')
      element = matches[0]!
      if (element.type === 'group')
        throw new Error('组内子组合和深层成员暂不支持单独复制，请选择整个顶层组合')
    } else element = uniqueMatch(elements, target.elementId)
    if (seen.has(element)) throw new Error('复制对象不能重复，包括同一对象的不同别名')
    seen.add(element)
    return { element, ...(parent ? { parent } : {}), target }
  })
  if (result.some((item) => item.parent && seen.has(item.parent)))
    throw new Error('不能同时复制整个组合及其成员，请调整选择')
  return result
}
/** Convert the unified selection into explicit parents without flattening a selected group. */
export function pptxClipboardTargets(
  elements: readonly SlideElement[],
  refs: readonly string[],
): PptxClipboardTarget[] {
  const rows: { element: SlideElement; parent?: GroupElement; depth: number }[] = []
  const visit = (items: readonly SlideElement[], depth: number, parent?: GroupElement) => {
    for (const element of items) {
      rows.push({ element, parent, depth })
      if (element.type === 'group') visit(element.children, depth + 1, element)
    }
  }
  visit(elements, 0)
  const targets = refs.map((ref) => {
    const matches = rows.filter(
      ({ element, parent }) =>
        matchesElementRef(element, ref) || (parent && groupChildDurableId(parent, element) === ref),
    )
    if (matches.length !== 1) throw new Error('复制对象已失效或身份不唯一，请重新选择')
    const match = matches[0]!
    if (match.depth > 1 || (match.depth === 1 && match.element.type === 'group'))
      throw new Error('深层组合暂不支持单独复制，请选择整个顶层组合')
    return {
      elementId: ref,
      ...(match.parent ? { group: elementDurableId(match.parent) ?? match.parent.id } : {}),
    }
  })
  resolvePptxClipboardTargets(elements, targets)
  return targets
}
