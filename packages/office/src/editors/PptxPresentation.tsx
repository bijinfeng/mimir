import { useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react'
import {
  getSlideAnimations,
  type SlideAnimation,
} from '../../vendor/packages/pptx-engine/src/animation.js'
import {
  readSlideAdvanceTimeXml,
  readSlideTransitionXml,
} from '../../vendor/packages/pptx-engine/src/generate.js'
import type { PptxEditSession } from '../pptx.js'
import { renderSlide } from '../pptx-render.js'
import type { PptxLink } from '../pptx-metadata.js'
import { ToolbarButton, ToolbarNote } from '../shell/EditorShell.js'
import {
  pptxPlayOrder,
  pptxRehearsalVisit,
  pptxShowClock,
  type PptxRehearsalClock,
  type PptxRehearsalResult,
} from './pptx-show.js'
import './pptx-presentation.css'

export interface PptxPlaybackItem {
  animation: SlideAnimation
  startMs: number
}
/** onClick starts a step; withPrev and afterPrev keep their relative timing in that step. */
export function pptxPlaybackSteps(items: SlideAnimation[]): PptxPlaybackItem[][] {
  const steps: PptxPlaybackItem[][] = [[]]
  let previousStart = 0,
    previousEnd = 0
  for (const animation of items) {
    if (animation.trigger === 'onClick') {
      steps.push([])
      previousStart = 0
      previousEnd = 0
    }
    const startMs =
      (animation.trigger === 'afterPrev'
        ? previousEnd
        : animation.trigger === 'withPrev'
          ? previousStart
          : 0) + animation.delayMs
    steps.at(-1)!.push({ animation, startMs })
    previousStart = startMs
    previousEnd = startMs + animation.durationMs
  }
  return steps
}
const exits = new Set(['disappear', 'fadeOut', 'flyOut', 'wipeOut', 'shrink', 'zoomOut'])
const entrances = new Set([
  'appear',
  'fade',
  'flyIn',
  'wipe',
  'wipeDown',
  'splitIn',
  'bounce',
  'flipIn',
  'zoom',
])
const supported = (animation: SlideAnimation) =>
  !animation.presetXml && animation.paragraph === undefined && !animation.effect.startsWith('media')
function frames(item: SlideAnimation, width: number, height: number): Keyframe[] {
  const distance =
    item.direction === 'left'
      ? [-width, 0]
      : item.direction === 'right'
        ? [width, 0]
        : item.direction === 'top'
          ? [0, -height]
          : [0, height]
  const offset = `${distance[0]}px ${distance[1]}px`
  switch (item.effect) {
    case 'appear':
    case 'fade':
      return [{ opacity: 0 }, { opacity: 1 }]
    case 'disappear':
    case 'fadeOut':
      return [{ opacity: 1 }, { opacity: 0 }]
    case 'flyIn':
      return [
        { opacity: 0, translate: offset },
        { opacity: 1, translate: '0px 0px' },
      ]
    case 'flyOut':
      return [
        { opacity: 1, translate: '0px 0px' },
        { opacity: 0, translate: offset },
      ]
    case 'zoom':
      return [
        { opacity: 0, scale: '.2' },
        { opacity: 1, scale: '1' },
      ]
    case 'shrink':
    case 'zoomOut':
      return [
        { scale: '1', opacity: 1 },
        { scale: '.1', opacity: 0 },
      ]
    case 'pulse':
      return [{ scale: '1' }, { scale: '1.15', offset: 0.5 }, { scale: '1' }]
    case 'spin':
      return [{ rotate: '0deg' }, { rotate: '360deg' }]
    case 'grow':
      return [{ scale: '1' }, { scale: '1.25' }]
    case 'teeter':
      return [
        { rotate: '0deg' },
        { rotate: '-8deg', offset: 0.25 },
        { rotate: '8deg', offset: 0.75 },
        { rotate: '0deg' },
      ]
    case 'bounce':
      return [
        { opacity: 0, translate: `0px ${-height}px` },
        { opacity: 1, translate: '0px 12px', offset: 0.7 },
        { translate: '0px -5px', offset: 0.85 },
        { translate: '0px 0px' },
      ]
    case 'flipIn':
      return [
        { scale: '0 1', opacity: 0 },
        { scale: '1 1', opacity: 1 },
      ]
    case 'wipe':
    case 'wipeDown':
      return [{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0 0)' }]
    case 'wipeOut':
      return [{ clipPath: 'inset(0 0 0 0)' }, { clipPath: 'inset(0 100% 0 0)' }]
    case 'splitIn':
      return [{ clipPath: 'inset(0 50% 0 50%)' }, { clipPath: 'inset(0 0 0 0)' }]
    case 'motionPath': {
      const points = [
        ...(item.motionPath ?? '').matchAll(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi),
      ].map((match) => Number(match[0]))
      const x = points.at(-2) ?? 0,
        y = points.at(-1) ?? 0
      return [{ translate: '0px 0px' }, { translate: `${x * width}px ${y * height}px` }]
    }
    default:
      return [{ opacity: 1 }, { opacity: 1 }]
  }
}

export function PptxPresentation({
  session,
  start,
  presenter,
  slideIndices,
  rehearse = false,
  onRehearsal,
  onClose,
  triggerRef,
}: {
  session: PptxEditSession
  start: number
  presenter: boolean
  slideIndices?: number[]
  rehearse?: boolean
  onRehearsal?: (result: PptxRehearsalResult) => void
  onClose: () => void
  triggerRef: RefObject<HTMLButtonElement | null>
}) {
  const svgIdPrefix = useId()
  const host = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLDivElement>(null)
  const [selectedIndex, setIndex] = useState(start),
    [step, setStep] = useState(0),
    [error, setError] = useState<string | null>(null)
  const previous = useRef(start)
  const slides = session.slides()
  const order = useMemo(
    () => pptxPlayOrder(slides, start, slideIndices),
    [slides, start, slideIndices],
  )
  const index = order.includes(selectedIndex) ? selectedIndex : (order[0] ?? 0)
  const position = order.indexOf(index)
  const [baseline] = useState(() => ({
    version: session.version(),
    initialIndex: index,
    slidePaths: slides.map((slide) => slide.path),
  }))
  const clock = useRef<PptxRehearsalClock | null>(null)
  const finished = useRef(false)
  const [elapsed, setElapsed] = useState({ page: 0, total: 0 })
  const callbacks = useRef({ onClose, onRehearsal })
  useEffect(() => {
    callbacks.current = { onClose, onRehearsal }
  })
  useEffect(() => {
    if (!rehearse) return
    clock.current = {
      current: baseline.initialIndex,
      enteredAt: performance.now(),
      perPageMs: Array.from({ length: baseline.slidePaths.length }, () => 0),
    }
    const timer = setInterval(() => {
      const active = clock.current
      if (!active) return
      const page = Math.max(0, performance.now() - active.enteredAt)
      setElapsed({
        page: page + (active.perPageMs[active.current] ?? 0),
        total: active.perPageMs.reduce((sum, ms) => sum + ms, 0) + page,
      })
    }, 200)
    return () => {
      clearInterval(timer)
      clock.current = null
    }
    // The show owns one clock; navigation checkpoints it synchronously below.
  }, [rehearse, baseline])
  const finish = () => {
    if (finished.current) return
    finished.current = true
    if (rehearse && clock.current && session.version() === baseline.version) {
      const result = pptxRehearsalVisit(clock.current, -1, performance.now())
      clock.current = null
      callbacks.current.onRehearsal?.({ ...baseline, perPageMs: result.perPageMs })
    }
    callbacks.current.onClose()
  }
  const finishRef = useRef(finish)
  useEffect(() => {
    finishRef.current = finish
  })
  const visit = (nextIndex: number) => {
    if (nextIndex === index) return
    if (rehearse && clock.current)
      clock.current = pptxRehearsalVisit(clock.current, nextIndex, performance.now())
    previous.current = index
    setIndex(nextIndex)
    setStep(0)
  }
  const view = session.view()
  const rendered = useMemo(
    () => renderSlide(view, index, { fitWidthPx: 1000, svgIdPrefix: `${svgIdPrefix}-current` }),
    [view, index, svgIdPrefix],
  )
  const slide = slides[index]!
  const timeline = useMemo(() => getSlideAnimations(slide), [slide])
  const steps = useMemo(() => pptxPlaybackSteps(timeline), [timeline])
  const [playing, setPlaying] = useState(false)
  const move = (direction: number) => {
    const nextIndex = order[position + direction]
    if (nextIndex !== undefined) visit(nextIndex)
    else if (direction > 0 && rehearse) finish()
  }
  const moveRef = useRef(move)
  useEffect(() => {
    moveRef.current = move
  })
  const next = () => {
    if (playing) return
    if (step < steps.length - 1) setStep(step + 1)
    else move(1)
  }
  const nextRef = useRef(next)
  useEffect(() => {
    nextRef.current = next
  })
  useEffect(() => {
    const container = host.current
    const prior = triggerRef.current ?? (document.activeElement as HTMLElement | null)
    const inspector = prior?.closest<HTMLElement>('.mimir-pptx-inspector')
    const editor = prior?.closest<HTMLElement>('.mimir-editor')
    const section = prior?.closest<HTMLElement>('[data-section-key]')?.dataset.sectionKey
    host.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      // Space retains native activation on toolbar controls and links. The
      // canvas and unhandled presentation background use it for the next step.
      if (
        event.key === ' ' &&
        event.target instanceof Element &&
        event.target.closest('button, a, input, textarea, select, [contenteditable="true"]')
      )
        return
      if (event.key === 'Escape') {
        event.preventDefault()
        finishRef.current()
      } else if (['ArrowRight', 'PageDown', ' '].includes(event.key)) {
        event.preventDefault()
        nextRef.current()
      } else if (['ArrowLeft', 'PageUp'].includes(event.key)) {
        event.preventDefault()
        moveRef.current(-1)
      }
    }
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('keydown', key)
      if (document.fullscreenElement === container) void document.exitFullscreen().catch(() => {})
      const focused = document.activeElement
      if (focused && focused !== document.body && !container?.contains(focused)) return
      if (prior?.isConnected && !prior.matches(':disabled')) {
        prior.focus()
        return
      }
      const group = section
        ? [...(editor?.querySelectorAll<HTMLElement>('[data-section-key]') ?? [])].find(
            (node) => node.dataset.sectionKey === section,
          )
        : undefined
      const fallback =
        (inspector?.isConnected &&
          inspector.querySelector<HTMLButtonElement>('button:not(:disabled)')) ||
        group?.querySelector<HTMLButtonElement>('button:not(:disabled)') ||
        editor?.querySelector<HTMLButtonElement>(
          '.mimir-compact-toolbar__tabs [aria-selected="true"]',
        )
      fallback?.focus()
    }
  }, [triggerRef])
  useEffect(() => {
    const node = canvas.current
    if (!node) return
    for (const animation of timeline) {
      if (!entrances.has(animation.effect) || !supported(animation)) continue
      const source = slide.elements.find((element) => Number(element.nvId) === animation.spid)
      const target =
        source &&
        [...node.querySelectorAll<SVGElement>('[data-element-id]')].find(
          (el) => el.dataset.elementId === source.id,
        )
      if (target) target.style.opacity = '0'
    }
    const transition = readSlideTransitionXml(slide.bodySuffix)
    if (transition !== 'none' && node.animate)
      node.animate(
        transition === 'push'
          ? [
              { translate: '12% 0', opacity: 0 },
              { translate: '0 0', opacity: 1 },
            ]
          : [{ opacity: 0 }, { opacity: 1 }],
        { duration: 300 },
      )
    return () => {
      for (const target of node.querySelectorAll<SVGElement>('[data-element-id]')) {
        target.getAnimations?.().forEach((item) => item.cancel())
        target.style.opacity = ''
      }
    }
  }, [slide, timeline])
  useEffect(() => {
    const node = canvas.current
    if (!node) return
    const timers: ReturnType<typeof setTimeout>[] = [],
      animations: Animation[] = []
    const current = steps[step] ?? []
    let end = 0
    for (const { animation, startMs } of current) {
      if (!supported(animation)) continue
      const source = slide.elements.find((element) => Number(element.nvId) === animation.spid)
      const target =
        source &&
        [...node.querySelectorAll<SVGElement>('[data-element-id]')].find(
          (el) => el.dataset.elementId === source.id,
        )
      if (!target) continue
      end = Math.max(end, startMs + Math.max(animation.durationMs, 1))
      timers.push(
        setTimeout(() => {
          target.style.opacity = '1'
          target.style.transformBox = 'fill-box'
          target.style.transformOrigin = 'center'
          if (target.animate)
            animations.push(
              target.animate(
                frames(animation, rendered?.widthPx ?? 1000, rendered?.heightPx ?? 562),
                {
                  duration: Math.max(animation.durationMs, 1),
                  fill: 'forwards',
                  easing: 'ease-out',
                },
              ),
            )
          else if (exits.has(animation.effect)) target.style.opacity = '0'
        }, startMs),
      )
    }
    // Navigation remains available; advancing an animation step waits for its duration.
    const busyTimer = setTimeout(() => setPlaying(current.length > 0), 0)
    const endTimer = setTimeout(() => setPlaying(false), end + 1)
    const advance = readSlideAdvanceTimeXml(slide.bodySuffix)
    if (!rehearse && advance !== null && step === steps.length - 1)
      timers.push(setTimeout(() => moveRef.current(1), Math.max(advance, end)))
    return () => {
      timers.forEach(clearTimeout)
      clearTimeout(busyTimer)
      clearTimeout(endTimer)
      /* Completed effects remain until the slide changes. */ for (const animation of animations)
        if (animation.playState === 'running') animation.finish()
    }
  }, [step, steps, slide, rendered, rehearse])
  const follow = (link: PptxLink) => {
    if (link.kind === 'url') {
      if (/^(https?:|mailto:|tel:)/i.test(link.url))
        window.open(link.url, '_blank', 'noopener,noreferrer')
      return
    }
    if (link.kind === 'slide') {
      if (order.includes(link.slideIndex)) visit(link.slideIndex)
      else setError('目标幻灯片不在本次放映列表中')
      return
    }
    if (link.action === 'endshow') {
      finish()
      return
    }
    const at =
      link.action === 'firstslide'
        ? order[0]!
        : link.action === 'lastslide'
          ? order.at(-1)!
          : link.action === 'lastslideviewed'
            ? previous.current
            : link.action === 'previousslide'
              ? (order[Math.max(0, position - 1)] ?? index)
              : (order[Math.min(order.length - 1, position + 1)] ?? index)
    if (order.includes(at)) visit(at)
  }
  const nextSlide = order[position + 1] ?? -1
  const nextRendered =
    presenter && nextSlide >= 0
      ? renderSlide(view, nextSlide, { fitWidthPx: 360, svgIdPrefix: `${svgIdPrefix}-next` })
      : null
  return (
    <div
      ref={host}
      className="mimir-pptx-presentation"
      role="dialog"
      aria-modal="true"
      aria-label={rehearse ? '排练计时' : presenter ? '演讲者视图' : '幻灯片放映'}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return
        const controls = host.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        )
        const first = controls?.[0],
          last = controls?.[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }}
    >
      <div className="mimir-pptx-presentation__bar">
        <ToolbarButton label={rehearse ? '结束排练' : '退出放映'} onClick={finish}>
          {rehearse ? '结束排练' : '退出'}
        </ToolbarButton>
        <ToolbarButton label="上一张放映幻灯片" disabled={position <= 0} onClick={() => move(-1)}>
          上一页
        </ToolbarButton>
        <ToolbarButton
          label="下一步放映"
          disabled={playing || (!rehearse && step === steps.length - 1 && nextSlide < 0)}
          disabledReason={playing ? '动画正在播放' : '已到最后一页'}
          onClick={next}
        >
          {rehearse && step === steps.length - 1 && nextSlide < 0 ? '完成排练' : '下一步'}
        </ToolbarButton>
        <ToolbarButton
          label="全屏放映"
          onClick={() => {
            if (!host.current?.requestFullscreen) {
              setError('当前环境不支持全屏')
              return
            }
            void host.current.requestFullscreen().catch(() => setError('无法进入全屏'))
          }}
        >
          全屏
        </ToolbarButton>
        <ToolbarNote>
          {position + 1} / {order.length} · 幻灯片 {index + 1} · 动画步骤 {step} /{' '}
          {steps.length - 1}
        </ToolbarNote>
        {rehearse && (
          <span className="mimir-pptx-presentation__clock" role="timer" aria-label="排练用时">
            本页 {pptxShowClock(elapsed.page)} · 总计 {pptxShowClock(elapsed.total)}
          </span>
        )}
        {error && <ToolbarNote>{error}</ToolbarNote>}
      </div>
      <div className={`mimir-pptx-presentation__content${presenter ? ' is-presenter' : ''}`}>
        <div
          ref={canvas}
          className="mimir-pptx-presentation__canvas"
          role="button"
          tabIndex={0}
          aria-label="放映画布，按空格播放下一步"
          onClick={(event) => {
            event.preventDefault()
            const link = (event.target as Element)
              .closest('[data-pptx-link]')
              ?.getAttribute('data-pptx-link')
            if (link) {
              try {
                follow(JSON.parse(link) as PptxLink)
              } catch {
                setError('此对象链接无法打开')
              }
            } else {
              const href = (event.target as Element).closest('a')?.getAttribute('href')
              if (href && /^(https?:|mailto:|tel:)/i.test(href)) follow({ kind: 'url', url: href })
              else next()
            }
          }}
          dangerouslySetInnerHTML={{ __html: rendered?.svg ?? '' }}
        />
        {presenter && (
          <aside className="mimir-pptx-presentation__notes">
            <h2>演讲者备注</h2>
            <p>{session.notes(index) || '本页没有备注'}</p>
            <h2>下一页</h2>
            {nextRendered ? (
              <div dangerouslySetInnerHTML={{ __html: nextRendered.svg }} />
            ) : (
              <p>演示结束</p>
            )}
          </aside>
        )}
      </div>
      <ToolbarNote>
        浏览器放映以近似效果播放常用对象动画与淡入/推进切换；运动路径按终点直线预览。原件预设、逐段动画与媒体命令静态显示，完整效果请在
        PowerPoint 中播放。
      </ToolbarNote>
    </div>
  )
}
