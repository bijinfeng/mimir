import {
  runLayoutScript,
  type LayoutScriptElement,
} from '../../vendor/apps/slides/src/renderer/ai/layout-script.js'
import type { RenderNode } from '../../vendor/packages/pptx-render/src/render-tree.js'
import { renderSlide } from '../pptx-render.js'
import type { PptxEditSession } from '../pptx.js'
import { auditSlideFindings } from '../../vendor/packages/pipelines/src/slides/layout-audit.js'

const EMU_PER_PX = 9525

function collect(
  nodes: readonly RenderNode[],
  ox = 0,
  oy = 0,
  parent?: { id: string; top: boolean },
): LayoutScriptElement[] {
  return nodes.flatMap((node): LayoutScriptElement[] => {
    const shape = node.type === 'shape' || node.type === 'text' ? node : null
    const textLayouts = shape?.text
      ? [shape.text]
      : node.type === 'table'
        ? node.cells.flatMap((cell) => (cell.text ? [cell.text] : []))
        : []
    const runs = textLayouts.flatMap((text) => text.lines.flatMap((line) => line.runs))
    const weights = new Map<string, number>()
    for (const run of runs)
      weights.set(run.color, (weights.get(run.color) ?? 0) + run.text.trim().length)
    const textColor = [...weights].toSorted((a, b) => b[1] - a[1])[0]?.[0]
    const item: LayoutScriptElement = {
      id: node.durableId ?? node.sourceId,
      type: node.type,
      text: textLayouts
        .map((text) =>
          text.lines.map((line) => line.runs.map((run) => run.text).join('')).join('\n'),
        )
        .join('\n'),
      x: ox + node.box.x,
      y: oy + node.box.y,
      w: node.box.w,
      h: node.box.h,
      rotation: node.box.rotationDeg,
      ...(parent ? { inGroup: true } : {}),
      ...(parent?.top ? { groupId: parent.id } : {}),
      ...(node.decoration ? { locked: true } : {}),
      ...(runs.length
        ? {
            fontSizePt: Math.max(...runs.map((run) => run.fontSizePx)) * 0.75,
            textColor,
          }
        : {}),
      ...(shape?.fill.kind === 'solid' ? { fill: shape.fill.color } : {}),
      ...(shape?.stroke ? { strokeColor: shape.stroke.color } : {}),
    }
    return [
      item,
      ...(node.type === 'group'
        ? collect(node.children, item.x, item.y, { id: item.id, top: !parent })
        : []),
    ]
  })
}

export function auditPptxSlide(session: PptxEditSession, slide: number) {
  const rendered = renderSlide(session.view(), slide, { fitWidthPx: session.size.cx / EMU_PER_PX })
  if (!rendered) throw new Error('幻灯片序号已失效')
  const ids = new Map<string, string>()
  const visit = (nodes: readonly RenderNode[]) => {
    for (const node of nodes) {
      ids.set(node.sourceId, node.durableId ?? node.sourceId)
      if (node.type === 'group') visit(node.children)
    }
  }
  visit(rendered.tree.nodes)
  const findings = auditSlideFindings(rendered.tree, (id) => ids.get(id) ?? id)
  return { passed: findings.length === 0, findings }
}

/** Fixed upstream bounded interpreter; scripts collect operations, never run ambient JS. */
export function compilePptxSlideScript(session: PptxEditSession, slide: number, code: unknown) {
  if (typeof code !== 'string' || !code.trim() || code.length > 30000)
    throw new Error('编辑脚本不能为空或超过30000字符')
  const rendered = renderSlide(session.view(), slide, { fitWidthPx: session.size.cx / EMU_PER_PX })
  if (!rendered) throw new Error('幻灯片序号已失效')
  const elements = collect(rendered.tree.nodes)
  const result = runLayoutScript(code, elements, { w: rendered.widthPx, h: rendered.heightPx })
  if (result.error) throw new Error(`脚本未应用：${result.error}`)
  const target = (id: string, group?: string) => ({
    target: { slide, el: id },
    ...(group ? { group } : {}),
  })
  const ops: Record<string, unknown>[] = result.ops.map((box) => ({
    op: 'setTransform',
    ...target(box.id, box.groupId),
    [box.groupId ? 'absBox' : 'box']: {
      x: Math.round(box.x * EMU_PER_PX),
      y: Math.round(box.y * EMU_PER_PX),
      cx: Math.round(box.w * EMU_PER_PX),
      cy: Math.round(box.h * EMU_PER_PX),
    },
    rotDeg: box.rotation,
    resizeTableGrid: true,
  }))
  for (const edit of result.edits) {
    const at = target(edit.id, edit.groupId)
    switch (edit.kind) {
      case 'text':
        ops.push({ op: 'setText', ...at, paragraphs: edit.paragraphs })
        break
      case 'fill':
        ops.push({ op: 'setFill', ...at, fill: edit.fill })
        break
      case 'stroke':
        ops.push({
          op: 'setStroke',
          ...at,
          stroke: edit.stroke
            ? { color: edit.stroke.color, widthEmu: Math.round(edit.stroke.widthPt * 12700) }
            : null,
        })
        break
      case 'style': {
        const { align, fontSize, ...rest } = edit.style
        if (fontSize !== undefined || Object.keys(rest).length)
          ops.push({
            op: 'setFont',
            ...at,
            font: { ...rest, ...(fontSize === undefined ? {} : { fontSizePt: fontSize }) },
          })
        if (align !== undefined) ops.push({ op: 'setParagraphFormat', ...at, format: { align } })
      }
    }
  }
  if (ops.length > 50) throw new Error('脚本产生超过50项操作，请分成较小的完整步骤')
  return { ops, logs: result.logs, returned: result.returned, elements }
}
