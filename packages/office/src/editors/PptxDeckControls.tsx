import { useState } from 'react'
import { Button } from 'antd'
import { Palette } from 'lucide-react'
import type { Slide, SlideSize } from '../../vendor/packages/pptx-engine/src/types.js'
import type { PptxMetadata } from '../pptx-metadata.js'
import {
  ToolbarButton,
  ToolbarConfirm,
  ToolbarColorPicker,
  ToolbarMenu,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarNumberField,
  ToolbarSelect,
  ToolbarTextField,
} from '../shell/EditorShell.js'
import { PptxControlPanel, usePptxAction, type PptxApply } from './PptxObjectControls.js'
import {
  PPTX_THEME_PRESETS,
  PPTX_THEME_COLOR_LABELS,
  PPTX_THEME_COLOR_KEYS,
  pptxThemeMatches,
  pptxThemePreset,
  type PptxThemeDraft,
} from './pptx-theme-presets.js'
import './pptx-theme-controls.css'
import { PptxCommentControls } from './PptxCommentControls.js'
const PT = 12700

export function PptxPageControls({
  size,
  slide,
  index,
  metadata,
  apply,
}: {
  size: SlideSize
  slide: Slide
  index: number
  metadata: PptxMetadata
  apply: PptxApply
}) {
  const { busy, run } = usePptxAction(apply)
  const [width, setWidth] = useState(size.cx / PT)
  const [height, setHeight] = useState(size.cy / PT)
  const current = metadata.layouts.find((layout) => layout.path === slide.layoutPath)
  const [layout, setLayout] = useState(String(current?.index ?? metadata.layouts[0]?.index ?? ''))
  return (
    <PptxControlPanel busy={busy}>
      <ToolbarMenuFields label="幻灯片尺寸">
        <ToolbarNumberField
          label="幻灯片宽（pt）"
          value={width}
          min={10}
          max={4000}
          onCommit={setWidth}
        />
        <ToolbarNumberField
          label="幻灯片高（pt）"
          value={height}
          min={10}
          max={4000}
          onCommit={setHeight}
        />
        <ToolbarMenuNote>
          修改整份演示文稿的尺寸；对象尺寸和位置保持原值，请检查边缘内容。
        </ToolbarMenuNote>
        <ToolbarButton
          label="应用幻灯片尺寸"
          disabled={width <= 0 || height <= 0}
          disabledReason="宽高必须大于0"
          onClick={() =>
            void run({
              op: 'setSlideSize',
              cx: Math.round(width * PT),
              cy: Math.round(height * PT),
            })
          }
        >
          应用尺寸
        </ToolbarButton>
      </ToolbarMenuFields>
      <ToolbarMenuFields label="原件版式">
        <ToolbarMenuNote>当前版式：{current?.name ?? '未关联原件版式'}</ToolbarMenuNote>
        <ToolbarSelect
          label="选择原件版式"
          value={layout}
          options={metadata.layouts.map((item) => ({
            value: String(item.index),
            label: `${item.name}${item.type ? ` · ${item.type}` : ''}`,
          }))}
          disabled={!metadata.layouts.length}
          onChange={setLayout}
        />
        <ToolbarButton
          label="应用当前页版式"
          disabled={!layout}
          disabledReason="原件没有可用版式"
          onClick={() =>
            void run({ op: 'setSlideLayout', target: { slide: index }, layout: Number(layout) })
          }
        >
          应用版式
        </ToolbarButton>
        <ToolbarButton
          label="重置本页占位符位置"
          disabled={!current}
          disabledReason="当前页没有关联的原件版式"
          onClick={() => void run({ op: 'setSlideLayout', target: { slide: index } })}
        >
          重置占位符位置
        </ToolbarButton>
        <ToolbarMenuNote>
          将占位符的位置和尺寸恢复为当前版式的默认值，保留文字和其他对象。
        </ToolbarMenuNote>
        <ToolbarButton
          label="以所选版式新建幻灯片"
          disabled={!layout}
          disabledReason="原件没有可用版式"
          onClick={() =>
            void run({ op: 'addSlideWithLayout', target: { slide: index }, layout: Number(layout) })
          }
        >
          按版式新建
        </ToolbarButton>
      </ToolbarMenuFields>
    </PptxControlPanel>
  )
}

