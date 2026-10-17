import { Button, Checkbox, Collapse, Input, InputNumber } from 'antd'
import { Download, FileOutput, Printer } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { PdfLocalInfo, PdfDrawingInput } from '@mimir/shared'
import { ToolbarFileButton, ToolbarSelect } from '../shell/EditorShell.js'
import { PdfInspectorHeader, type PdfPanelAction } from './PdfInspector.js'
import type { PdfLocalOutput } from '../agent/pdf-local-agent.js'
export type PdfLocalPanelMode = 'pages' | 'drawing' | 'stamps' | 'properties' | 'signature'
const labels = {
  signature: '签名与印章',
  pages: '页面',
  drawing: '绘图',
  stamps: '水印与页眉',
  properties: '文档属性',
}
function printOutput(output: PdfLocalOutput) {
  const url = URL.createObjectURL(
    new Blob([output.bytes.slice().buffer], { type: 'application/pdf' }),
  )
  const frame = document.createElement('iframe')
  frame.title = 'PDF 打印'
  frame.style.position = 'fixed'
  frame.style.width = '1px'
  frame.style.height = '1px'
  frame.style.left = '-10000px'
  frame.src = url
  frame.addEventListener(
    'load',
    () => {
      frame.contentWindow?.focus()
      frame.contentWindow?.print()
    },
    { once: true },
  )
  document.body.append(frame)
  setTimeout(() => {
    frame.remove()
    URL.revokeObjectURL(url)
  }, 120000)
}
function download(output: PdfLocalOutput) {
  const url = URL.createObjectURL(
    new Blob([output.bytes.slice().buffer], { type: 'application/pdf' }),
  )
  const a = document.createElement('a')
  a.href = url
  a.download = output.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}
