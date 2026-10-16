import { useRef, useState, type ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import type {
  SectionInfo,
  CommentInfo,
  NoteInfo,
} from '../../vendor/packages/docx-engine/src/types.js'
import type { SaveOptions } from '../../vendor/packages/docx-engine/src/patch.js'
import type { ChartDisplay } from '../../vendor/packages/docx-engine/src/types.js'
import type { DocxSession } from '../docx.js'
import type { DocxAgentResult } from '../agent/docx-agent.js'
import {
  ToolbarButton,
  ToolbarConfirm,
  ToolbarColorPicker,
  ToolbarFileButton,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarNumberField,
  ToolbarPropertyForm,
  ToolbarSelect,
  ToolbarTextArea,
  ToolbarTextField,
} from '../shell/EditorShell.js'

const COLORS = [
  ['000000', '黑色'],
  ['FFFFFF', '白色'],
  ['C0C0C0', '浅灰'],
  ['808080', '灰色'],
  ['C00000', '深红'],
  ['4472C4', '蓝色'],
  ['70AD47', '绿色'],
  ['FFC000', '黄色'],
].map(([value, label]) => ({ value: value!, label: label!, swatch: `#${value}` }))
export interface DocxAdvancedContext {
  editor: Editor
  session: DocxSession
  options: SaveOptions
  sections: SectionInfo[]
  version: number
  execute: (
    tool: string,
    args: Record<string, unknown>,
    expectedVersion: number,
  ) => Promise<DocxAgentResult | null>
}

export function useDocxAction(context: DocxAdvancedContext) {
  const [version, setVersion] = useState(context.version)
  const [execute] = useState(() => context.execute)
  const locked = useRef(false)
  const [busy, setBusy] = useState(false)
  return {
    busy,
    run: async (tool: string, args: Record<string, unknown>) => {
      if (locked.current) return false
      locked.current = true
      setBusy(true)
      try {
        const result = await execute(tool, args, version)
        if (!result) return false
        setVersion(result.version)
        return true
      } finally {
        locked.current = false
        setBusy(false)
      }
    },
  }
}
export function DocxControlForm({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <fieldset
      disabled={busy}
      aria-busy={busy}
      style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
    >
      <ToolbarPropertyForm>{children}</ToolbarPropertyForm>
    </fieldset>
  )
}
export function selectedDocxBlock(editor: Editor): number {
  const { $from } = editor.state.selection
  return Math.min($from.index(0), editor.state.doc.childCount - 1)
}

export function DocxChartControls({ context }: { context: DocxAdvancedContext }) {
  const [blockIndex] = useState(() => selectedDocxBlock(context.editor))
  const [original] = useState(
    () => context.editor.state.doc.child(blockIndex).attrs.chartDisplay as ChartDisplay | null,
  )
  const [kind, setKind] = useState(original?.kind ?? 'bar')
  const [title, setTitle] = useState(original?.title ?? '图表')
  const [categories, setCategories] = useState(
    original?.categories.join('\n') ?? '第一季度\n第二季度',
  )
  const [series, setSeries] = useState(() =>
    (original?.series ?? [{ name: '系列 1', values: [10, 20] }]).map((item) => ({
      key: crypto.randomUUID(),
      name: item.name ?? '',
      values: item.values.map((value) => value ?? '').join('\n'),
    })),
  )
  const { busy, run } = useDocxAction(context)
  const names = categories.split(/\r?\n/)
  const data = series.map((item) => ({
    name: item.name ?? '',
    values: item.values.split(/\r?\n/).map((value) => (value.trim() ? Number(value) : null)),
  }))
  const invalid =
    !names.length ||
    names.length > 200 ||
    names.some((name) => !name.trim()) ||
    data.some(
      (item) =>
        !item.name.trim() ||
        item.values.length !== names.length ||
        item.values.some((value) => value !== null && !Number.isFinite(value)),
    ) ||
    (original && names.length !== original.categories.length)
  return (
    <DocxControlForm busy={busy}>
      <ToolbarMenuFields label={original ? '编辑选中图表' : '插入图表'}>
        <ToolbarMenuNote>
          {original
            ? '保留原图表类型、系列数和分类数；空数值保留原数据点。'
            : '每行一个分类和对应数值，空行表示空数据点。'}
        </ToolbarMenuNote>
        {!original && (
          <ToolbarSelect
            disabled={busy}
            disabledReason="正在应用修改"
            label="图表类型"
            value={kind}
            options={[
              { value: 'bar', label: '柱状图' },
              { value: 'line', label: '折线图' },
              { value: 'pie', label: '饼图' },
            ]}
            onChange={setKind}
          />
        )}

        <ToolbarTextField label="图表标题" value={title} onChange={setTitle} />
        <ToolbarTextArea
          label="图表分类（每行一项）"
          value={categories}
          onChange={setCategories}
          rows={3}
        />
        {series.map((item, index) => (
          <ToolbarMenuFields key={item.key} label={`系列 ${index + 1}`}>
            <ToolbarTextField
              label={`系列 ${index + 1} 名称`}
              value={item.name}
              onChange={(name) =>
                setSeries((items) =>
                  items.map((entry, i) => (i === index ? { ...entry, name } : entry)),
                )
              }
            />
            <ToolbarTextArea
              label={`系列 ${index + 1} 数值（每行一项）`}
              value={item.values}
              onChange={(values) =>
                setSeries((items) =>
                  items.map((entry, i) => (i === index ? { ...entry, values } : entry)),
                )
              }
              rows={3}
            />
            {!original && (
              <ToolbarButton
                label={`删除系列 ${index + 1}`}
                disabled={series.length <= 1}
                disabledReason="至少保留一个系列"
                onClick={() => setSeries((items) => items.filter((_, i) => i !== index))}
              >
                删除系列
              </ToolbarButton>
            )}
          </ToolbarMenuFields>
        ))}
        {!original && (
          <ToolbarButton
            label="添加图表系列"
            disabled={series.length >= 20}
            disabledReason="最多 20 个系列"
            onClick={() =>
              setSeries((items) => [
                ...items,
                {
                  key: crypto.randomUUID(),
                  name: `系列 ${items.length + 1}`,
                  values: names.map(() => '0').join('\n'),
                },
              ])
            }
          >
            添加系列
          </ToolbarButton>
        )}
        <ToolbarButton
          label={original ? '应用图表修改' : '插入图表到文档'}
          disabled={busy || !!invalid}
          disabledReason="分类与各系列数值数量须一致，名称不能为空，数值须有效"
          onClick={() =>
            void run(
              original ? 'edit_chart' : 'insert_chart',
              original
                ? {
                    blockIndex,
                    title,
                    categories: names,
                    series: data.map((item, index) => ({ ...item, index })),
                  }
                : { kind, title, categories: names, series: data, afterBlockIndex: blockIndex },
            )
          }
        >
          {original ? '应用修改' : '插入图表'}
        </ToolbarButton>
      </ToolbarMenuFields>
    </DocxControlForm>
  )
}

export function DocxTextboxControls({ context }: { context: DocxAdvancedContext }) {
  const [afterBlockIndex] = useState(() => selectedDocxBlock(context.editor))
  const [text, setText] = useState('')
  const [width, setWidth] = useState(240)
  const [height, setHeight] = useState(100)
  const [x, setX] = useState(0)
  const [y, setY] = useState(0)
  const [anchor, setAnchor] = useState('paragraph')
  const [wrap, setWrap] = useState('topAndBottom')
  const [fontSize, setFontSize] = useState(12)
  const [bold, setBold] = useState('no')
  const [align, setAlign] = useState('left')
  const [color, setColor] = useState<string | null>('000000')
  const [fill, setFill] = useState<string | null>('FFFFFF')
  const [borderColor, setBorderColor] = useState<string | null>('000000')
  const { busy, run } = useDocxAction(context)
  return (
    <DocxControlForm busy={busy}>
      <ToolbarMenuFields label="文本框">
        <ToolbarTextArea label="文本框内容" value={text} onChange={setText} rows={4} />
        <ToolbarNumberField
          label="文本框宽度（磅）"
          value={width}
          min={1}
          max={1000}
          onCommit={setWidth}
        />
        <ToolbarNumberField
          label="文本框高度（磅）"
          value={height}
          min={1}
          max={1000}
          onCommit={setHeight}
        />
        <ToolbarNumberField
          label="文本框横向位置（磅）"
          value={x}
          min={-1000}
          max={1000}
          onCommit={setX}
        />
        <ToolbarNumberField
          label="文本框纵向位置（磅）"
          value={y}
          min={-1000}
          max={1000}
          onCommit={setY}
        />
        <ToolbarSelect
          disabled={busy}
          disabledReason="正在应用修改"
          label="文本框定位基准"
          value={anchor}
          options={[
            { value: 'paragraph', label: '当前段落' },
            { value: 'page', label: '页面' },
          ]}
          onChange={setAnchor}
        />
        <ToolbarSelect
          disabled={busy}
          disabledReason="正在应用修改"
          label="文本框环绕方式"
          value={wrap}
          options={[
            { value: 'topAndBottom', label: '上下环绕' },
            { value: 'none', label: '浮于文字上方' },
          ]}
          onChange={setWrap}
        />
        <ToolbarNumberField
          label="文本框字号（磅）"
          value={fontSize}
          min={1}
          max={200}
          onCommit={setFontSize}
        />
        <ToolbarSelect
          disabled={busy}
          disabledReason="正在应用修改"
          label="文本框字重"
          value={bold}
          options={[
            { value: 'no', label: '常规' },
            { value: 'yes', label: '加粗' },
          ]}
          onChange={setBold}
        />
        <ToolbarSelect
          disabled={busy}
          disabledReason="正在应用修改"
          label="文本框文字对齐"
          value={align}
          options={[
            { value: 'left', label: '左对齐' },
            { value: 'center', label: '居中' },
            { value: 'right', label: '右对齐' },
            { value: 'justify', label: '两端对齐' },
          ]}
          onChange={setAlign}
        />
        <ToolbarMenuFields label="文本框文字颜色">
          <ToolbarColorPicker
            disabled={busy}
            disabledReason="正在应用修改"
            inline
            label="文本框文字颜色"
            value={color}
            options={COLORS}
            onPick={setColor}
          />
        </ToolbarMenuFields>
        <ToolbarMenuFields label="文本框填充颜色">
          <ToolbarColorPicker
            disabled={busy}
            disabledReason="正在应用修改"
            inline
            label="文本框填充颜色"
            value={fill}
            options={COLORS}
            onPick={setFill}
            onClear={() => setFill(null)}
          />
        </ToolbarMenuFields>
        <ToolbarMenuFields label="文本框边框颜色">
          <ToolbarColorPicker
            disabled={busy}
            disabledReason="正在应用修改"
            inline
            label="文本框边框颜色"
            value={borderColor}
            options={COLORS}
            onPick={setBorderColor}
            onClear={() => setBorderColor(null)}
          />
        </ToolbarMenuFields>
        <ToolbarButton
          label="插入文本框到文档"
          disabled={busy || !text.trim()}
          disabledReason="请输入文本框内容"
          onClick={() =>
            void run('insert_text_box', {
              afterBlockIndex,
              text,
              width,
              height,
              x,
              y,
              anchor,
              wrap,
              fontSize,
              bold: bold === 'yes',
              align,
              color,
              fill,
              borderColor,
            })
          }
        >
          插入文本框
        </ToolbarButton>
      </ToolbarMenuFields>
    </DocxControlForm>
  )
}

export function DocxPageControls({ context }: { context: DocxAdvancedContext }) {
  const [section, setSection] = useState(() =>
    Math.max(
      0,
      context.sections.findIndex(
        (item) => selectedDocxBlock(context.editor) <= item.lastBlockIndex,
      ),
    ),
  )
  const current = (context.sections[section] ?? context.sections.at(-1)!).settings
  const [orientation, setOrientation] = useState(current.orientation ?? 'portrait')
  const [width, setWidth] = useState(current.pageWidth / 20)
  const [height, setHeight] = useState(current.pageHeight / 20)
  const [margins, setMargins] = useState({
    top: current.marginTop / 20,
    right: current.marginRight / 20,
    bottom: current.marginBottom / 20,
    left: current.marginLeft / 20,
  })
  const [columns, setColumns] = useState(current.columns ?? 1)
  const [spacing, setSpacing] = useState((current.colSpace ?? 720) / 20)
  const [headerDist, setHeaderDist] = useState((current.headerDist ?? 720) / 20)
  const [footerDist, setFooterDist] = useState((current.footerDist ?? 720) / 20)
  const [titlePg, setTitlePg] = useState(context.sections[section]!.titlePg ? 'yes' : 'no')
  const [numberStart, setNumberStart] = useState(context.sections[section]!.pageNumberStart ?? 1)
  const [restart, setRestart] = useState(
    context.sections[section]!.pageNumberStart === undefined ? 'continue' : 'restart',
  )
  const [numberFormat, setNumberFormat] = useState(
    context.sections[section]!.pageNumberFmt ?? 'decimal',
  )
  const [breakType, setBreakType] = useState('nextPage')
  const [afterBlockIndex] = useState(() => selectedDocxBlock(context.editor))
  const { busy, run } = useDocxAction(context)
  return (
    <DocxControlForm busy={busy}>
      <ToolbarMenuFields label="页面与节设置">
        <ToolbarSelect
          disabled={busy}
          disabledReason="正在应用修改"
          label="目标节"
          value={String(section)}
          options={context.sections.map((_, index) => ({
            value: String(index),
            label: `第 ${index + 1} 节`,
          }))}
          onChange={(value) => {
            const index = Number(value)
            const next = context.sections[index]!.settings
            setSection(index)
            setOrientation(next.orientation ?? 'portrait')
            setWidth(next.pageWidth / 20)
            setHeight(next.pageHeight / 20)
            setMargins({
              top: next.marginTop / 20,
              right: next.marginRight / 20,
              bottom: next.marginBottom / 20,
              left: next.marginLeft / 20,
            })
            setColumns(next.columns ?? 1)
            setSpacing((next.colSpace ?? 720) / 20)
            setHeaderDist((next.headerDist ?? 720) / 20)
            setFooterDist((next.footerDist ?? 720) / 20)
            setTitlePg(context.sections[index]!.titlePg ? 'yes' : 'no')
            setNumberStart(context.sections[index]!.pageNumberStart ?? 1)
            setRestart(
              context.sections[index]!.pageNumberStart === undefined ? 'continue' : 'restart',
            )
            setNumberFormat(context.sections[index]!.pageNumberFmt ?? 'decimal')
          }}
        />
        <ToolbarSelect
          disabled={busy}
          disabledReason="正在应用修改"
          label="纸张方向"
          value={orientation}
          options={[
            { value: 'portrait', label: '纵向' },
            { value: 'landscape', label: '横向' },
          ]}
          onChange={(value) => {
            setOrientation(value)
            if (value !== orientation && width > height !== (value === 'landscape')) {
              setWidth(height)
              setHeight(width)
            }
          }}
        />
        <ToolbarNumberField
          label="纸张宽度（磅）"
          value={width}
          min={72}
          max={2520}
          onCommit={setWidth}
        />
        <ToolbarNumberField
          label="纸张高度（磅）"
          value={height}
          min={72}
          max={2520}
          onCommit={setHeight}
        />
        <ToolbarMenuFields label="页边距与分栏">
          {(['top', 'right', 'bottom', 'left'] as const).map((key, index) => (
            <ToolbarNumberField
              key={key}
              label={`${['上', '右', '下', '左'][index]}页边距（磅）`}
              value={margins[key]}
              min={0}
              max={1000}
              onCommit={(value) => setMargins((old) => ({ ...old, [key]: value }))}
            />
          ))}
          <ToolbarNumberField
            label="分栏数"
            value={columns}
            min={1}
            max={12}
            onCommit={setColumns}
          />
          <ToolbarNumberField
            label="栏间距（磅）"
            value={spacing}
            min={0}
            max={500}
            onCommit={setSpacing}
          />
        </ToolbarMenuFields>
        <ToolbarMenuFields label="页眉页脚与页码">
          <ToolbarNumberField
            label="页眉距纸边（磅）"
            value={headerDist}
            min={0}
            max={1000}
            onCommit={setHeaderDist}
          />
          <ToolbarNumberField
            label="页脚距纸边（磅）"
            value={footerDist}
            min={0}
            max={1000}
            onCommit={setFooterDist}
          />
          <ToolbarSelect
            disabled={busy}
            disabledReason="正在应用修改"
            label="首页页眉页脚"
            value={titlePg}
            options={[
              { value: 'no', label: '与其他页相同' },
              { value: 'yes', label: '首页不同' },
            ]}
            onChange={setTitlePg}
          />
          <ToolbarSelect
            disabled={busy}
            disabledReason="正在应用修改"
            label="页码编号方式"
            value={restart}
            options={[
              { value: 'continue', label: '续前节' },
              { value: 'restart', label: '重新开始编号' },
            ]}
            onChange={setRestart}
          />
          <ToolbarNumberField
            label="页码起始值"
            value={numberStart}
            min={0}
            max={100000}
            disabled={restart !== 'restart'}
            disabledReason="选择重新开始编号后设置"
            onCommit={setNumberStart}
          />
          <ToolbarSelect
            disabled={busy}
            disabledReason="正在应用修改"
            label="页码格式"
            value={numberFormat}
            options={[
              { value: 'decimal', label: '1, 2, 3' },
              { value: 'lowerRoman', label: 'i, ii, iii' },
              { value: 'upperRoman', label: 'I, II, III' },
              { value: 'lowerLetter', label: 'a, b, c' },
              { value: 'upperLetter', label: 'A, B, C' },
              { value: 'decimalFullWidth', label: '１, ２, ３' },
            ]}
            onChange={setNumberFormat}
          />
        </ToolbarMenuFields>
        <ToolbarButton
          label="应用页面设置"
          primary
          disabled={busy}
          disabledReason="正在应用修改"
          onClick={() =>
            void run('set_page_setup', {
              section,
              width: `${width}pt`,
              height: `${height}pt`,
              orientation,
              margins: {
                ...Object.fromEntries(
                  Object.entries(margins).map(([key, value]) => [key, `${value}pt`]),
                ),
                header: `${headerDist}pt`,
                footer: `${footerDist}pt`,
              },
              titlePg: titlePg === 'yes',
              pageNumberStart: restart === 'continue' ? null : numberStart,
              pageNumberFormat: numberFormat,
              columns: { count: columns, spacing: `${spacing}pt` },
            })
          }
        />
        <ToolbarMenuFields label="插入分节符">
          <ToolbarSelect
            disabled={busy}
            disabledReason="正在应用修改"
            label="分节符类型"
            value={breakType}
            options={[
              { value: 'nextPage', label: '下一页' },
              { value: 'continuous', label: '连续' },
              { value: 'evenPage', label: '偶数页' },
              { value: 'oddPage', label: '奇数页' },
            ]}
            onChange={setBreakType}
          />
          <ToolbarButton
            label="在当前段后插入分节符"
            disabled={busy}
            disabledReason="正在应用修改"
            onClick={() => void run('insert_section_break', { afterBlockIndex, type: breakType })}
          >
            插入分节符
          </ToolbarButton>
        </ToolbarMenuFields>
      </ToolbarMenuFields>
    </DocxControlForm>
  )
}

export function DocxWatermarkControls({ context }: { context: DocxAdvancedContext }) {
  const original = context.options.watermark
  const existing = context.session.headerFooter.header?.images?.find((item) => item.wordArt)
  const textStyle =
    original && typeof original === 'object' && 'text' in original ? original : undefined
  const [text, setText] = useState(
    typeof original === 'string'
      ? original
      : original && 'text' in original
        ? original.text
        : original === null
          ? ''
          : (context.session.footnotes.parsed.watermarkText ?? ''),
  )
  const [opacity, setOpacity] = useState(
    original && typeof original === 'object' && 'text' in original
      ? (original.opacity ?? 0.5)
      : (existing?.wordArt?.opacity ?? 0.5),
  )
  const [diagonal, setDiagonal] = useState(
    original && typeof original === 'object' && 'text' in original
      ? original.diagonal !== false
      : existing?.rotationDeg !== 0,
  )
  const [fontFamily, setFontFamily] = useState(
    textStyle?.fontFamily ?? existing?.wordArt?.fontFamily ?? 'Calibri',
  )
  const [color, setColor] = useState(textStyle?.colorHex ?? existing?.wordArt?.colorHex ?? 'C0C0C0')
  const [bold, setBold] = useState((textStyle?.bold ?? existing?.wordArt?.bold) ? 'yes' : 'no')
  const [italic, setItalic] = useState(
    (textStyle?.italic ?? existing?.wordArt?.italic) ? 'yes' : 'no',
  )
  const [image, setImage] = useState<string | null>(() =>
    original && typeof original === 'object' && 'image' in original
      ? `data:${original.image.mime};base64,${original.image.base64}`
      : (context.session.headerFooter.header?.images?.find((item) => item.watermark)?.dataUrl ??
        null),
  )
  const [imageError, setImageError] = useState('')
  const [scale, setScale] = useState(100)
  const [washout, setWashout] = useState('yes')
  const { busy, run } = useDocxAction(context)
  return (
    <DocxControlForm busy={busy}>
      <ToolbarMenuFields label="文档水印">
        <ToolbarTextField label="水印文字" value={text} onChange={setText} />
        <ToolbarNumberField
          label="水印不透明度（百分比）"
          value={opacity * 100}
          min={0}
          max={100}
          onCommit={(value) => setOpacity(value / 100)}
        />
        <ToolbarSelect
          disabled={busy}
          disabledReason="正在应用修改"
          label="水印方向"
          value={diagonal ? 'diagonal' : 'horizontal'}
          options={[
            { value: 'diagonal', label: '斜向' },
            { value: 'horizontal', label: '水平' },
          ]}
          onChange={(value) => setDiagonal(value === 'diagonal')}
        />
        <ToolbarTextField label="水印字体" value={fontFamily} onChange={setFontFamily} />
        <ToolbarSelect
          disabled={busy}
          disabledReason="正在应用修改"
          label="水印字重"
          value={bold}
          options={[
            { value: 'no', label: '常规' },
            { value: 'yes', label: '加粗' },
          ]}
          onChange={setBold}
        />
        <ToolbarSelect
          disabled={busy}
          disabledReason="正在应用修改"
          label="水印字形"
          value={italic}
          options={[
            { value: 'no', label: '正体' },
            { value: 'yes', label: '斜体' },
          ]}
          onChange={setItalic}
        />
        <ToolbarMenuFields label="水印颜色">
          <ToolbarColorPicker
            disabled={busy}
            disabledReason="正在应用修改"
            inline
            label="水印颜色"
            value={color}
            options={COLORS}
            onPick={setColor}
          />
        </ToolbarMenuFields>
        <ToolbarButton
          label="应用文字水印"
          disabled={busy || !text.trim()}
          disabledReason="请输入水印文字"
          onClick={() =>
            void run('set_watermark', {
              text,
              opacity,
              diagonal,
              fontFamily,
              color,
              bold: bold === 'yes',
              italic: italic === 'yes',
            })
          }
        >
          应用水印
        </ToolbarButton>
        <ToolbarFileButton
          label="选择水印图片"
          accept="image/png,image/jpeg,image/gif"
          disabled={busy}
          onPick={async (file) => {
            setImageError('')
            if (
              file.size > 20 * 1024 * 1024 ||
              !['image/png', 'image/jpeg', 'image/gif'].includes(file.type)
            ) {
              setImageError('请选择 20 MB 内的 PNG、JPEG 或 GIF')
              return
            }
            try {
              const reader = new FileReader()
              const dataUrl = await new Promise<string>((resolve, reject) => {
                reader.addEventListener('load', () => resolve(String(reader.result)), {
                  once: true,
                })
                reader.addEventListener('error', () => reject(new Error('图片读取失败')), {
                  once: true,
                })
                reader.readAsDataURL(file)
              })
              setImage(dataUrl)
            } catch (cause) {
              setImageError(cause instanceof Error ? cause.message : String(cause))
            }
          }}
        >
          选择水印图片
        </ToolbarFileButton>
        {image && <ToolbarMenuNote>已选择水印图片</ToolbarMenuNote>}
        {imageError && <ToolbarMenuNote>{imageError}</ToolbarMenuNote>}
        <ToolbarNumberField
          label="图片水印缩放（百分比）"
          value={scale}
          min={1}
          max={1000}
          onCommit={setScale}
        />
        <ToolbarSelect
          label="图片水印冲蚀"
          value={washout}
          options={[
            { value: 'yes', label: '淡化图片' },
            { value: 'no', label: '保留原色' },
          ]}
          onChange={setWashout}
          disabled={busy}
          disabledReason="正在应用修改"
        />
        <ToolbarButton
          label="应用图片水印"
          disabled={busy || !image}
          disabledReason="请先选择水印图片"
          onClick={() =>
            void run('set_watermark', {
              image: true,
              dataUrl: image,
              scale,
              washout: washout === 'yes',
            })
          }
        >
          应用图片水印
        </ToolbarButton>
        <ToolbarButton
          label="移除文档水印"
          disabled={busy}
          disabledReason="正在应用修改"
          onClick={() => void run('set_watermark', { text: null })}
        >
          移除水印
        </ToolbarButton>
      </ToolbarMenuFields>
    </DocxControlForm>
  )
}

export function DocxCommentControls({ context }: { context: DocxAdvancedContext }) {
  const [items, setItems] = useState(
    () =>
      structuredClone(context.options.comments ?? context.session.comments ?? []) as CommentInfo[],
  )
  const [selected, setSelected] = useState(items[0]?.id ?? '')
  const [reply, setReply] = useState('')
  const [body, setBody] = useState(items[0]?.text ?? '')
  const { busy, run } = useDocxAction(context)
  const current = items.find((item) => item.id === selected)
  const change = async (tool: string, args: Record<string, unknown>) => {
    if (!(await run(tool, args))) return
    if (tool === 'edit_comment')
      setItems((old) =>
        old.map((item) =>
          item.id === args.id
            ? {
                ...item,
                ...(args.text === undefined ? {} : { text: String(args.text) }),
                ...(args.done === undefined ? {} : { done: args.done === true }),
              }
            : item,
        ),
      )
    if (tool === 'resolve_comment')
      setItems((old) =>
        old.map((item) =>
          item.id === (current?.parentId ?? selected) ? { ...item, done: true } : item,
        ),
      )
    if (tool === 'delete_comment') {
      setItems((old) => old.filter((item) => item.id !== selected && item.parentId !== selected))
      setSelected('')
    }
    if (tool === 'reply_comment') {
      setReply('')
      const result = await context.execute('read_comments', {}, -1)
      if (result) setItems(result.data as CommentInfo[])
    }
  }
  return (
    <DocxControlForm busy={busy}>
      <ToolbarMenuFields label="管理批注">
        {items.length === 0 ? (
          <ToolbarMenuNote>当前没有批注。选择正文后使用“添加批注”。</ToolbarMenuNote>
        ) : (
          <>
            <ToolbarSelect
              disabled={busy}
              disabledReason="正在应用修改"
              label="选择批注"
              value={selected}
              options={[
                { value: '', label: '选择一条批注' },
                ...items.map((item) => ({
                  value: item.id,
                  label: `${item.parentId ? '回复 · ' : ''}${item.author ?? ''}：${item.text.slice(0, 32)}`,
                })),
              ]}
              onChange={(value) => {
                setSelected(value)
                setBody(items.find((item) => item.id === value)?.text ?? '')
              }}
            />
            {current && (
              <>
                <ToolbarMenuNote>
                  {items.find((item) => item.id === (current.parentId ?? selected))?.done
                    ? '已解决'
                    : '未解决'}{' '}
                  · {current.text}
                </ToolbarMenuNote>
                <ToolbarTextArea label="批注正文" value={body} onChange={setBody} rows={3} />
                <ToolbarButton
                  label="保存批注修改"
                  disabled={busy || !body.trim() || body === current.text}
                  disabledReason="请输入不同的批注内容"
                  onClick={() => void change('edit_comment', { id: selected, text: body })}
                >
                  修改批注
                </ToolbarButton>
                {items.find((item) => item.id === (current.parentId ?? selected))?.done && (
                  <ToolbarButton
                    label="重新打开批注讨论"
                    disabled={busy}
                    disabledReason="正在应用修改"
                    onClick={() =>
                      void change('edit_comment', { id: current.parentId ?? selected, done: false })
                    }
                  >
                    重新打开讨论
                  </ToolbarButton>
                )}
                <ToolbarTextArea label="批注回复" value={reply} onChange={setReply} rows={3} />
                <ToolbarButton
                  label="回复当前批注"
                  disabled={busy || !reply.trim()}
                  disabledReason="请输入回复内容"
                  onClick={() =>
                    void change('reply_comment', {
                      parentId: selected,
                      text: reply,
                      author: '用户',
                    })
                  }
                >
                  回复
                </ToolbarButton>
                <ToolbarButton
                  label="解决当前批注"
                  disabled={
                    busy || !!items.find((item) => item.id === (current.parentId ?? selected))?.done
                  }
                  disabledReason="这条讨论已解决"
                  onClick={() => void change('resolve_comment', { id: selected })}
                >
                  解决讨论
                </ToolbarButton>
                <ToolbarConfirm
                  title="删除这条批注及其回复？"
                  description="保存前可通过撤销结构操作恢复。"
                  confirmLabel="删除批注"
                  onConfirm={() =>
                    void change('delete_comment', { id: selected, withReplies: true })
                  }
                >
                  <ToolbarButton label="删除当前批注" disabled={busy}>
                    删除批注
                  </ToolbarButton>
                </ToolbarConfirm>
              </>
            )}
          </>
        )}
      </ToolbarMenuFields>
    </DocxControlForm>
  )
}

export function DocxNoteControls({ context }: { context: DocxAdvancedContext }) {
  const [items, setItems] = useState(() =>
    (['footnote', 'endnote'] as const).flatMap((kind) =>
      (
        context.options[kind === 'footnote' ? 'footnotes' : 'endnotes'] ??
        context.session.footnotes.parsed[kind === 'footnote' ? 'footnotes' : 'endnotes']
      ).map((item) => Object.assign({}, item, { kind })),
    ),
  )
  const [selected, setSelected] = useState(items[0] ? `${items[0].kind}:${items[0].id}` : '')
  const current = items.find((item) => `${item.kind}:${item.id}` === selected)
  const [find, setFind] = useState('')
  const [text, setText] = useState('')
  const { busy, run } = useDocxAction(context)
  return (
    <DocxControlForm busy={busy}>
      <ToolbarMenuFields label="管理脚注与尾注">
        {items.length === 0 ? (
          <ToolbarMenuNote>当前没有脚注或尾注。</ToolbarMenuNote>
        ) : (
          <>
            <ToolbarSelect
              disabled={busy}
              disabledReason="正在应用修改"
              label="选择脚注或尾注"
              value={selected}
              options={[
                { value: '', label: '选择一条注释' },
                ...items.map((item) => ({
                  value: `${item.kind}:${item.id}`,
                  label: `${item.kind === 'footnote' ? '脚注' : '尾注'} ${item.id}：${item.text.slice(0, 24)}`,
                })),
              ]}
              onChange={(value) => {
                setSelected(value)
                setText('')
                setFind('')
              }}
            />
            {current && (
              <>
                <ToolbarMenuNote>{current.text}</ToolbarMenuNote>
                <ToolbarMenuNote>替换首次匹配的文字，保留其余文字格式。</ToolbarMenuNote>
                <ToolbarTextField label="查找注释文字" value={find} onChange={setFind} />
                <ToolbarTextArea label="替换注释文字为" value={text} onChange={setText} rows={4} />
                <ToolbarButton
                  label="应用注释修改"
                  disabled={busy || !find || !current.text.includes(find) || text === find}
                  disabledReason="请输入注释中存在的查找文字和不同的替换文字"
                  onClick={() =>
                    void (async () => {
                      if (
                        await run('edit_note', {
                          kind: current.kind,
                          id: current.id,
                          find,
                          replace: text,
                        })
                      ) {
                        const result = await context.execute('read_notes', {}, -1)
                        if (result)
                          setItems(result.data as (NoteInfo & { kind: 'footnote' | 'endnote' })[])
                      }
                    })()
                  }
                >
                  应用修改
                </ToolbarButton>
                <ToolbarConfirm
                  title="删除这条注释及正文引用？"
                  description="保存前可通过撤销结构操作恢复。"
                  confirmLabel="删除注释"
                  onConfirm={() =>
                    void (async () => {
                      if (await run('delete_note', { kind: current.kind, id: current.id })) {
                        setItems((old) => old.filter((item) => item !== current))
                        setSelected('')
                        setText('')
                      }
                    })()
                  }
                >
                  <ToolbarButton label="删除当前注释" disabled={busy}>
                    删除注释
                  </ToolbarButton>
                </ToolbarConfirm>
              </>
            )}
          </>
        )}
      </ToolbarMenuFields>
    </DocxControlForm>
  )
}
