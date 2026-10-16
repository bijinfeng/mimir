import { ToolbarButton, ToolbarGroup, ToolbarSelect } from '../shell/EditorShell.js'
import { pptxWorkspaceModes, type PptxWorkspaceMode } from './PptxWorkspaceViews.js'
import type { SlideSize } from '../../vendor/packages/pptx-engine/src/types.js'

export interface PptxViewSettings {
  zoom: string
  ruler: boolean
  grid: boolean
  guides: boolean
}
export const defaultPptxView: PptxViewSettings = {
  zoom: 'fit',
  ruler: false,
  grid: false,
  guides: false,
}
export function PptxWorkspaceModeControls({
  mode,
  change,
}: {
  mode: PptxWorkspaceMode
  change(mode: PptxWorkspaceMode): void
}) {
  return (
    <ToolbarGroup label="演示文稿视图">
      {pptxWorkspaceModes.map((item) => (
        <ToolbarButton
          key={item.value}
          label={`${item.label}视图`}
          active={mode === item.value}
          onClick={() => change(item.value)}
        >
          {item.label}
        </ToolbarButton>
      ))}
    </ToolbarGroup>
  )
}
export function PptxViewControls({
  value,
  change,
}: {
  value: PptxViewSettings
  change: (next: PptxViewSettings) => void
}) {
  return (
    <ToolbarGroup label="画布视图">
      <ToolbarSelect
        label="幻灯片缩放"
        value={value.zoom}
        options={[
          { value: 'fit', label: '适合窗口' },
          ...['50', '75', '100', '125', '150', '200'].map((v) => ({ value: v, label: `${v}%` })),
        ]}
        onChange={(zoom) => change({ ...value, zoom })}
      />
      <ToolbarButton
        label="标尺（英寸）"
        active={value.ruler}
        onClick={() => change({ ...value, ruler: !value.ruler })}
      >
        标尺
      </ToolbarButton>
      <ToolbarButton
        label="网格线（半英寸）"
        active={value.grid}
        onClick={() => change({ ...value, grid: !value.grid })}
      >
        网格线
      </ToolbarButton>
      <ToolbarButton
        label="中心参考线"
        active={value.guides}
        onClick={() => change({ ...value, guides: !value.guides })}
      >
        参考线
      </ToolbarButton>
    </ToolbarGroup>
  )
}
export function PptxViewOverlay({
  size,
  settings,
}: {
  size: SlideSize
  settings: PptxViewSettings
}) {
  const w = size.cx / 914400,
    h = size.cy / 914400
  const xs = Array.from({ length: Math.ceil(w * 2) }, (_, i) => i / 2)
  const ys = Array.from({ length: Math.ceil(h * 2) }, (_, i) => i / 2)
  return (
    <>
      {(settings.grid || settings.guides) && (
        <svg
          className="mimir-pptx-view-overlay"
          aria-label="幻灯片辅助线"
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
        >
          {settings.grid && (
            <g className="mimir-pptx-gridlines">
              {xs.map((x) => (
                <line key={`x${x}`} x1={x} y1={0} x2={x} y2={h} />
              ))}
              {ys.map((y) => (
                <line key={`y${y}`} x1={0} y1={y} x2={w} y2={y} />
              ))}
            </g>
          )}
          {settings.guides && (
            <g className="mimir-pptx-center-guides">
              <line x1={w / 2} y1={0} x2={w / 2} y2={h} />
              <line x1={0} y1={h / 2} x2={w} y2={h / 2} />
            </g>
          )}
        </svg>
      )}
      {settings.ruler && (
        <>
          <svg
            className="mimir-pptx-ruler mimir-pptx-ruler--horizontal"
            aria-label="水平标尺（英寸）"
            viewBox={`0 0 ${w * 96} 22`}
            preserveAspectRatio="none"
          >
            {xs.map((x) => (
              <g key={x}>
                <line x1={x * 96} y1={x % 1 === 0 ? 12 : 17} x2={x * 96} y2={22} />
                {x % 1 === 0 && (
                  <text x={x * 96 + 3} y={10}>
                    {x}
                  </text>
                )}
              </g>
            ))}
          </svg>
          <svg
            className="mimir-pptx-ruler mimir-pptx-ruler--vertical"
            aria-label="垂直标尺（英寸）"
            viewBox={`0 0 22 ${h * 96}`}
            preserveAspectRatio="none"
          >
            {ys.map((y) => (
              <g key={y}>
                <line x1={y % 1 === 0 ? 12 : 17} y1={y * 96} x2={22} y2={y * 96} />
                {y % 1 === 0 && (
                  <text x={2} y={y * 96 + 11}>
                    {y}
                  </text>
                )}
              </g>
            ))}
          </svg>
        </>
      )}
    </>
  )
}
