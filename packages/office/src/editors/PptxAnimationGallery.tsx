import { useEffect, useRef, useState } from 'react'
import { Button, Checkbox } from 'antd'
import {
  Circle,
  MoveRight,
  MoveDown,
  MoveDownRight,
  RotateCw,
  Route,
  Sparkles,
  Plus,
  Ban,
  Play,
  ZoomIn,
  ZoomOut,
  ArrowDownToLine,
} from 'lucide-react'
import {
  ANIM_EFFECTS,
  animClassOf,
  type AnimEffectKind,
  type SlideAnimation,
} from '../../vendor/packages/pptx-engine/src/animation.js'
import type { Slide } from '../../vendor/packages/pptx-engine/src/types.js'
import type { PptxManualAnimation } from '../../../shared/src/pptx-animation.js'
import {
  ToolbarButton,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarNumberField,
  ToolbarSelect,
} from '../shell/EditorShell.js'
import {
  PPTX_ANIMATION_LABELS,
  PPTX_MOTION_PRESETS,
  pptxAnimationDefaultDuration,
  pptxAnimationElement,
  pptxAnimationItems,
  pptxAnimationParagraphCount,
  pptxSelectedAnimations,
} from './pptx-animation-tools.js'
import type { PptxAnimationPreviewRequest } from './PptxAnimationPreview.js'
import './pptx-animation-controls.css'

