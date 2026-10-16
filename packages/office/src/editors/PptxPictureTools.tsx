import { useEffect, useMemo, useState } from 'react'
import {
  Star,
  Heart,
  Check,
  X,
  Plus,
  TriangleAlert,
  Info,
  CircleHelp,
  Lightbulb,
  Settings,
  Clock,
  CalendarDays,
  Mail,
  Phone,
  Home,
  UserRound,
  UsersRound,
  Search,
  Globe,
  MapPin,
  ChartNoAxesCombined,
  ShieldCheck,
  Target,
  Trophy,
  type LucideIcon,
} from 'lucide-react'
import { renderToStaticMarkup } from 'react-dom/server'
import { removeBackground } from '../../vendor/apps/slides/src/renderer/cutout.js'
import { rasterizePptxSvg } from '../pptx-output.js'
import {
  ToolbarButton,
  ToolbarColorPicker,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarNumberField,
  ToolbarSelect,
} from '../shell/EditorShell.js'
import { PptxControlPanel } from './PptxControlPanel.js'
import type { PptxUpload } from './PptxAssetControls.js'

const icons: readonly [string, LucideIcon][] = [
  ['星形', Star],
  ['爱心', Heart],
  ['对勾', Check],
  ['叉号', X],
  ['加号', Plus],
  ['警告', TriangleAlert],
  ['信息', Info],
  ['帮助', CircleHelp],
  ['灯泡', Lightbulb],
  ['设置', Settings],
  ['时钟', Clock],
  ['日历', CalendarDays],
  ['邮件', Mail],
  ['电话', Phone],
  ['主页', Home],
  ['用户', UserRound],
  ['团队', UsersRound],
  ['搜索', Search],
  ['地球', Globe],
  ['位置', MapPin],
  ['增长', ChartNoAxesCombined],
  ['安全', ShieldCheck],
  ['目标', Target],
  ['奖杯', Trophy],
]
export function PptxIconControls({ slide, upload }: { slide: number; upload: PptxUpload }) {
  const [selected, setSelected] = useState('星形'),
    [color, setColor] = useState('#2563EB'),
    [size, setSize] = useState(72)
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('')
  const Icon = icons.find(([name]) => name === selected)![1]
  return (
    <PptxControlPanel busy={busy}>
      <ToolbarMenuFields label="插入图标">
        <div className="mimir-pptx-icon-gallery">
          {icons.map(([name, Item]) => (
            <ToolbarButton
              key={name}
              label={name}
              active={name === selected}
              onClick={() => setSelected(name)}
            >
              <Item size={22} />
            </ToolbarButton>
          ))}
        </div>
        <ToolbarColorPicker
          label="图标颜色"
          options={['#2563EB', '#111827', '#FFFFFF', '#DC2626', '#16A34A', '#D97706'].map(
            (value) => ({ value, label: value, swatch: value }),
          )}
          value={color}
          onPick={setColor}
        />
        <ToolbarNumberField
          label="图标宽度（磅）"
          value={size}
          min={6}
          max={720}
          onCommit={setSize}
        />
        <div className="mimir-pptx-icon-preview" style={{ color }}>
          <Icon size={72} aria-label={`${selected}预览`} />
        </div>
      </ToolbarMenuFields>
      <ToolbarButton
        primary
        label="插入所选图标"
        onClick={() => {
          setBusy(true)
          setMessage('')
          void (async () => {
            const svg = renderToStaticMarkup(
              <Icon xmlns="http://www.w3.org/2000/svg" width={512} height={512} color={color} />,
            )
            const bytes = await rasterizePptxSvg(svg, 512, 512)
            if (
              await upload(
                { kind: 'picture', slide, widthPt: size, keepCrop: false },
                new File([bytes], `${selected}.png`, { type: 'image/png' }),
              )
            )
              setMessage('已插入图标')
          })()
            .catch((cause: unknown) =>
              setMessage(cause instanceof Error ? cause.message : '图标生成失败'),
            )
            .finally(() => setBusy(false))
        }}
      />
      <ToolbarMenuNote>
        图标以透明 PNG 嵌入，可用图片工具调整。图形来自当前应用使用的 Lucide 图标库。
      </ToolbarMenuNote>
      {message && <span role="status">{message}</span>}
    </PptxControlPanel>
  )
}
export function PptxCutoutControls({
  slide,
  elementId,
  source,
  upload,
}: {
  slide: number
  elementId: string
  source: string
  upload: PptxUpload
}) {
  const [tolerance, setTolerance] = useState(20),
    [mode, setMode] = useState('removed')
  const [original, setOriginal] = useState<ImageData | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('')
  useEffect(() => {
    let cancelled = false
    const image = new Image()
    image.addEventListener(
      'load',
      () => {
        if (cancelled) return
        if (image.naturalWidth * image.naturalHeight > 12_000_000) {
          setMessage('图片超过 1200 万像素，请先缩小后重试')
          return
        }
        const canvas = document.createElement('canvas')
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return
        ctx.drawImage(image, 0, 0)
        setOriginal(ctx.getImageData(0, 0, canvas.width, canvas.height))
      },
      { once: true },
    )
    image.addEventListener(
      'error',
      () => {
        if (!cancelled) setMessage('无法解码原图，请换用 PNG 或 JPEG')
      },
      { once: true },
    )
    image.src = source
    return () => {
      cancelled = true
    }
  }, [source])
  const preview = useMemo(() => {
    if (!original) return ''
    const result = removeBackground(original, tolerance)
    const canvas = document.createElement('canvas')
    canvas.width = original.width
    canvas.height = original.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    ctx.putImageData(new ImageData(result.data, original.width, original.height), 0, 0)
    return canvas.toDataURL('image/png')
  }, [original, tolerance])
  return (
    <PptxControlPanel busy={busy}>
      <ToolbarMenuFields label="图片去背景">
        <ToolbarNumberField
          label="颜色容差（%）"
          value={tolerance}
          min={0}
          max={100}
          step={5}
          onCommit={setTolerance}
        />
        <ToolbarSelect
          label="预览"
          value={mode}
          options={[
            { value: 'removed', label: '处理结果' },
            { value: 'original', label: '原图' },
          ]}
          onChange={setMode}
        />
        <div className="mimir-pptx-cutout-preview">
          {(preview || source) && (
            <img alt="去背景预览" src={mode === 'original' ? source : preview || source} />
          )}
        </div>
        <ToolbarMenuNote>
          移除与图片边缘相连的相近颜色。适合纯色背景；增加容差会移除更多颜色。应用保留原尺寸、位置、裁切和效果。
        </ToolbarMenuNote>
      </ToolbarMenuFields>
      <ToolbarButton
        primary
        label="应用去背景"
        disabled={!preview || !original}
        disabledReason="正在准备图片预览"
        onClick={() => {
          setBusy(true)
          void (async () => {
            const bytes = Uint8Array.from(atob(preview.split(',')[1]!), (c) => c.charCodeAt(0))
            if (
              await upload(
                { kind: 'picture', slide, elementId, widthPt: 72, keepCrop: true },
                new File([bytes], 'cutout.png', { type: 'image/png' }),
              )
            )
              setMessage('已应用去背景')
          })()
            .catch((cause: unknown) =>
              setMessage(cause instanceof Error ? cause.message : '去背景失败'),
            )
            .finally(() => setBusy(false))
        }}
      />
      {message && <span role="status">{message}</span>}
    </PptxControlPanel>
  )
}