export function PptxThemeControls({
  metadata,
  apply,
}: {
  metadata: PptxMetadata
  apply: PptxApply
}) {
  // Permanent invalidation prevents A → B → undo(A) from reviving a discarded draft.
  return (
    <PptxThemeDraftControls
      key={JSON.stringify(metadata.themes)}
      metadata={metadata}
      apply={apply}
    />
  )
}

function ThemePreview({ theme }: { theme: PptxThemeDraft }) {
  return (
    <span
      className="mimir-pptx-theme__preview"
      aria-hidden="true"
      style={{ background: theme.colors.lt1, color: theme.colors.dk1 }}
    >
      <span className="mimir-pptx-theme__sample" style={{ fontFamily: theme.majorFont }}>
        Aa
      </span>
      <span className="mimir-pptx-theme__swatches">
        {['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].map((key) => (
          <span key={key} style={{ background: theme.colors[key] }} />
        ))}
      </span>
    </span>
  )
}

function PptxThemeDraftControls({ metadata, apply }: { metadata: PptxMetadata; apply: PptxApply }) {
  const { busy, run } = usePptxAction(apply)
  const [path, setPath] = useState(metadata.themes[0]?.path ?? '')
  const source = metadata.themes.find((item) => item.path === path)
  const [draft, setDraft] = useState<PptxThemeDraft>(() => source ?? PPTX_THEME_PRESETS[0]!)
  const [customKey, setCustomKey] = useState('accent1')
  const [customValue, setCustomValue] = useState(draft.colors.accent1 ?? '#000000')
  const [error, setError] = useState('')
  const selectedPreset = pptxThemePreset(draft)
  const appliedPreset =
    metadata.themes.length > 0
      ? PPTX_THEME_PRESETS.find((preset) =>
          metadata.themes.every((theme) => pptxThemeMatches(theme, preset)),
        )
      : undefined
  const currentLabel = appliedPreset
    ? appliedPreset.label
    : metadata.themes.length > 1 &&
        !metadata.themes.every((theme) => pptxThemeMatches(theme, metadata.themes[0]!))
      ? '多个原件主题'
      : metadata.themes[0]?.name || '无主题资源'
  const invalid =
    !draft.name.trim() ||
    Object.values(draft.colors).some((value) => !/^#[0-9a-f]{6}$/i.test(value))
  const unchanged =
    metadata.themes.length > 0 &&
    metadata.themes.every((theme) => theme.name === draft.name && pptxThemeMatches(theme, draft))
  const palette = [
    ...new Set([
      ...Object.values(draft.colors),
      '#000000',
      '#FFFFFF',
      '#C03060',
      '#FF0000',
      '#ED7D31',
      '#FFC000',
      '#70AD47',
      '#0070C0',
      '#7030A0',
    ]),
  ]
    .filter((value) => /^#[0-9a-f]{6}$/i.test(value))
    .map((value) => ({ value, label: value.toUpperCase(), swatch: value }))
  const update = (patch: Partial<PptxThemeDraft>) => {
    setDraft({ ...draft, ...patch })
    if (patch.colors?.[customKey]) setCustomValue(patch.colors[customKey])
    setError('')
  }
  const choose = (next: PptxThemeDraft) => {
    setDraft({
      name: next.name,
      colors: { ...next.colors },
      majorFont: next.majorFont,
      minorFont: next.minorFont,
    })
    setCustomValue(next.colors[customKey] ?? '#000000')
    setError('')
  }
  const submit = async () => {
    try {
      const ok = await run({
        op: 'applyTheme',
        name: draft.name,
        colors: draft.colors,
        ...(draft.majorFont ? { majorFont: draft.majorFont } : {}),
        ...(draft.minorFont ? { minorFont: draft.minorFont } : {}),
      })
      if (!ok) setError('主题未应用，请检查文稿状态后重试。')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '主题应用失败，请重试。')
    }
  }
  return (
    <section className="mimir-pptx-theme" aria-label="演示文稿主题" aria-busy={busy}>
      <div className="mimir-pptx-theme__header">
        <span>
          当前：{currentLabel}
          {!appliedPreset && metadata.themes.length > 0 ? ' · 自定义' : ''}
        </span>
        <ToolbarMenuNote>先选择预览，再应用到整份演示文稿。</ToolbarMenuNote>
      </div>
      <div className="mimir-pptx-theme__body">
        <div className="mimir-pptx-theme__gallery" role="group" aria-label="预设主题">
          {PPTX_THEME_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              className="mimir-pptx-theme__card"
              aria-label={`选择${preset.label}主题`}
              aria-pressed={selectedPreset?.id === preset.id}
              disabled={busy || !source}
              onClick={() => choose(preset)}
            >
              <ThemePreview theme={preset} />
              <span className="mimir-pptx-theme__card-label">
                {preset.label}
                <span>
                  {appliedPreset?.id === preset.id
                    ? '当前'
                    : selectedPreset?.id === preset.id
                      ? '待应用'
                      : ''}
                </span>
              </span>
            </Button>
          ))}
        </div>
        {source ? (
          <div className="mimir-pptx-theme__custom">
            <h3>自定义主题</h3>
            <PptxControlPanel busy={busy}>
              <ToolbarMenuFields label="主题来源">
                <ToolbarSelect
                  label="读取原件主题"
                  disabled={busy}
                  value={path}
                  options={metadata.themes.map((item) => ({ value: item.path, label: item.name }))}
                  onChange={(value) => {
                    const next = metadata.themes.find((item) => item.path === value)
                    if (next) {
                      setPath(value)
                      choose(next)
                    }
                  }}
                />
                <ToolbarTextField
                  label="主题名称"
                  value={draft.name}
                  onChange={(name) => update({ name })}
                />
              </ToolbarMenuFields>
              {[
                { title: '基础颜色', keys: ['dk1', 'lt1', 'dk2', 'lt2'] },
                {
                  title: '强调色',
                  keys: ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'],
                },
                { title: '链接色', keys: ['hlink', 'folHlink'] },
              ].map((group) => (
                <ToolbarMenuFields key={group.title} label={group.title}>
                  {group.keys
                    .filter((key) => key in draft.colors)
                    .map((key) => (
                      <ToolbarColorPicker
                        key={key}
                        label={`主题${PPTX_THEME_COLOR_LABELS[key]}`}
                        value={draft.colors[key]!}
                        options={palette}
                        icon={
                          <span className="mimir-pptx-theme-color-value">
                            {draft.colors[key]!.toUpperCase()}
                          </span>
                        }
                        onPick={(value) => update({ colors: { ...draft.colors, [key]: value } })}
                      />
                    ))}
                </ToolbarMenuFields>
              ))}
              <ToolbarMenuFields label="字体与自定义颜色">
                <ToolbarTextField
                  label="主题标题字体"
                  value={draft.majorFont}
                  onChange={(majorFont) => update({ majorFont })}
                />
                <ToolbarTextField
                  label="主题正文字体"
                  value={draft.minorFont}
                  onChange={(minorFont) => update({ minorFont })}
                />
                <ToolbarMenu
                  label="自定义主题色"
                  text="自定义主题色"
                  panelWidth={300}
                  renderPanel={(close) => (
                    <PptxControlPanel busy={busy}>
                      <ToolbarMenuFields label="自定义主题色">
                        <ToolbarSelect
                          label="自定义颜色位置"
                          disabled={busy}
                          value={customKey}
                          options={PPTX_THEME_COLOR_KEYS.filter((key) => key in draft.colors).map(
                            (key) => ({ value: key, label: PPTX_THEME_COLOR_LABELS[key]! }),
                          )}
                          onChange={(key) => {
                            setCustomKey(key)
                            setCustomValue(draft.colors[key] ?? '#000000')
                          }}
                        />
                        <ToolbarTextField
                          label="自定义色值"
                          value={customValue}
                          onChange={setCustomValue}
                        />
                        <ToolbarButton
                          label="设置自定义主题色"
                          disabled={!/^#[0-9a-f]{6}$/i.test(customValue)}
                          disabledReason="请输入#RRGGBB颜色"
                          onClick={() => {
                            update({
                              colors: { ...draft.colors, [customKey]: customValue.toUpperCase() },
                            })
                            close()
                          }}
                        >
                          设置颜色
                        </ToolbarButton>
                      </ToolbarMenuFields>
                    </PptxControlPanel>
                  )}
                />
              </ToolbarMenuFields>
            </PptxControlPanel>
          </div>
        ) : (
          <ToolbarMenuNote>原件没有可用主题资源，无法应用主题。</ToolbarMenuNote>
        )}
      </div>
      <div className="mimir-pptx-theme__footer">
        <div className="mimir-pptx-theme__draft" aria-live="polite">
          <ThemePreview theme={draft} />
          <span>
            {selectedPreset?.label ?? '自定义'}
            <small>
              {busy ? '正在应用…' : unchanged ? '与当前主题一致' : '待应用'}
              <span>
                {draft.majorFont || '保留标题字体'} / {draft.minorFont || '保留正文字体'}
              </span>
            </small>
          </span>
        </div>
        {error && (
          <p role="alert" className="mimir-pptx-theme__error">
            {error}
          </p>
        )}
        <ToolbarButton
          label="应用整份主题"
          primary
          disabled={busy || !source || invalid || unchanged}
          disabledReason={
            busy
              ? '正在应用修改'
              : !source
                ? '原件没有可用主题资源'
                : invalid
                  ? '主题须有名称，颜色使用#RRGGBB'
                  : '与当前主题一致'
          }
          onClick={() => void submit()}
        >
          <Palette size={14} aria-hidden="true" />
        </ToolbarButton>
      </div>
    </section>
  )
}

