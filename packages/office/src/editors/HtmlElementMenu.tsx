import { useState } from 'react'
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
  ToolbarMenu,
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

/** GenOffice StylePanel custom CSS uses this declaration grammar. */
function parseDeclarations(css: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of css.split(';')) {
    const index = part.indexOf(':')
    if (index < 0) continue
    const property = part.slice(0, index).trim().toLowerCase()
    const declarationValue = part.slice(index + 1).trim()
    if (/^-?[a-z][a-z0-9-]*$/.test(property) && declarationValue) out[property] = declarationValue
  }
  return out
}

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

export function HtmlElementMenu({
  sid,
  tag,
  computed,
  onDuplicate,
  onMove,
  onPickImage,
  onOpenPicture,
  onApply,
}: {
  sid: number | null
  tag: string | null
  computed?: ComputedStyle
  onDuplicate: () => HtmlAgentResult | null
  onMove: (direction: -1 | 1) => HtmlAgentResult | null
  onPickImage: (file: File) => Promise<HtmlAgentResult>
  onOpenPicture: (kind: 'crop' | 'cutout') => Promise<HtmlAgentResult>
  onApply: (ops: HtmlOp[]) => HtmlAgentResult
}) {
  const [op, setOp] = useState<OpName>('set_text')
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [reference, setReference] = useState('')
  const [position, setPosition] = useState<'before' | 'after' | 'prepend' | 'append'>('append')
  const [index, setIndex] = useState('0')
  const [start, setStart] = useState('0')
  const [end, setEnd] = useState('1')
  const [message, setMessage] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState('')
  const [imageAlt, setImageAlt] = useState('')
  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')
  const [customCss, setCustomCss] = useState('')
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
    const result = onApply([operation])
    setMessage(result.ok ? (result.summary ?? '已应用。') : (result.error ?? '未能应用。'))
  }
  const run = (ops: HtmlOp[]) => {
    const result = onApply(ops)
    setMessage(result.ok ? (result.summary ?? '已应用。') : (result.error ?? '未能应用。'))
  }
  const style = (styles: Record<string, string | null>) => {
    if (sid !== null) run([{ op: 'set_style', sid, styles }])
  }
  const dimension = (property: 'width' | 'height', raw: string) => {
    const dimensionValue = raw.trim()
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
      style({ [property]: dimensionValue, ...paired })
      return
    }
    style({ [property]: dimensionValue })
  }
  return (
    <ToolbarMenu
      label="元素编辑"
      text="编辑元素"
      panelWidth={400}
      renderPanel={() => (
        <div className="mimir-html-op-panel">
          {sid === null ? (
            <ToolbarNote>先在预览中选择一个源码元素。</ToolbarNote>
          ) : (
            <ToolbarNote>当前元素 sid={sid}。命令会写入当前源码，并可撤销。</ToolbarNote>
          )}
          {sid !== null && (
            <>
              <div className="mimir-html-op-row">
                <ToolbarButton
                  label="元素上移"
                  onClick={() => {
                    const result = onMove(-1)
                    setMessage(
                      result?.ok ? '已上移元素。' : (result?.error ?? '元素不能继续上移。'),
                    )
                  }}
                >
                  上移
                </ToolbarButton>
                <ToolbarButton
                  label="元素下移"
                  onClick={() => {
                    const result = onMove(1)
                    setMessage(
                      result?.ok ? '已下移元素。' : (result?.error ?? '元素不能继续下移。'),
                    )
                  }}
                >
                  下移
                </ToolbarButton>
                <ToolbarButton
                  label="加粗或取消加粗"
                  active={computed?.fontWeight === 'bold' || Number(computed?.fontWeight) >= 600}
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
                    style({ 'font-style': computed?.fontStyle === 'italic' ? 'normal' : 'italic' })
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
                    style({ 'font-size': `${(parseFloat(computed?.fontSize ?? '') || 16) + 2}px` })
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
              <ToolbarNote>文字颜色</ToolbarNote>
              <ToolbarColorPicker
                inline
                label="文字颜色"
                value={computed?.color ?? null}
                options={COLORS}
                onPick={(color) => style({ color })}
                onClear={() => style({ color: null })}
              />
              <ToolbarNote>背景颜色</ToolbarNote>
              <ToolbarColorPicker
                inline
                label="背景颜色"
                value={computed?.background ?? null}
                options={COLORS}
                onPick={(color) => style({ 'background-color': color })}
                onClear={() => style({ 'background-color': null })}
              />
              <div className="mimir-html-op-row">
                <ToolbarButton
                  label="复制选中元素"
                  onClick={() => {
                    const result = onDuplicate()
                    setMessage(result?.ok ? '已复制元素。' : (result?.error ?? '无法复制元素。'))
                  }}
                >
                  复制元素
                </ToolbarButton>
              </div>
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
                    onClick={() => run([{ op: 'set_attr', sid, name: 'alt', value: imageAlt }])}
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
                      setMessage(
                        result.ok
                          ? (result.summary ?? '已替换图片。')
                          : (result.error ?? '读取图片失败。'),
                      )
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
              <ToolbarTextArea
                label="自定义 CSS 声明"
                value={customCss}
                onChange={setCustomCss}
                placeholder="例如 color: red; padding: 8px"
                rows={2}
              />
              <ToolbarButton
                label="应用自定义 CSS"
                onClick={() => {
                  const declarations = parseDeclarations(customCss)
                  if (Object.keys(declarations).length === 0) {
                    setMessage('没有有效的 CSS 声明。')
                    return
                  }
                  style(declarations)
                  setCustomCss('')
                }}
              >
                应用 CSS
              </ToolbarButton>
            </>
          )}
          <ToolbarSelect
            label="元素命令"
            value={op}
            options={options}
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
              <ToolbarTextField label="参照元素 sid" value={reference} onChange={setReference} />
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
          <ToolbarButton
            label="应用元素编辑"
            disabled={sid === null}
            disabledReason="先在预览里选择一个元素"
            onClick={apply}
          >
            应用
          </ToolbarButton>
          {message && <ToolbarNote>{message}</ToolbarNote>}
        </div>
      )}
    />
  )
}
