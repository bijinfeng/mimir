import { useState } from 'react'
import type { SlideElement } from '../../vendor/packages/pptx-engine/src/types.js'
import {
  ToolbarButton,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarNumberField,
  ToolbarSelect,
} from '../shell/EditorShell.js'
import {
  type PptxApply,
  type PptxTarget,
  usePptxAction,
  PptxControlPanel,
} from './PptxControlPanel.js'
type Segment = { id: number; op: 'M' | 'L' | 'Q' | 'C'; pts: number[] }
const round = (v: number) => Math.round(v * 100) / 100
const currentPath = (element: Extract<SlideElement, { type: 'shape' | 'text' }>) =>
  element.customGeometry?.path ??
  element.customGeometry?.strokePath ??
  element.customGeometry?.fillPath ??
  ''
const isClosed = (element: Extract<SlideElement, { type: 'shape' | 'text' }>) =>
  /Z\s*$/i.test(currentPath(element)) || !element.customGeometry
function initialSegments(element: Extract<SlideElement, { type: 'shape' | 'text' }>): Segment[] {
  const path = currentPath(element)
  if (!path)
    return [
      { id: 0, op: 'M', pts: [0, 0] },
      { id: 1, op: 'L', pts: [100, 0] },
      { id: 2, op: 'L', pts: [50, 100] },
    ]
  if (
    path
      .replace(/([MLQC])\s*([-+\d.eE,\s]+)/g, '')
      .replace(/Z/g, '')
      .trim()
  )
    return []
  const found = [...path.matchAll(/([MLQC])\s*([-+\d.eE,\s]+)/g)].map((m, id) => ({
    id,
    op: m[1] as Segment['op'],
    pts: m[2]!
      .trim()
      .split(/[,\s]+/)
      .map((n) => round(Number(n) * 100)),
  }))
  if (
    found.length &&
    found.every(
      (s) => s.pts.length === { M: 2, L: 2, Q: 4, C: 6 }[s.op] && s.pts.every(Number.isFinite),
    )
  )
    return found
  return []
}
export function PptxCurveControls({
  element,
  target,
  apply,
}: {
  element: Extract<SlideElement, { type: 'shape' | 'text' }>
  target: PptxTarget
  apply: PptxApply
}) {
  const { busy, run } = usePptxAction(apply)
  const [segments, setSegments] = useState(() => initialSegments(element))
  const [closed, setClosed] = useState(() => isClosed(element))
  const [selected, setSelected] = useState(0)
  const [newKind, setNewKind] = useState('C')
  const segment = segments[selected]
  const source = JSON.stringify({
    segments: initialSegments(element),
    closed: isClosed(element),
  })
  const changed = source !== JSON.stringify({ segments, closed })
  const path = segments.map((s) => `${s.op} ${s.pts.join(' ')}`).join(' ') + (closed ? ' Z' : '')
  const box = element.transform.offset
  const labels = { M: '起点', L: '直线', Q: '二次曲线', C: '三次曲线' }
  return (
    <PptxControlPanel busy={busy}>
      <ToolbarMenuFields label="曲线与路径">
        <ToolbarMenuNote>
          坐标以对象宽高的百分比表示。先选择节点，再调整端点与控制点；预览与保存使用同一路径。
        </ToolbarMenuNote>
        {segments.length ? (
          <svg
            className="mimir-pptx-path-preview"
            viewBox="-8 -8 116 116"
            role="img"
            aria-label="自定义路径预览"
          >
            <path
              d={path}
              fill={closed ? 'var(--me-primary-soft, #e8f0fe)' : 'none'}
              stroke="currentColor"
              strokeWidth="1.5"
            />
            {segments.map((s, i) => (
              <g key={s.id}>
                <circle
                  cx={s.pts.at(-2)}
                  cy={s.pts.at(-1)}
                  r={i === selected ? 3 : 1.5}
                  fill={i === selected ? 'var(--me-primary, #2563eb)' : 'currentColor'}
                />
                <text
                  x={(s.pts.at(-2) ?? 0) + 3}
                  y={(s.pts.at(-1) ?? 0) - 3}
                  fontSize="5"
                  fill="currentColor"
                >
                  {i + 1}
                </text>
              </g>
            ))}
          </svg>
        ) : (
          <ToolbarMenuNote>
            原路径包含无法直接转换的圆弧或公式坐标。可先选择新的曲线路径，原件在应用前保持不变。
          </ToolbarMenuNote>
        )}
        <ToolbarSelect
          label="路径闭合"
          value={closed ? 'true' : 'false'}
          options={[
            { value: 'true', label: '闭合并填充' },
            { value: 'false', label: '开放路径' },
          ]}
          onChange={(v) => setClosed(v === 'true')}
        />
        <ToolbarSelect
          label="当前节点"
          value={String(selected)}
          disabled={!segment}
          options={segments.map((s, i) => ({
            value: String(i),
            label: `${i + 1}. ${labels[s.op]}`,
          }))}
          onChange={(v) => setSelected(Number(v))}
        />
      </ToolbarMenuFields>
      {segment && (
        <ToolbarMenuFields label={`${selected + 1}. ${labels[segment.op]}`}>
          {Array.from({ length: segment.pts.length / 2 }, (_, pair) => (
            <ToolbarMenuFields
              key={pair}
              label={pair === segment.pts.length / 2 - 1 ? '节点位置' : `控制点 ${pair + 1}`}
            >
              {(['X', 'Y'] as const).map((axis, j) => (
                <ToolbarNumberField
                  key={axis}
                  label={`${axis === 'X' ? '横向' : '纵向'}（%）`}
                  value={segment.pts[pair * 2 + j]!}
                  min={-1000}
                  max={1000}
                  step={1}
                  onCommit={(v) =>
                    setSegments((items) =>
                      items.map((s, i) =>
                        i === selected
                          ? { ...s, pts: s.pts.map((n, k) => (k === pair * 2 + j ? v : n)) }
                          : s,
                      ),
                    )
                  }
                />
              ))}
            </ToolbarMenuFields>
          ))}
          <ToolbarButton
            label="删除当前路径节点"
            disabled={selected === 0 || segments.length < 3}
            disabledReason="路径至少保留起点和一个节点"
            onClick={() => {
              setSegments(segments.filter((_, i) => i !== selected))
              setSelected(Math.max(0, selected - 1))
            }}
          >
            删除节点
          </ToolbarButton>
        </ToolbarMenuFields>
      )}
      <ToolbarMenuFields label="添加节点">
        <ToolbarSelect
          label="新节点类型"
          value={newKind}
          options={[
            { value: 'L', label: '直线' },
            { value: 'Q', label: '二次曲线（一个控制点）' },
            { value: 'C', label: '三次曲线（两个控制点）' },
          ]}
          onChange={setNewKind}
        />
        <ToolbarButton
          label="添加路径节点"
          disabled={segments.length >= 100}
          disabledReason="每条路径最多100个节点"
          onClick={() => {
            const next: Segment[] = segments.length
              ? [
                  ...segments,
                  {
                    id: Math.max(...segments.map((item) => item.id)) + 1,
                    op: newKind as Segment['op'],
                    pts:
                      newKind === 'C'
                        ? [25, 0, 75, 100, 100, 100]
                        : newKind === 'Q'
                          ? [50, 0, 100, 100]
                          : [100, 100],
                  },
                ]
              : [
                  { id: 0, op: 'M', pts: [0, 0] },
                  { id: 1, op: 'C', pts: [25, 0, 75, 100, 100, 100] },
                ]
            setSegments(next)
            setSelected(next.length - 1)
          }}
        >
          添加节点
        </ToolbarButton>
      </ToolbarMenuFields>
      <ToolbarButton
        primary
        label="应用曲线路径"
        disabled={!changed || segments.length < 2 || box.cx <= 0 || box.cy <= 0}
        disabledReason={!changed ? '路径尚未修改' : '路径至少需要两个节点和有效的对象尺寸'}
        onClick={() =>
          void run({
            op: 'setShapeCustomGeometry',
            target,
            path: {
              w: box.cx,
              h: box.cy,
              cmds: [
                ...segments.map((s) => ({
                  op: s.op,
                  pts: s.pts.map((v, i) => Math.round((v * (i % 2 ? box.cy : box.cx)) / 100)),
                })),
                ...(closed ? [{ op: 'Z', pts: [] }] : []),
              ],
            },
          })
        }
      />
    </PptxControlPanel>
  )
}