interface NumberFieldProps {
  label: string
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  step?: number
}
function NumberField(props: NumberFieldProps) {
  return (
    <label className="mimir-pdf-inspector__control">
      <span>{props.label}</span>
      <ConciseNumberInput key={props.value} {...props} />
    </label>
  )
}
function ConciseNumberInput({
  label,
  value,
  onChange,
  min = 0,
  max = 14400,
  step = 1,
}: NumberFieldProps) {
  // Format only the view: unrelated edits must retain the exact source geometry.
  const display = String(Number(value.toPrecision(6)))
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    setDraft(null)
    if (draft === null || draft.trim() === '') return
    const parsed = Number(draft)
    if (!Number.isFinite(parsed) || parsed === Number(display)) return
    const next = Math.min(max, Math.max(min, parsed))
    if (next !== value) onChange(next)
  }
  return (
    <InputNumber<string>
      style={{ width: '100%' }}
      aria-label={label}
      title={label}
      stringMode
      value={draft ?? display}
      min={String(min)}
      max={String(max)}
      step={String(step)}
      controls={false}
      // InputNumber otherwise expands tiny exponent values into long zero strings.
      formatter={(_, info) => (info.userTyping ? info.input : (draft ?? display))}
      onInput={setDraft}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit()
        if (event.key === 'Escape') setDraft(null)
      }}
    />
  )
}
function Field({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (s: string) => void
}) {
  return (
    <label className="mimir-pdf-inspector__control">
      <span>{label}</span>
      <Input value={value} aria-label={label} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}
export function PdfLocalPanel({
  mode: initial,
  page,
  pageCount,
  info,
  outputs,
  busy,
  error,
  onClose,
  onAction,
  onModeChange,
  drawingControls,
  drawingFooter,
  selectedDrawingId,
  onSelectDrawing,
}: {
  mode: PdfLocalPanelMode
  onModeChange?(mode: PdfLocalPanelMode): void
  drawingControls?: ReactNode
  drawingFooter?: ReactNode
  selectedDrawingId?: string | null
  onSelectDrawing?(id: string | null): void
  page: number
  pageCount: number
  info?: PdfLocalInfo
  outputs: PdfLocalOutput[]
  busy: boolean
  error: string | null
  onClose: () => void
  onAction: PdfPanelAction
}) {
  const contentRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (outputs.length) contentRef.current?.scrollTo?.({ top: 0, behavior: 'smooth' })
  }, [outputs])
  const [mode, setMode] = useState(initial)
  const [feedback, setFeedback] = useState<string | null>(null)
  const act = async (tool: string, args: Record<string, unknown>) => {
    setFeedback(null)
    const result = await onAction(tool, args)
    if (result?.ok)
      setFeedback(
        result.changed
          ? '已应用'
          : tool === 'get_document_properties'
            ? '已刷新文档属性'
            : '输出已就绪，可在面板顶部下载',
      )
  }
  return (
    <section
      className="mimir-pdf-panel mimir-pdf-local-panel"
      role="region"
      aria-label="PDF 文档工具面板"
    >
      <PdfInspectorHeader
        title={labels[mode]}
        detail={`当前第 ${page} 页 · 共 ${pageCount} 页`}
        busy={busy}
        refreshLabel="刷新文档属性"
        closeLabel="关闭文档工具"
        onRefresh={() => void onAction('get_document_properties', {})}
        onClose={onClose}
      />
      <div
        className="mimir-pdf-local-tabs"
        role="tablist"
        aria-label="文档工具类别"
        onKeyDown={(event) => {
          const keys = Object.keys(labels) as PdfLocalPanelMode[]
          const current = keys.indexOf(mode)
          const next =
            event.key === 'ArrowRight' || event.key === 'ArrowDown'
              ? (current + 1) % keys.length
              : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                ? (current + keys.length - 1) % keys.length
                : event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? keys.length - 1
                    : null
          if (next === null) return
          event.preventDefault()
          setMode(keys[next]!)
          onModeChange?.(keys[next]!)
          setFeedback(null)
          event.currentTarget.querySelectorAll<HTMLButtonElement>('button')[next]?.focus()
        }}
      >
        {(Object.entries(labels) as Array<[PdfLocalPanelMode, string]>).map(([key, label]) => (
          <Button
            key={key}
            role="tab"
            aria-selected={mode === key}
            tabIndex={mode === key ? 0 : -1}
            type={mode === key ? 'primary' : 'text'}
            onClick={() => {
              setMode(key)
              onModeChange?.(key)
              setFeedback(null)
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="mimir-pdf-inspector__content" ref={contentRef}>
        {error && (
          <p className="mimir-pdf-inspector__error" role="alert">
            {error}
          </p>
        )}
        {feedback && (
          <p className="mimir-pdf-inspector__hint" role="status">
            {feedback}
          </p>
        )}
        {mode === 'pages' && outputs.length > 0 && (
          <>
            <h3 className="mimir-pdf-inspector__section-title">输出文件（{outputs.length}）</h3>
            <div className="mimir-pdf-local-outputs">
              {outputs.map((o) => (
                <div key={o.name} className="mimir-pdf-local-actions">
                  <Button icon={<Download size={14} />} onClick={() => download(o)}>
                    {o.name}
                  </Button>
                  <Button
                    icon={<Printer size={14} />}
                    aria-label={`打印 ${o.name}`}
                    onClick={() => printOutput(o)}
                  >
                    打印
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}
        {mode === 'pages' ? (
          <PageTools page={page} pageCount={pageCount} busy={busy} act={act} />
        ) : mode === 'drawing' ? (
          <>
            {drawingControls}
            <Collapse
              ghost
              size="small"
              items={[
                {
                  key: 'precise-drawing',
                  label: '精确数值绘图',
                  children: (
                    <>
                      <p className="mimir-pdf-inspector__meta">
                        新建或选择已应用的绘图。这里的参数不会修改画布草稿。
                      </p>
                      <DrawingTools
                        key={page}
                        page={page}
                        info={info}
                        busy={busy || !info}
                        act={act}
                        selectedId={selectedDrawingId}
                        onSelect={onSelectDrawing}
                      />
                    </>
                  ),
                },
              ]}
            />
          </>
        ) : mode === 'stamps' ? (
          <StampTools
            key={JSON.stringify([info?.watermark, info?.headerFooter])}
            info={info}
            busy={busy || !info}
            act={act}
          />
        ) : (
          <PropertyTools
            key={JSON.stringify([info?.metadata, info?.outline])}
            info={info}
            busy={busy || !info}
            act={act}
          />
        )}
      </div>
      {mode === 'drawing' && drawingFooter}
    </section>
  )
}
type Act = (tool: string, args: Record<string, unknown>) => Promise<void>
function PageTools({
  page,
  pageCount,
  busy,
  act,
}: {
  page: number
  pageCount: number
  busy: boolean
  act: Act
}) {
  const [range, setRange] = useState(String(page)),
    [sourceRange, setSourceRange] = useState('all'),
    [file, setFile] = useState<File | null>(null),
    [count, setCount] = useState(1),
    [grid, setGrid] = useState('4'),
    [perSheet, setPerSheet] = useState(4),
    [direction, setDirection] = useState('horizontal'),
    [separator, setSeparator] = useState(false),
    [crop, setCrop] = useState({ left: 0.1, top: 0.1, right: 0.9, bottom: 0.9 })
  return (
    <>
      <div className="mimir-pdf-local-group">
        <Button
          icon={<Download size={14} />}
          disabled={busy}
          onClick={() => void act('export_pdf', {})}
        >
          导出当前 PDF / 打印
        </Button>
        <Field label="目标页码" value={range} onChange={setRange} />
        <p className="mimir-pdf-inspector__meta">例如 1-3,5；all 表示全部页面。</p>
        <Button
          icon={<FileOutput size={14} />}
          disabled={busy}
          onClick={() => void act('extract_pages', { pages: range })}
        >
          抽取为新 PDF
        </Button>
      </div>
      <div className="mimir-pdf-local-group">
        <h3 className="mimir-pdf-inspector__section-title">导入与替换</h3>
        <ToolbarFileButton
          label="选择来源 PDF"
          accept="application/pdf,.pdf"
          disabled={busy}
          onPick={setFile}
        >
          选择来源 PDF
        </ToolbarFileButton>
        <p className="mimir-pdf-inspector__meta">
          {file?.name ?? '选择另一份 PDF，保留当前原件。'}
        </p>
        <Field label="来源页码" value={sourceRange} onChange={setSourceRange} />
        <div className="mimir-pdf-local-actions">
          <Button
            type="primary"
            disabled={busy || !file}
            onClick={() =>
              void act('import_pages', {
                after_page: page,
                source_pages: sourceRange,
                assetFile: file,
              })
            }
          >
            插入当前页后
          </Button>
          <Button
            disabled={busy || !file}
            onClick={() =>
              void act('replace_pages', {
                pages: range,
                source_pages: sourceRange,
                assetFile: file,
              })
            }
          >
            替换目标页
          </Button>
        </div>
      </div>
      <div className="mimir-pdf-local-group">
        <h3 className="mimir-pdf-inspector__section-title">按份拆分</h3>
        <NumberField
          label="每份页数"
          value={count}
          min={1}
          max={Math.max(1, pageCount - 1)}
          onChange={setCount}
        />
        <Button
          disabled={busy || pageCount < 2}
          onClick={() => void act('split_pdf', { pages_per_file: count })}
        >
          拆分为多个文件
        </Button>
      </div>
      <div className="mimir-pdf-local-group">
        <h3 className="mimir-pdf-inspector__section-title">裁切与拼版</h3>
        <label className="mimir-pdf-inspector__control">
          <span>每页拆为</span>
          <ToolbarSelect
            label="拆页网格"
            value={grid}
            options={[
              { value: '2', label: '2 页' },
              { value: '4', label: '4 页（2 × 2）' },
              { value: '9', label: '9 页（3 × 3）' },
            ]}
            onChange={setGrid}
          />
        </label>
        <Button disabled={busy} onClick={() => void act('split_pages', { per_page: Number(grid) })}>
          拆页为新 PDF
        </Button>
        <NumberField label="每张纸页数" value={perSheet} min={2} max={16} onChange={setPerSheet} />
        <ToolbarSelect
          label="拼版方向"
          value={direction}
          options={[
            { value: 'horizontal', label: '从左向右' },
            { value: 'vertical', label: '从上向下' },
          ]}
          onChange={setDirection}
        />
        <Checkbox checked={separator} onChange={(e) => setSeparator(e.target.checked)}>
          绘制分隔线
        </Checkbox>
        <Button
          disabled={busy}
          onClick={() => void act('merge_pages', { per_sheet: perSheet, direction, separator })}
        >
          拼版为新 PDF
        </Button>
      </div>
      <div className="mimir-pdf-local-group">
        <h3 className="mimir-pdf-inspector__section-title">精确裁剪</h3>
        <p className="mimir-pdf-inspector__meta">保留区域，按页面宽高的 0–1 比例。</p>
        <div className="mimir-pdf-inspector__grid">
          {(['left', 'top', 'right', 'bottom'] as const).map((k, i) => (
            <NumberField
              key={k}
              label={['左边界', '上边界', '右边界', '下边界'][i]!}
              value={crop[k]}
              max={1}
              step={0.05}
              onChange={(v) => setCrop({ ...crop, [k]: v })}
            />
          ))}
        </div>
        <Button
          type="primary"
          disabled={busy}
          onClick={() => void act('crop_pages', { pages: range, ...crop })}
        >
          裁剪目标页
        </Button>
      </div>
    </>
  )
}
function DrawingTools({
  selectedId,
  onSelect,
  page,
  info,
  busy,
  act,
}: {
  page: number
  info?: PdfLocalInfo
  busy: boolean
  act: Act
  selectedId?: string | null
  onSelect?(id: string | null): void
}) {
  const [localId, setLocalId] = useState('new')
  const id = selectedId === undefined ? localId : (selectedId ?? 'new')
  const setId = (value: string) => {
    setLocalId(value)
    onSelect?.(value === 'new' ? null : value)
  }
  const drawings = info?.drawings.filter((d) => d.page === page) ?? []
  const selected = drawings.find((d) => d.id === id)
  const sourceKey = JSON.stringify(selected)
  const [edit, setEdit] = useState<{
    id: string
    sourceKey: string | undefined
    value: PdfDrawingInput
  } | null>(null)
  const original: PdfDrawingInput = selected
    ? (({ id: _, ...value }) => value)(selected)
    : {
        kind: 'rect',
        page,
        x: 40,
        y: 60,
        width: 120,
        height: 60,
        color: '#2563EB',
        thickness: 2,
        opacity: 1,
      }
  // Discard an old source's draft permanently. Merely hiding it would revive
  // the applied edit when undo returns to the same source values later.
  const sameSource = edit?.id === id && edit.sourceKey === sourceKey
  if (edit && !sameSource) setEdit(null)
  const draft = sameSource ? edit.value : original
  const patch = (p: Partial<PdfDrawingInput>) =>
    setEdit({ id, sourceKey, value: { ...draft, ...p } })
  return (
    <>
      <div className="mimir-pdf-local-group">
        <ToolbarSelect
          label="选择绘图"
          value={id}
          options={[
            { value: 'new', label: '新建绘图' },
            ...drawings.map((d, i) => ({
              value: d.id,
              label: `${i + 1}. ${{ rect: '矩形', ellipse: '椭圆', line: '直线', arrow: '箭头', ink: '自由笔迹', check: '勾选标记', cross: '叉号标记' }[d.kind]}`,
            })),
          ]}
          onChange={setId}
        />
        <ToolbarSelect
          label="绘图形状"
          value={draft.kind}
          options={[
            { value: 'rect', label: '矩形' },
            { value: 'ellipse', label: '椭圆' },
            { value: 'line', label: '直线' },
            { value: 'arrow', label: '箭头' },
            { value: 'check', label: '静态勾选标记' },
            { value: 'cross', label: '静态叉号标记' },
            ...(draft.kind === 'ink' ? [{ value: 'ink', label: '自由笔迹' }] : []),
          ]}
          onChange={(v) => patch({ kind: v as PdfDrawingInput['kind'] })}
        />
        <div className="mimir-pdf-inspector__grid">
          <NumberField
            label="左侧距离 pt"
            value={draft.x}
            min={id === 'new' ? 0 : -Number.MAX_VALUE}
            max={Number.MAX_VALUE}
            onChange={(x) => patch({ x })}
          />
          <NumberField
            label="顶部距离 pt"
            value={draft.y}
            min={id === 'new' ? 0 : -Number.MAX_VALUE}
            max={Number.MAX_VALUE}
            onChange={(y) => patch({ y })}
          />
          <NumberField
            label="宽度 pt"
            value={draft.width}
            min={Number.MIN_VALUE}
            max={id === 'new' ? 14400 : Number.MAX_VALUE}
            onChange={(width) => patch({ width })}
          />
          <NumberField
            label="高度 pt"
            value={draft.height}
            min={Number.MIN_VALUE}
            max={id === 'new' ? 14400 : Number.MAX_VALUE}
            onChange={(height) => patch({ height })}
          />
          <NumberField
            label="线宽 pt"
            value={draft.thickness}
            min={id === 'new' ? 0.25 : Number.MIN_VALUE}
            max={id === 'new' ? 50 : Number.MAX_VALUE}
            step={0.25}
            onChange={(thickness) => patch({ thickness })}
          />
          <NumberField
            label="不透明度"
            value={draft.opacity}
            max={1}
            step={0.1}
            onChange={(opacity) => patch({ opacity })}
          />
        </div>
        {draft.kind !== 'ink' && (
          <ToolbarSelect
            label="绘图方向"
            value={String(draft.rotation ?? 0)}
            options={[0, 90, 180, 270].map((r) => ({ value: String(r), label: `${r}°` }))}
            onChange={(v) => patch({ rotation: Number(v) as 0 | 90 | 180 | 270 })}
          />
        )}
        <Field label="线条颜色" value={draft.color} onChange={(color) => patch({ color })} />
        <Field
          label="填充颜色（可留空）"
          value={draft.fill ?? ''}
          onChange={(fill) => patch({ fill: fill || undefined })}
        />
        <Button
          type={onSelect ? 'default' : 'primary'}
          block
          disabled={busy}
          onClick={() =>
            void act(id === 'new' ? 'add_drawing' : 'update_drawing', {
              ...(id === 'new' ? {} : { id }),
              drawing: draft,
            })
          }
        >
          {id === 'new' ? '添加绘图' : '应用绘图'}
        </Button>
        {id !== 'new' && (
          <Button
            danger
            disabled={busy}
            onClick={() => {
              void act('delete_drawing', { id })
              setId('new')
            }}
          >
            删除绘图
          </Button>
        )}
      </div>
    </>
  )
}
function StampTools({ info, busy, act }: { info?: PdfLocalInfo; busy: boolean; act: Act }) {
  const [wm, setWm] = useState(
    info?.watermark ?? { text: '', angle: 45, opacity: 0.15, color: '#808080', size_ratio: 0.15 },
  )
  const [hf, setHf] = useState(
    info?.headerFooter ?? {
      header_left: '',
      header_center: '',
      header_right: '',
      footer_left: '',
      footer_center: '',
      footer_right: '',
      page_number: false,
      start_at: 1,
      font_size: 10,
      color: '#555555',
    },
  )
  return (
    <>
      <div className="mimir-pdf-local-group">
        <Field label="水印文字" value={wm.text} onChange={(text) => setWm({ ...wm, text })} />
        <div className="mimir-pdf-inspector__grid">
          <NumberField
            label="旋转角度"
            value={wm.angle}
            min={-180}
            max={180}
            onChange={(angle) => setWm({ ...wm, angle })}
          />
          <NumberField
            label="水印不透明度"
            value={wm.opacity}
            max={1}
            step={0.05}
            onChange={(opacity) => setWm({ ...wm, opacity })}
          />
          <NumberField
            label="相对页面宽度"
            value={wm.size_ratio}
            min={0.02}
            max={0.5}
            step={0.01}
            onChange={(size_ratio) => setWm({ ...wm, size_ratio })}
          />
        </div>
        <Field label="水印颜色" value={wm.color} onChange={(color) => setWm({ ...wm, color })} />
        <Button type="primary" disabled={busy} onClick={() => void act('set_watermark', wm)}>
          应用水印
        </Button>
        <p className="mimir-pdf-inspector__meta">清空文字可移除本编辑器添加的水印。</p>
      </div>
      <div className="mimir-pdf-local-group">
        <h3 className="mimir-pdf-inspector__section-title">页眉与页脚</h3>
        {(
          [
            'header_left',
            'header_center',
            'header_right',
            'footer_left',
            'footer_center',
            'footer_right',
          ] as const
        ).map((key, i) => (
          <Field
            key={key}
            label={['页眉左', '页眉中', '页眉右', '页脚左', '页脚中', '页脚右'][i]!}
            value={hf[key]}
            onChange={(v) => setHf({ ...hf, [key]: v })}
          />
        ))}
        <p className="mimir-pdf-inspector__meta">
          使用 {'{page}'} 和 {'{total}'} 插入页码与总页数。
        </p>
        <Checkbox
          checked={hf.page_number}
          onChange={(e) => setHf({ ...hf, page_number: e.target.checked })}
        >
          页脚居中显示页码
        </Checkbox>
        <div className="mimir-pdf-inspector__grid">
          <NumberField
            label="起始页码"
            value={hf.start_at}
            max={1000000}
            onChange={(start_at) => setHf({ ...hf, start_at })}
          />
          <NumberField
            label="页眉页脚字号"
            value={hf.font_size}
            min={6}
            max={72}
            onChange={(font_size) => setHf({ ...hf, font_size })}
          />
        </div>
        <Field
          label="页眉页脚颜色"
          value={hf.color}
          onChange={(color) => setHf({ ...hf, color })}
        />
        <Button type="primary" disabled={busy} onClick={() => void act('set_header_footer', hf)}>
          应用页眉页脚
        </Button>
      </div>
    </>
  )
}
function PropertyTools({ info, busy, act }: { info?: PdfLocalInfo; busy: boolean; act: Act }) {
  const [metadata, setMetadata] = useState(
    info?.metadata ?? { title: '', author: '', subject: '', keywords: '' },
  )
  const [outline, setOutline] = useState(
    (info?.outline ?? []).map((e) => `${'  '.repeat(e.level)}${e.page} | ${e.title}`).join('\n'),
  )
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <div className="mimir-pdf-local-group">
        {(['title', 'author', 'subject', 'keywords'] as const).map((key, i) => (
          <Field
            key={key}
            label={['标题', '作者', '主题', '关键词'][i]!}
            value={metadata[key] ?? ''}
            onChange={(v) => setMetadata({ ...metadata, [key]: v })}
          />
        ))}
        <Button
          type="primary"
          disabled={busy}
          onClick={() => void act('set_metadata', { metadata })}
        >
          应用文档属性
        </Button>
      </div>
      <div className="mimir-pdf-local-group">
        <h3 className="mimir-pdf-inspector__section-title">书签目录</h3>
        <p className="mimir-pdf-inspector__meta">每行“页码 | 标题”；两空格缩进一级。</p>
        <Input.TextArea
          rows={7}
          value={outline}
          aria-label="书签目录"
          onChange={(e) => setOutline(e.target.value)}
        />
        {error && <p role="alert">{error}</p>}
        <Button
          disabled={busy}
          onClick={() => {
            try {
              const entries = outline.trim()
                ? outline
                    .split('\n')
                    .filter((s) => s.trim())
                    .map((s) => {
                      const m = /^( *)(\d+)\s*\|\s*(.+)$/.exec(s)
                      if (!m || m[1]!.length % 2)
                        throw new Error('请按“页码 | 标题”填写，层级用两个空格缩进')
                      return { page: Number(m[2]), title: m[3]!, level: m[1]!.length / 2 }
                    })
                : []
              setError(null)
              void act('set_outline', { entries })
            } catch (e) {
              setError(String(e))
            }
          }}
        >
          应用书签目录
        </Button>
      </div>
    </>
  )
}

export function PdfLocalAssetRequest({
  tool,
  onContinue,
  onCancel,
}: {
  tool: string
  onContinue(file: File): void
  onCancel(): void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  return (
    <section className="mimir-pdf-panel" role="region" aria-label="选择 PDF 来源文件">
      <PdfInspectorHeader
        title={tool === 'replace_pages' ? '替换页面' : '导入页面'}
        detail="AI 正在等待您选择来源文件"
        busy={false}
        refreshLabel="清除来源文件"
        closeLabel="取消文件选择"
        onRefresh={() => setFile(null)}
        onClose={onCancel}
      />
      <div className="mimir-pdf-inspector__content">
        <p>选择一份 PDF，确认后继续{tool === 'replace_pages' ? '替换指定页面' : '插入页面'}。</p>
        <ToolbarFileButton
          label="选择来源 PDF 文件"
          accept="application/pdf,.pdf"
          onPick={(selectedFile) => {
            if (selectedFile.size > 50 * 1024 * 1024 || !selectedFile.size) {
              setError('请选择 50 MiB 以内的非空 PDF')
              return
            }
            setFile(selectedFile)
            setError(null)
          }}
        >
          选择来源 PDF
        </ToolbarFileButton>
        <p className="mimir-pdf-inspector__meta">{file?.name ?? '仅限 PDF，最大 50 MiB。'}</p>
        {error && <p role="alert">{error}</p>}
      </div>
      <footer className="mimir-pdf-inspector__footer">
        <Button type="primary" block disabled={!file} onClick={() => file && onContinue(file)}>
          使用此文件继续
        </Button>
        <Button block onClick={onCancel}>
          取消操作
        </Button>
      </footer>
    </section>
  )
}
