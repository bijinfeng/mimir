import { HtmlCssControls } from './HtmlCssControls.js'
import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { X, RefreshCw } from 'lucide-react'
import type { HtmlAgentResult } from '../agent/html-agent.js'
import type { HtmlOp } from '../../vendor/apps/html/src/renderer/document/ops.js'
import {
  flipImage,
  imageAlignStyles,
  parseImageTransform,
  rotateImage,
  transformStyles,
} from '../../vendor/apps/html/src/renderer/document/image-style.js'
import {
  ToolbarButton,
  ToolbarColorPicker,
  ToolbarFileButton,
  ToolbarPropertyForm,
  ToolbarNote,
  ToolbarSelect,
  ToolbarTextArea,
  ToolbarTextField,
} from '../shell/EditorShell.js'

type OpName = HtmlOp['op']
type ComputedStyle = {
  fontWeight?: string
  fontStyle?: string
  fontSize?: string
  color?: string
  textAlign?: string
  background?: string
  width?: string
  height?: string
  transform?: string
  objectFit?: string
  image?: { src?: string; alt?: string }
}

const COLORS = [
  { value: '#111827', label: '深色', swatch: '#111827' },
  { value: '#ffffff', label: '白色', swatch: '#ffffff' },
  { value: '#ef4444', label: '红色', swatch: '#ef4444' },
  { value: '#f59e0b', label: '橙色', swatch: '#f59e0b' },
  { value: '#22c55e', label: '绿色', swatch: '#22c55e' },
  { value: '#3b82f6', label: '蓝色', swatch: '#3b82f6' },
  { value: '#8b5cf6', label: '紫色', swatch: '#8b5cf6' },
] as const

const options: Array<{ value: OpName; label: string }> = [
  { value: 'set_text', label: '设置纯文本' },
  { value: 'set_inner_html', label: '设置内部 HTML' },
  { value: 'replace_element', label: '替换整个元素' },
  { value: 'insert_html', label: '插入 HTML' },
  { value: 'set_attr', label: '设置或移除属性' },
  { value: 'set_style', label: '设置或移除行内样式' },
  { value: 'set_tag', label: '更换标签' },
  { value: 'move', label: '移动到另一元素旁' },
  { value: 'set_text_node', label: '替换直接文本节点' },
  { value: 'wrap_text', label: '包裹文本片段' },
  { value: 'unwrap', label: '去掉元素标签' },
  { value: 'remove', label: '删除元素' },
  { value: 'str_replace', label: '在源码中替换文字' },
]

// The fixed upstream preview snapshot strips px from computed dimensions.
function dimensionText(value?: string): string {
  return value && /^\d+(?:\.\d+)?$/.test(value) ? `${value}px` : (value ?? '')
}

function buildOperation(
  op: OpName,
  sid: number,
  name: string,
  value: string,
  reference: string,
  position: string,
  index: string,
  start: string,
  end: string,
): HtmlOp | null {
  switch (op) {
    case 'set_text':
      return { op, sid, text: value }
    case 'set_inner_html':
    case 'replace_element':
      return { op, sid, html: value }
    case 'insert_html':
      return {
        op,
        sid,
        html: value,
        position: position as 'before' | 'after' | 'prepend' | 'append',
      }
    case 'set_attr':
      return name.trim() ? { op, sid, name: name.trim(), value: value === '' ? null : value } : null
    case 'set_style':
      return name.trim()
        ? { op, sid, styles: { [name.trim()]: value === '' ? null : value } }
        : null
    case 'set_tag':
      return name.trim() ? { op, sid, tag: name.trim() } : null
    case 'move':
      return Number.isSafeInteger(Number(reference)) && reference.trim()
        ? {
            op,
            sid,
            ref_sid: Number(reference),
            position: position === 'after' ? 'after' : 'before',
          }
        : null
    case 'set_text_node':
      return Number.isSafeInteger(Number(index))
        ? { op, sid, index: Number(index), text: value }
        : null
    case 'wrap_text':
      return Number.isSafeInteger(Number(index)) &&
        Number.isSafeInteger(Number(start)) &&
        Number.isSafeInteger(Number(end)) &&
        name.trim()
        ? {
            op,
            sid,
            index: Number(index),
            start: Number(start),
            end: Number(end),
            tag: name.trim(),
          }
        : null
    case 'unwrap':
    case 'remove':
      return { op, sid }
    case 'str_replace':
      return name ? { op, sid, old: name, new: value } : null
  }
}