const classes = [
  ['entrance', '进入'],
  ['emphasis', '强调'],
  ['exit', '退出'],
  ['media', '媒体'],
] as const
const triggers = [
  { value: 'onClick', label: '单击时' },
  { value: 'withPrev', label: '与上一动画同时' },
  { value: 'afterPrev', label: '上一动画之后' },
] as const
function EffectIcon({ effect }: { effect: AnimEffectKind }) {
  const Icon =
    effect === 'spin' || effect === 'teeter'
      ? RotateCw
      : effect === 'zoom' || effect === 'grow'
        ? ZoomIn
        : effect === 'zoomOut' || effect === 'shrink'
          ? ZoomOut
          : effect === 'flyIn' || effect === 'flyOut'
            ? MoveRight
            : effect === 'wipe' || effect === 'wipeOut' || effect === 'wipeDown'
              ? ArrowDownToLine
              : effect.startsWith('media')
                ? Play
                : Sparkles
  return <Icon size={18} aria-hidden="true" />
}
export function PptxAnimationGallery({
  slide,
  target,
  busy,
  run,
  onPreview,
}: {
  slide: Slide
  target: { slide: number; el: string } | null
  busy: boolean
  run: (input: PptxManualAnimation) => Promise<boolean>
  onPreview?: (request: PptxAnimationPreviewRequest | null) => void
}) {
  const [effect, setEffect] = useState<AnimEffectKind>('fade'),
    [trigger, setTrigger] = useState<SlideAnimation['trigger']>('onClick'),
    [duration, setDuration] = useState(500),
    [delay, setDelay] = useState(0),
    [byParagraph, setByParagraph] = useState(() => {
      const items = target ? pptxSelectedAnimations(slide, target.el) : []
      return items.length > 1 && items.every((item) => item.paragraph !== undefined)
    }),
    [direction, setDirection] = useState<NonNullable<SlideAnimation['direction']>>('bottom'),
    [paragraph, setParagraph] = useState(0),
    [motionPath, setMotionPath] = useState<string>(PPTX_MOTION_PRESETS[0].path)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    nonce = useRef(0)
  const previewCallback = useRef(onPreview)
  useEffect(() => {
    previewCallback.current = onPreview
  })
  const stop = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = null
    previewCallback.current?.(null)
  }
  useEffect(() => {
    if (!slide.path || !target?.el) previewCallback.current?.(null)
    return () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current)
      previewCallback.current?.(null)
    }
  }, [slide.path, target?.el])
  const selected = target ? pptxAnimationElement(slide.elements, target.el) : undefined
  const media = selected?.type === 'picture' && Boolean(selected.media)
  const count = pptxAnimationParagraphCount(selected)
  const existing = target ? pptxSelectedAnimations(slide, target.el) : []
  const preview = (value: AnimEffectKind, path?: string) => {
    stop()
    if (!target || busy || value.startsWith('media')) return
    const id = target.el
    hoverTimer.current = setTimeout(() => {
      hoverTimer.current = null
      previewCallback.current?.({
        token: ++nonce.current,
        items: pptxAnimationItems(slide, id, {
          effect: value,
          ...(path ? { motionPath: path } : { byParagraph }),
        }),
      })
    }, 350)
  }
  const commit = (value: AnimEffectKind | 'none', replace: boolean, path?: string) => {
    stop()
    if (!target) return
    void run(
      value === 'none'
        ? { kind: 'animation', slide: target.slide, elementId: target.el, operation: 'remove' }
        : {
            kind: 'animation',
            slide: target.slide,
            elementId: target.el,
            operation: replace ? 'replace' : 'add',
            effect: value,
            ...(value.startsWith('media') || path ? {} : { byParagraph }),
            ...(path ? { motionPath: path } : {}),
          },
    )
  }
  const current = !target
    ? '先选择一个对象'
    : existing.length
      ? `当前：${existing
          .map((item) => PPTX_ANIMATION_LABELS[item.effect])
          .filter((item, index, all) => all.indexOf(item) === index)
          .join('、')} · ${existing.length} 项`
      : '当前：无动画'
  return (
    <>
      <div className="mimir-pptx-animation-gallery">
        <ToolbarMenuNote>{current}</ToolbarMenuNote>
        <Checkbox
          disabled={busy || count < 2}
          checked={byParagraph}
          onChange={(event) => setByParagraph(event.target.checked)}
        >
          按段落依次播放{count > 1 ? `（${count} 段）` : ''}
        </Checkbox>
        <p className="mimir-pptx-animation-gallery__hint">
          点击效果替换所选对象的动画；悬停或聚焦可预览。
        </p>
        <Button
          className="mimir-pptx-animation-gallery__none"
          aria-label="无动画"
          icon={<Ban size={16} />}
          disabled={busy || !target || existing.length === 0}
          onClick={() => commit('none', true)}
        >
          无动画
        </Button>
        {classes.map(
          ([kind, label]) =>
            (kind !== 'media' || media) && (
              <section key={kind} aria-label={`${label}动画`}>
                <h4>{label}</h4>
                <div className="mimir-pptx-animation-gallery__grid">
                  {ANIM_EFFECTS.filter((value) => animClassOf(value) === kind).map((value) => (
                    <Button
                      key={value}
                      className="mimir-pptx-animation-gallery__effect"
                      aria-label={`替换为${PPTX_ANIMATION_LABELS[value]}动画`}
                      aria-pressed={
                        existing.length > 0 && existing.every((item) => item.effect === value)
                      }
                      disabled={busy || !target}
                      onClick={() => commit(value, true)}
                      onPointerEnter={() => preview(value)}
                      onPointerLeave={stop}
                      onFocus={() => preview(value)}
                      onBlur={stop}
                    >
                      <EffectIcon effect={value} />
                      <span>{PPTX_ANIMATION_LABELS[value]}</span>
                    </Button>
                  ))}
                </div>
              </section>
            ),
        )}
        <section aria-label="运动路径">
          <h4>
            运动路径<span>追加到现有动画</span>
          </h4>
          <div className="mimir-pptx-animation-gallery__grid">
            {PPTX_MOTION_PRESETS.map((preset, index) => {
              const Icon = [MoveRight, MoveDown, MoveDownRight, Circle, Route][index]!
              return (
                <Button
                  key={preset.key}
                  className="mimir-pptx-animation-gallery__effect"
                  aria-label={`添加${preset.label}运动路径`}
                  disabled={busy || !target}
                  onClick={() => commit('motionPath', false, preset.path)}
                  onPointerEnter={() => preview('motionPath', preset.path)}
                  onPointerLeave={stop}
                  onFocus={() => preview('motionPath', preset.path)}
                  onBlur={stop}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span>{preset.label}</span>
                </Button>
              )
            })}
          </div>
        </section>
        <details className="mimir-pptx-animation-gallery__advanced">
          <summary>添加动画参数</summary>
          <ToolbarMenuFields label="添加另一项动画">
            <ToolbarSelect
              label="新增动画效果"
              value={effect}
              options={ANIM_EFFECTS.filter((value) => !value.startsWith('media') || media).map(
                (value) => ({ value, label: PPTX_ANIMATION_LABELS[value] }),
              )}
              onChange={(value) => {
                setEffect(value)
                setDuration(pptxAnimationDefaultDuration(value))
              }}
            />
            <ToolbarSelect
              label="动画开始方式"
              value={trigger}
              options={triggers}
              onChange={setTrigger}
            />
            <ToolbarNumberField
              label="动画持续毫秒"
              value={duration}
              min={0}
              max={60000}
              step={100}
              onCommit={setDuration}
            />
            <ToolbarNumberField
              label="动画延迟毫秒"
              value={delay}
              min={0}
              max={60000}
              step={100}
              onCommit={setDelay}
            />
            {effect === 'motionPath' && (
              <ToolbarSelect
                label="运动路径方向"
                value={motionPath}
                options={PPTX_MOTION_PRESETS.map((preset) => ({
                  value: preset.path,
                  label: preset.label,
                }))}
                onChange={setMotionPath}
              />
            )}
            {['flyIn', 'flyOut', 'wipe', 'wipeOut'].includes(effect) && (
              <ToolbarSelect
                label="新增动画方向"
                value={direction}
                options={[
                  { value: 'top', label: '从上方' },
                  { value: 'bottom', label: '从下方' },
                  { value: 'left', label: '从左侧' },
                  { value: 'right', label: '从右侧' },
                ]}
                onChange={setDirection}
              />
            )}
            {!effect.startsWith('media') && !byParagraph && (
              <ToolbarNumberField
                label="动画目标段落（0为整个对象）"
                value={paragraph}
                min={0}
                max={count}
                onCommit={setParagraph}
              />
            )}
          </ToolbarMenuFields>
        </details>
      </div>
      <div className="mimir-pptx-animation__footer">
        <span className="mimir-pptx-animation__summary">
          {PPTX_ANIMATION_LABELS[effect]} · {duration} ms
        </span>
        <ToolbarButton
          label="为选中对象添加动画"
          primary
          disabled={busy || !target || (effect.startsWith('media') && !media)}
          disabledReason={busy ? '正在修改动画' : '先选择适用的对象'}
          onClick={() => {
            stop()
            if (target)
              void run({
                kind: 'animation',
                slide: target.slide,
                elementId: target.el,
                operation: 'add',
                effect,
                trigger,
                durationMs: duration,
                delayMs: delay,
                ...(effect === 'motionPath' ? { motionPath } : {}),
                ...(['flyIn', 'flyOut', 'wipe', 'wipeOut'].includes(effect) ? { direction } : {}),
                ...(!effect.startsWith('media')
                  ? byParagraph
                    ? { byParagraph }
                    : paragraph > 0
                      ? { paragraph: paragraph - 1 }
                      : {}
                  : {}),
              })
          }}
        >
          <Plus size={16} aria-hidden="true" />
        </ToolbarButton>
      </div>
    </>
  )
}