export function PptxHeaderFooterControls({ slide, apply }: { slide: Slide; apply: PptxApply }) {
  const { busy, run } = usePptxAction(apply)
  const get = (type: string) =>
    slide.elements.find(
      (element) =>
        (element.type === 'shape' || element.type === 'text') && element.placeholder === type,
    )
  const read = (type: string) => {
    const el = get(type)
    return el && (el.type === 'shape' || el.type === 'text')
      ? (el.text?.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('\n') ?? '')
      : ''
  }
  const [footer, setFooter] = useState(read('ftr'))
  const [date, setDate] = useState(read('dt'))
  const [number, setNumber] = useState(Boolean(get('sldNum')))
  const [auto, setAuto] = useState(/type="datetime/.test(get('dt')?.anchor.originalXml ?? ''))
  return (
    <PptxControlPanel busy={busy}>
      <ToolbarMenuFields label="页脚、日期与页码">
        <ToolbarMenuNote>当前值取本页占位符。应用将更新所有幻灯片。</ToolbarMenuNote>
        <ToolbarTextField label="页脚文字" value={footer} onChange={setFooter} />
        <ToolbarTextField label="页脚日期" value={date} onChange={setDate} />
        <ToolbarSelect
          label="自动日期"
          value={String(auto)}
          options={[
            { value: 'false', label: '使用输入日期' },
            { value: 'true', label: '使用当前日期字段' },
          ]}
          onChange={(value) => setAuto(value === 'true')}
        />
        <ToolbarSelect
          label="显示幻灯片页码"
          value={String(number)}
          options={[
            { value: 'false', label: '不显示' },
            { value: 'true', label: '显示' },
          ]}
          onChange={(value) => setNumber(value === 'true')}
        />
        <ToolbarButton
          label="应用所有幻灯片页脚"
          onClick={() =>
            void run({
              op: 'applyHeaderFooter',
              settings: {
                footer: footer || null,
                date: date || null,
                dateAuto: auto,
                slideNum: number,
              },
            })
          }
        >
          应用所有页
        </ToolbarButton>
      </ToolbarMenuFields>
    </PptxControlPanel>
  )
}

export function PptxReviewControls({
  metadata,
  index,
  count,
  apply,
}: {
  metadata: PptxMetadata
  index: number
  count: number
  apply: PptxApply
}) {
  const { busy, run } = usePptxAction(apply)
  const [name, setName] = useState('新分节')
  const [sectionId, setSection] = useState(
    metadata.sections.find((section) => section.slideIndices.includes(index))?.id ??
      metadata.sections[0]?.id ??
      '',
  )
  const section = metadata.sections.find((item) => item.id === sectionId)
  const [rename, setRename] = useState(section?.name ?? '')
  const [first, setFirst] = useState(section?.slideIndices[0] ?? 0)
  const [last, setLast] = useState(section?.slideIndices.at(-1) ?? 0)
  const at = metadata.sections.findIndex((item) => item.id === sectionId)
  const applyRange = () =>
    void run({
      op: 'setSections',
      sections: metadata.sections.map((item) =>
        item.id === sectionId
          ? {
              ...item,
              name: rename || item.name,
              slideIndices: Array.from({ length: last - first + 1 }, (_, offset) => first + offset),
            }
          : item,
      ),
    })
  return (
    <PptxControlPanel busy={busy}>
      <ToolbarMenuFields label="演示文稿分节">
        <ToolbarTextField label="新分节名称" value={name} onChange={setName} />
        <ToolbarButton
          label="从当前页添加分节"
          disabled={!name.trim()}
          disabledReason="请输入分节名称"
          onClick={() => void run({ op: 'addSection', atSlideIndex: index, name })}
        >
          从当前页分节
        </ToolbarButton>
        {metadata.sections.length > 0 ? (
          <>
            <ToolbarSelect
              label="选择分节"
              value={sectionId}
              options={metadata.sections.map((item) => ({
                value: item.id,
                label: `${item.name}（${item.slideIndices.map((i) => i + 1).join('、')}页）`,
              }))}
              onChange={(value) => {
                setSection(value)
                const next = metadata.sections.find((item) => item.id === value)
                setRename(next?.name ?? '')
                setFirst(next?.slideIndices[0] ?? 0)
                setLast(next?.slideIndices.at(-1) ?? 0)
              }}
            />
            <ToolbarTextField label="分节名称" value={rename} onChange={setRename} />
            <ToolbarButton
              label="重命名分节"
              disabled={!section || !rename.trim()}
              disabledReason="请选择分节并输入名称"
              onClick={() => void run({ op: 'renameSection', id: sectionId, name: rename })}
            >
              重命名
            </ToolbarButton>
            <ToolbarButton
              label="分节上移"
              disabled={at <= 0}
              disabledReason="已是第一个分节"
              onClick={() => void run({ op: 'moveSection', id: sectionId, dir: 'up' })}
            >
              分节上移
            </ToolbarButton>
            <ToolbarButton
              label="分节下移"
              disabled={at < 0 || at >= metadata.sections.length - 1}
              disabledReason="已是最后一个分节"
              onClick={() => void run({ op: 'moveSection', id: sectionId, dir: 'down' })}
            >
              分节下移
            </ToolbarButton>
            <ToolbarNumberField
              label="分节起始页"
              value={first + 1}
              min={1}
              max={count}
              onCommit={(value) => setFirst(value - 1)}
            />
            <ToolbarNumberField
              label="分节结束页"
              value={last + 1}
              min={1}
              max={count}
              onCommit={(value) => setLast(value - 1)}
            />
            <ToolbarMenuNote>分节按连续页范围组织；范围不得与其他分节重叠。</ToolbarMenuNote>
            <ToolbarButton
              label="更新分节范围"
              disabled={
                !section ||
                first > last ||
                metadata.sections.some(
                  (item) =>
                    item.id !== sectionId && item.slideIndices.some((i) => i >= first && i <= last),
                )
              }
              disabledReason="选择不重叠的连续页范围"
              onClick={applyRange}
            >
              更新范围
            </ToolbarButton>
            <ToolbarConfirm
              title="移除此分节？"
              description="分节中的幻灯片会保留。"
              confirmLabel="移除分节"
              onConfirm={() => void run({ op: 'removeSection', id: sectionId })}
            >
              <ToolbarButton label="移除分节">移除分节</ToolbarButton>
            </ToolbarConfirm>
          </>
        ) : (
          <ToolbarMenuNote>当前演示文稿尚未分节。</ToolbarMenuNote>
        )}
      </ToolbarMenuFields>
      <PptxCommentControls
        metadata={metadata}
        index={index}
        apply={apply}
        embedded
        disabled={busy}
      />
    </PptxControlPanel>
  )
}