function HtmlElementControls({
  sid,
  tag,
  computed,
  onDuplicate,
  onMove,
  onPickImage,
  onOpenPicture,
  onApply,
  onPreviewCss,
  version,
  targets,
}: {
  version: number
  targets: Array<{ value: string; label: string }>
  sid: number | null
  tag: string | null
  computed?: ComputedStyle
  onDuplicate: () => HtmlAgentResult | null
  onMove: (direction: -1 | 1) => HtmlAgentResult | null
  onPickImage: (file: File) => Promise<HtmlAgentResult>
  onOpenPicture: (kind: 'crop' | 'cutout') => Promise<HtmlAgentResult>
  onPreviewCss: (sid: number, styles: Record<string, string> | null) => void
  onApply: (ops: HtmlOp[], expectedVersion: number) => HtmlAgentResult
}) {
  const [tab, setTab] = useState<'style' | 'content' | 'image' | 'css'>(
    tag === 'img' ? 'image' : 'style',
  )
  const [baseline, setBaseline] = useState(version)
  const tabId = useId()
  const stale = version !== baseline
  const feedback = (result: HtmlAgentResult | null, fallback: string) => {
    setMessage(result?.ok ? (result.summary ?? fallback) : (result?.error ?? '未能应用。'))
    if (result?.ok) setBaseline(result.version)
  }
  const [op, setOp] = useState<OpName>('set_text')
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [reference, setReference] = useState('')
  const [position, setPosition] = useState<'before' | 'after' | 'prepend' | 'append'>('append')
  const [index, setIndex] = useState('0')
  const [start, setStart] = useState('0')
  const [end, setEnd] = useState('1')
  const [message, setMessage] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState(
    /^https?:\/\//i.test(computed?.image?.src ?? '') ? computed!.image!.src! : '',
  )
  const [imageAlt, setImageAlt] = useState(computed?.image?.alt ?? '')
  const [width, setWidth] = useState(dimensionText(computed?.width))
  const [height, setHeight] = useState(dimensionText(computed?.height))
  const [lockRatio, setLockRatio] = useState(false)
  const pictureSrc = computed?.image?.src ?? ''
  const pictureDisabledReason =
    pictureSrc === ''
      ? '预览尚未提供图片来源'
      : /^data:image\//i.test(pictureSrc) && pictureSrc.length > 7 * 1024 * 1024
        ? '图片超过 5 MB，无法进行像素编辑'
        : !/^(data:image\/|https?:\/\/)/i.test(pictureSrc)
          ? '相对资源无法直接读取，请先替换为本地图片或可访问的 URL'
          : undefined
  const needsName = ['set_attr', 'set_style', 'set_tag', 'wrap_text', 'str_replace'].includes(op)
  const needsValue = !['move', 'unwrap', 'remove', 'set_tag', 'wrap_text'].includes(op)
  const needsIndex = op === 'set_text_node' || op === 'wrap_text'
  const apply = () => {
    if (sid === null) return
    const operation = buildOperation(op, sid, name, value, reference, position, index, start, end)
    if (!operation) {
      setMessage('请补全命令参数。')
      return
    }
    const result = onApply([operation], baseline)
    feedback(result, '已应用。')
  }
  const run = (ops: HtmlOp[]) => {
    const result = onApply(ops, baseline)
    feedback(result, '已应用。')
    return result
  }
  const style = (styles: Record<string, string | null>) => {
    if (sid !== null) return run([{ op: 'set_style', sid, styles }])
  }
  const dimension = (property: 'width' | 'height', raw: string) => {
    const dimensionValue = raw.trim()
    // An untouched computed value must not replace authored %, auto or stylesheet sizing.
    if (dimensionValue && dimensionValue === dimensionText(computed?.[property])) {
      setMessage('尺寸未更改。')
      return
    }
    if (!dimensionValue) return style({ [property]: null })
    if (!/^\d+(?:\.\d+)?(?:px|%|em|rem|vw|vh)$/.test(dimensionValue)) {
      setMessage('尺寸需带单位，例如 320px、50% 或 20rem。')
      return
    }
    if (tag === 'img' && lockRatio) {
      const previousWidth = parseFloat(computed?.width ?? '')
      const previousHeight = parseFloat(computed?.height ?? '')
      if (!(previousWidth > 0 && previousHeight > 0) || !dimensionValue.endsWith('px')) {
        setMessage('锁定比例需要可计算的图片像素尺寸，并使用 px 设置新尺寸。')
        return
      }
      const amount = parseFloat(dimensionValue)
      const paired: Record<string, string> =
        property === 'width'
          ? { height: `${Math.round((amount * previousHeight) / previousWidth)}px` }
          : { width: `${Math.round((amount * previousWidth) / previousHeight)}px` }
      const result = style({ [property]: dimensionValue, ...paired })
      if (result?.ok) {
        if (paired.height) setHeight(paired.height)
        if (paired.width) setWidth(paired.width)
      }
      return
    }
    style({ [property]: dimensionValue })
  }
  const isVoid =
    tag !== null &&
    [
      'area',
      'base',
      'br',
      'col',
      'embed',
      'hr',
      'img',
      'input',
      'link',
      'meta',
      'param',
      'source',
      'track',
      'wbr',
    ].includes(tag)
  const blocked =
    sid === null ||
    stale ||
    (isVoid &&
      ['set_text', 'set_inner_html', 'set_text_node', 'wrap_text', 'unwrap'].includes(op)) ||
    (isVoid && op === 'insert_html' && ['append', 'prepend'].includes(position))
  const tabs = [
    { key: 'style', label: '文字样式' },
    { key: 'content', label: '内容与结构' },
    ...(tag === 'img' ? [{ key: 'image' as const, label: '图片' }] : []),
    { key: 'css', label: 'CSS' },
  ] as const
  return (
    <>
      <div className="mimir-html-inspector__tabs" role="tablist" aria-label="元素属性分类">
        {tabs.map((item, tabIndex) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            id={`${tabId}-${item.key}`}
            aria-selected={tab === item.key}
            aria-controls={`${tabId}-content`}
            tabIndex={tab === item.key ? 0 : -1}
            onClick={() => setTab(item.key)}
            onKeyDown={(event) => {
              let next = tabIndex
              if (event.key === 'ArrowRight') next = (tabIndex + 1) % tabs.length
              else if (event.key === 'ArrowLeft') next = (tabIndex - 1 + tabs.length) % tabs.length
              else if (event.key === 'Home') next = 0
              else if (event.key === 'End') next = tabs.length - 1
              else return
              event.preventDefault()
              setTab(tabs[next]!.key)
              const nextButton = event.currentTarget.parentElement
                ?.querySelectorAll<HTMLButtonElement>('button')
                .item(next)
              nextButton?.focus()
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {sid === null ? (
        <div className="mimir-html-inspector__empty">
          在预览中选择元素，或把源码光标移到要编辑的元素。
        </div>
      ) : (
        <>
          {stale && (
            <div className="mimir-html-inspector__notice" role="status">
              文档已更新，请刷新属性后继续编辑。
            </div>
          )}
          <div
            className="mimir-html-inspector__scroll"
            role="tabpanel"
            id={`${tabId}-content`}
            aria-labelledby={`${tabId}-${tab}`}
          >
            <fieldset disabled={stale} className="mimir-html-inspector__fields">
              <ToolbarPropertyForm columns={1}>
                {tab === 'style' && (
                  <>
                    <h3>字形与对齐</h3>
                    <div className="mimir-html-op-row">
                      <ToolbarButton
                        label="加粗或取消加粗"
                        active={
                          computed?.fontWeight === 'bold' || Number(computed?.fontWeight) >= 600
                        }
                        onClick={() =>
                          style({
                            'font-weight':
                              computed?.fontWeight === 'bold' || Number(computed?.fontWeight) >= 600
                                ? '400'
                                : '700',
                          })
                        }
                      >
                        加粗
                      </ToolbarButton>
                      <ToolbarButton
                        label="斜体或取消斜体"
                        active={computed?.fontStyle === 'italic'}
                        onClick={() =>
                          style({
                            'font-style': computed?.fontStyle === 'italic' ? 'normal' : 'italic',
                          })
                        }
                      >
                        斜体
                      </ToolbarButton>
                      <ToolbarButton
                        label="字号减小 2 像素"
                        onClick={() =>
                          style({
                            'font-size': `${Math.max(8, (parseFloat(computed?.fontSize ?? '') || 16) - 2)}px`,
                          })
                        }
                      >
                        字号 −
                      </ToolbarButton>
                      <ToolbarButton
                        label="字号增大 2 像素"
                        onClick={() =>
                          style({
                            'font-size': `${(parseFloat(computed?.fontSize ?? '') || 16) + 2}px`,
                          })
                        }
                      >
                        字号 +
                      </ToolbarButton>
                    </div>
                    <div className="mimir-html-op-row">
                      {(['left', 'center', 'right'] as const).map((align) => (
                        <ToolbarButton
                          key={align}
                          label={`文字${align === 'left' ? '左' : align === 'center' ? '居中' : '右'}对齐`}
                          active={computed?.textAlign === align}
                          onClick={() => style({ 'text-align': align })}
                        >
                          {align === 'left' ? '左对齐' : align === 'center' ? '居中' : '右对齐'}
                        </ToolbarButton>
                      ))}
                    </div>
                    <ToolbarColorPicker
                      inline
                      label="文字颜色"
                      value={computed?.color ?? null}
                      options={COLORS}
                      onPick={(color) => style({ color })}
                      onClear={() => style({ color: null })}
                    />
                    <ToolbarColorPicker
                      inline
                      label="背景颜色"
                      value={computed?.background ?? null}
                      options={COLORS}
                      onPick={(color) => style({ 'background-color': color })}
                      onClear={() => style({ 'background-color': null })}
                    />

                    <h3>元素尺寸</h3>
                    <div className="mimir-html-op-row">
                      <ToolbarTextField
                        label="宽度"
                        value={width}
                        onChange={setWidth}
                        placeholder={computed?.width || '例如 320px'}
                      />
                      <ToolbarButton label="设置宽度" onClick={() => dimension('width', width)}>
                        应用宽度
                      </ToolbarButton>
                    </div>
                    <div className="mimir-html-op-row">
                      <ToolbarTextField
                        label="高度"
                        value={height}
                        onChange={setHeight}
                        placeholder={computed?.height || '例如 240px'}
                      />
                      <ToolbarButton label="设置高度" onClick={() => dimension('height', height)}>
                        应用高度
                      </ToolbarButton>
                    </div>
                    {tag === 'img' && (
                      <ToolbarButton
                        label="锁定图片宽高比例"
                        active={lockRatio}
                        onClick={() => setLockRatio((current) => !current)}
                      >
                        {lockRatio ? '比例已锁定' : '锁定比例'}
                      </ToolbarButton>
                    )}
                  </>
                )}
                {tab === 'image' && (
                  <>
                    {tag === 'img' && (
                      <>
                        <ToolbarTextField
                          label="图片替代文字"
                          value={imageAlt}
                          onChange={setImageAlt}
                          placeholder={computed?.image?.alt || '描述图片；装饰图可留空'}
                        />
                        <ToolbarButton
                          label="设置图片替代文字"
                          onClick={() =>
                            run([{ op: 'set_attr', sid, name: 'alt', value: imageAlt }])
                          }
                        >
                          应用替代文字
                        </ToolbarButton>
                        <ToolbarSelect
                          label="图片填充方式"
                          value={computed?.objectFit ?? 'fill'}
                          options={[
                            { value: 'fill', label: '拉伸填满' },
                            { value: 'contain', label: '完整显示' },
                            { value: 'cover', label: '裁满画框' },
                            { value: 'none', label: '原始大小' },
                            { value: 'scale-down', label: '只缩小' },
                          ]}
                          onChange={(fit) => style({ 'object-fit': fit })}
                        />
                        <div className="mimir-html-op-row">
                          <ToolbarButton
                            label="图片向左旋转 90 度"
                            onClick={() =>
                              style(
                                transformStyles(
                                  rotateImage(parseImageTransform(computed?.transform ?? ''), -1),
                                ),
                              )
                            }
                          >
                            左转 90°
                          </ToolbarButton>
                          <ToolbarButton
                            label="图片向右旋转 90 度"
                            onClick={() =>
                              style(
                                transformStyles(
                                  rotateImage(parseImageTransform(computed?.transform ?? ''), 1),
                                ),
                              )
                            }
                          >
                            右转 90°
                          </ToolbarButton>
                          <ToolbarButton
                            label="图片水平翻转"
                            onClick={() =>
                              style(
                                transformStyles(
                                  flipImage(parseImageTransform(computed?.transform ?? ''), 'h'),
                                ),
                              )
                            }
                          >
                            水平翻转
                          </ToolbarButton>
                          <ToolbarButton
                            label="图片垂直翻转"
                            onClick={() =>
                              style(
                                transformStyles(
                                  flipImage(parseImageTransform(computed?.transform ?? ''), 'v'),
                                ),
                              )
                            }
                          >
                            垂直翻转
                          </ToolbarButton>
                        </div>
                        <div className="mimir-html-op-row">
                          {(['left', 'center', 'right'] as const).map((align) => (
                            <ToolbarButton
                              key={align}
                              label={`图片${align === 'left' ? '左' : align === 'center' ? '居中' : '右'}对齐`}
                              onClick={() => style(imageAlignStyles(align))}
                            >
                              {align === 'left'
                                ? '图片左对齐'
                                : align === 'center'
                                  ? '图片居中'
                                  : '图片右对齐'}
                            </ToolbarButton>
                          ))}
                        </div>
                        <ToolbarFileButton
                          label="从本地替换图片"
                          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                          onPick={async (file) => {
                            const result = await onPickImage(file)
                            feedback(result, '已替换图片。')
                          }}
                        >
                          选择本地图片
                        </ToolbarFileButton>
                        <div className="mimir-html-op-row">
                          {(['crop', 'cutout'] as const).map((kind) => (
                            <ToolbarButton
                              key={kind}
                              label={kind === 'crop' ? '裁切图片像素' : '去除图片背景'}
                              disabled={pictureDisabledReason !== undefined}
                              disabledReason={pictureDisabledReason}
                              onClick={() => {
                                void onOpenPicture(kind).then((result) =>
                                  setMessage(
                                    result.ok
                                      ? (result.summary ?? '图片编辑已打开。')
                                      : (result.error ?? '图片编辑失败。'),
                                  ),
                                )
                              }}
                            >
                              {kind === 'crop' ? '裁切图片' : '去除背景'}
                            </ToolbarButton>
                          ))}
                        </div>
                        <ToolbarTextField
                          label="替换图片 URL"
                          value={imageUrl}
                          onChange={setImageUrl}
                          placeholder="https://…"
                        />
                        <ToolbarButton
                          label="替换图片来源"
                          onClick={() => {
                            if (!/^https?:\/\//i.test(imageUrl)) {
                              setMessage('请输入以 http:// 或 https:// 开始的图片 URL。')
                              return
                            }
                            run([{ op: 'set_attr', sid, name: 'src', value: imageUrl }])
                          }}
                        >
                          替换图片
                        </ToolbarButton>
                      </>
                    )}

                    <h3>尺寸与比例</h3>
                    <div className="mimir-html-op-row">
                      <ToolbarTextField
                        label="宽度"
                        value={width}
                        onChange={setWidth}
                        placeholder={computed?.width || '例如 320px'}
                      />
                      <ToolbarButton label="设置宽度" onClick={() => dimension('width', width)}>
                        应用宽度
                      </ToolbarButton>
                    </div>
                    <div className="mimir-html-op-row">
                      <ToolbarTextField
                        label="高度"
                        value={height}
                        onChange={setHeight}
                        placeholder={computed?.height || '例如 240px'}
                      />
                      <ToolbarButton label="设置高度" onClick={() => dimension('height', height)}>
                        应用高度
                      </ToolbarButton>
                    </div>
                    {tag === 'img' && (
                      <ToolbarButton
                        label="锁定图片宽高比例"
                        active={lockRatio}
                        onClick={() => setLockRatio((current) => !current)}
                      >
                        {lockRatio ? '比例已锁定' : '锁定比例'}
                      </ToolbarButton>
                    )}
                  </>
                )}
                {tab === 'content' && (
                  <>
                    <h3>位置与副本</h3>
                    <div className="mimir-html-op-row">
                      <ToolbarButton
                        label="元素上移"
                        onClick={() => {
                          const result = onMove(-1)
                          feedback(result, '已上移元素。')
                        }}
                      >
                        上移
                      </ToolbarButton>
                      <ToolbarButton
                        label="元素下移"
                        onClick={() => {
                          const result = onMove(1)
                          feedback(result, '已下移元素。')
                        }}
                      >
                        下移
                      </ToolbarButton>
                    </div>
                    <div className="mimir-html-op-row">
                      <ToolbarButton
                        label="复制选中元素"
                        onClick={() => {
                          const result = onDuplicate()
                          feedback(result, '已复制元素。')
                        }}
                      >
                        复制元素
                      </ToolbarButton>
                    </div>

                    <h3>编辑内容与结构</h3>
                    <ToolbarSelect
                      label="元素命令"
                      value={op}
                      options={options.map((option) => ({
                        value: option.value,
                        label: option.label,
                        disabled:
                          isVoid &&
                          [
                            'set_text',
                            'set_inner_html',
                            'set_text_node',
                            'wrap_text',
                            'unwrap',
                          ].includes(option.value),
                      }))}
                      onChange={(next) => {
                        setOp(next)
                        setMessage(null)
                      }}
                    />
                    {needsName && (
                      <ToolbarTextField
                        label={
                          op === 'str_replace'
                            ? '要查找的原文'
                            : op === 'set_tag' || op === 'wrap_text'
                              ? '标签名'
                              : op === 'set_style'
                                ? 'CSS 属性名'
                                : '属性名'
                        }
                        value={name}
                        onChange={setName}
                      />
                    )}
                    {needsValue && (
                      <ToolbarTextArea
                        label={
                          op === 'str_replace'
                            ? '替换为'
                            : op === 'set_text_node'
                              ? '文本节点内容'
                              : op === 'set_attr' || op === 'set_style'
                                ? '值（留空则移除）'
                                : '内容'
                        }
                        value={value}
                        onChange={setValue}
                        rows={3}
                      />
                    )}
                    {op === 'insert_html' && (
                      <ToolbarSelect
                        label="插入位置"
                        value={position}
                        options={[
                          { value: 'before', label: '元素前' },
                          { value: 'after', label: '元素后' },
                          { value: 'prepend', label: '内部开头' },
                          { value: 'append', label: '内部末尾' },
                        ]}
                        onChange={setPosition}
                      />
                    )}
                    {op === 'move' && (
                      <>
                        <ToolbarSelect
                          label="参照元素"
                          value={reference || null}
                          options={targets}
                          emptyLabel="选择大纲中的元素"
                          onChange={setReference}
                        />
                        <ToolbarSelect
                          label="移动位置"
                          value={position === 'after' ? 'after' : 'before'}
                          options={[
                            { value: 'before', label: '参照元素前' },
                            { value: 'after', label: '参照元素后' },
                          ]}
                          onChange={setPosition}
                        />
                      </>
                    )}
                    {needsIndex && (
                      <ToolbarTextField
                        label="直接文本节点索引（从 0 起）"
                        value={index}
                        onChange={setIndex}
                      />
                    )}
                    {op === 'wrap_text' && (
                      <>
                        <ToolbarTextField label="起始字符偏移" value={start} onChange={setStart} />
                        <ToolbarTextField label="结束字符偏移" value={end} onChange={setEnd} />
                      </>
                    )}

                    {isVoid && (
                      <ToolbarNote>
                        此元素没有内部内容；可替换整个元素，或在元素前后插入。
                      </ToolbarNote>
                    )}
                  </>
                )}
                {tab === 'css' && !stale && (
                  <HtmlCssControls
                    sid={sid}
                    onPreview={onPreviewCss}
                    onApply={(styles) => {
                      const result = onApply([{ op: 'set_style', sid, styles }], baseline)
                      feedback(result, '已应用 CSS。')
                      return result
                    }}
                  />
                )}
              </ToolbarPropertyForm>
            </fieldset>
          </div>
          <footer className="mimir-html-inspector__footer">
            {message && (
              <div role="status" className="mimir-html-inspector__feedback">
                {message}
              </div>
            )}
            {tab === 'content' && (
              <ToolbarButton
                label="应用元素编辑"
                primary
                disabled={blocked}
                disabledReason={stale ? '文档已更新，请刷新属性' : '当前元素不支持此操作'}
                onClick={apply}
              />
            )}
            {tab === 'style' && <ToolbarNote>样式即时应用，可使用工具栏撤销。</ToolbarNote>}
            {tab === 'image' && <ToolbarNote>修改即时写入当前画布；保存后写入原件。</ToolbarNote>}
          </footer>
        </>
      )}
    </>
  )
}

type HtmlElementMenuProps = Parameters<typeof HtmlElementControls>[0] & {
  onClose(): void
  triggerRef: RefObject<HTMLButtonElement | null>
}

export function HtmlElementMenu({ onClose, triggerRef, ...props }: HtmlElementMenuProps) {
  const root = useRef<HTMLElement>(null)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    const panel = root.current
    const editor = panel?.closest('.mimir-editor')
    const trigger = triggerRef.current ?? document.activeElement
    panel?.focus()
    return () => {
      const active = document.activeElement
      if (active !== document.body && active !== panel && !panel?.contains(active)) return
      if (trigger instanceof HTMLButtonElement && trigger.isConnected && !trigger.disabled)
        trigger.focus()
      else
        editor
          ?.querySelector<HTMLButtonElement>('[data-section-key="selection"] button:not(:disabled)')
          ?.focus()
    }
  }, [triggerRef])
  return (
    <aside
      ref={root}
      className="mimir-html-inspector"
      aria-label="HTML 元素属性"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <header className="mimir-html-inspector__header">
        <div>
          <h2>元素属性</h2>
          <span>{props.tag ? `<${props.tag}>` : '未选择元素'}</span>
        </div>
        <div className="mimir-html-op-row">
          <ToolbarButton label="刷新元素属性" onClick={() => setRefresh((value) => value + 1)}>
            <RefreshCw size={16} />
          </ToolbarButton>
          <ToolbarButton label="关闭元素属性" onClick={onClose}>
            <X size={16} />
          </ToolbarButton>
        </div>
      </header>
      <HtmlElementControls key={`${props.sid}:${refresh}`} {...props} />
    </aside>
  )
}
