import { useEffect, useRef, type RefObject } from 'react'
import {
  getSlideAnimations,
  elementSpid,
  type SlideAnimation,
} from '../../vendor/packages/pptx-engine/src/animation.js'
import type { Slide, SlideElement } from '../../vendor/packages/pptx-engine/src/types.js'

export interface PptxAnimationPreviewRequest {
  token: number
  items?: SlideAnimation[]
}
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
/** Same M/L/C/Z subset as pinned GenOffice animation-play; cubic paths are sampled, not collapsed to their endpoint. */
export function pptxMotionPoints(path: string): { x: number; y: number }[] {
  const tokens = path.match(/[MLCZ]|[-+]?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/gi) ?? []
  const points: { x: number; y: number }[] = []
  let i = 0,
    x = 0,
    y = 0,
    sx = 0,
    sy = 0,
    command = ''
  const number = () => Number(tokens[i++])
  while (i < tokens.length) {
    if (/^[MLCZ]$/i.test(tokens[i]!)) command = tokens[i++]!.toUpperCase()
    if (command === 'Z') {
      points.push({ x: sx, y: sy })
      x = sx
      y = sy
      command = ''
      continue
    }
    const count = command === 'C' ? 6 : command === 'M' || command === 'L' ? 2 : 0
    if (
      !count ||
      i + count > tokens.length ||
      tokens.slice(i, i + count).some((token) => !Number.isFinite(Number(token)))
    ) {
      i++
      continue
    }
    if (command === 'C') {
      const x1 = number(),
        y1 = number(),
        x2 = number(),
        y2 = number(),
        ex = number(),
        ey = number()
      for (let j = 1; j <= 24; j++) {
        const t = j / 24,
          u = 1 - t
        points.push({
          x: u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * ex,
          y: u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * ey,
        })
      }
      x = ex
      y = ey
    } else {
      x = number()
      y = number()
      points.push({ x, y })
      if (command === 'M') {
        sx = x
        sy = y
        command = 'L'
      }
    }
  }
  return points.length ? points : [{ x: 0, y: 0 }]
}
export function pptxAnimationFrames(
  item: SlideAnimation,
  width: number,
  height: number,
  reduced = false,
): Keyframe[] {
  if (reduced) return [{ opacity: entrances.has(item.effect) ? 0.6 : 1 }, { opacity: 1 }]
  const side = item.direction ?? 'bottom'
  const offset =
    side === 'left'
      ? `${-width}px 0px`
      : side === 'right'
        ? `${width}px 0px`
        : side === 'top'
          ? `0px ${-height}px`
          : `0px ${height}px`
  const wipe =
    side === 'left'
      ? '0 100% 0 0'
      : side === 'right'
        ? '0 0 0 100%'
        : side === 'top'
          ? '0 0 100% 0'
          : '100% 0 0 0'
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
    case 'wipe':
      return [{ clipPath: `inset(${wipe})` }, { clipPath: 'inset(0 0 0 0)' }]
    case 'wipeDown':
      return [{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0 0)' }]
    case 'wipeOut':
      return [{ clipPath: 'inset(0 0 0 0)' }, { clipPath: `inset(${wipe})` }]
    case 'splitIn':
      return [{ clipPath: 'inset(50% 0 50% 0)' }, { clipPath: 'inset(0 0 0 0)' }]
    case 'zoom':
      return [
        { scale: '0.01', opacity: 0 },
        { scale: '1', opacity: 1 },
      ]
    case 'zoomOut':
      return [
        { scale: '1', opacity: 1 },
        { scale: '0.01', opacity: 0 },
      ]
    case 'shrink':
      return [
        { scale: '1', rotate: '0deg', opacity: 1 },
        { scale: '0.01', rotate: '-90deg', opacity: 0 },
      ]
    case 'pulse':
      return [{ scale: '1' }, { scale: '1.08', offset: 0.5 }, { scale: '1' }]
    case 'spin':
      return [{ rotate: '0deg' }, { rotate: '360deg' }]
    case 'grow':
      return [{ scale: '1' }, { scale: '1.5' }]
    case 'teeter':
      return [
        { rotate: '0deg' },
        { rotate: '-8deg', offset: 0.25 },
        { rotate: '5deg', offset: 0.65 },
        { rotate: '0deg' },
      ]
    case 'bounce':
      return [
        { translate: `0px ${-height * 0.25}px` },
        { translate: '0px 0px', offset: 0.55 },
        { translate: `0px ${-height * 0.06}px`, offset: 0.72 },
        { translate: '0px 0px', offset: 0.88 },
        { translate: `0px ${-height * 0.015}px`, offset: 0.94 },
        { translate: '0px 0px' },
      ]
    case 'flipIn':
      return [
        { scale: '0.01 1', opacity: 0 },
        { scale: '1 1', opacity: 1 },
      ]
    case 'motionPath': {
      const points = pptxMotionPoints(item.motionPath ?? 'M 0 0 L 0.25 0'),
        first = points[0]!
      const lengths = [0]
      for (let i = 1; i < points.length; i++)
        lengths.push(
          lengths[i - 1]! +
            Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y),
        )
      const length = lengths.at(-1)!
      return points.map((point, i) => ({
        translate: `${(point.x - first.x) * width}px ${(point.y - first.y) * height}px`,
        offset: length ? lengths[i]! / length : i / Math.max(1, points.length - 1),
      }))
    }
    default:
      return [{ opacity: 1 }, { opacity: 1 }]
  }
}
export function pptxPreviewSchedule(items: SlideAnimation[]) {
  let stepBase = 0,
    previousStart = 0,
    previousEnd = 0,
    stepEnd = 0
  return items.map((item, index) => {
    if (item.trigger === 'onClick') {
      if (index > 0) stepBase = stepEnd + 180
      previousStart = 0
      previousEnd = 0
    }
    const start =
      (item.trigger === 'afterPrev'
        ? previousEnd
        : item.trigger === 'withPrev'
          ? previousStart
          : 0) + item.delayMs
    previousStart = start
    previousEnd = start + Math.max(1, item.durationMs)
    stepEnd = Math.max(stepEnd, stepBase + previousEnd)
    return { item, startMs: stepBase + start }
  })
}
function elementForSpid(elements: readonly SlideElement[], spid: number): SlideElement | undefined {
  for (const element of elements) {
    if (elementSpid(element) === spid) return element
    if (element.type === 'group') {
      const found = elementForSpid(element.children, spid)
      if (found) return found
    }
  }
  return undefined
}
/** Transient playback on the existing editing SVG. Cleanup restores the untouched author DOM. */
export function PptxAnimationPreview({
  host,
  slide,
  version,
  selectionKey,
  request,
  onEnd,
}: {
  host: RefObject<HTMLElement | null>
  slide: Slide
  version: number
  selectionKey: string
  request: PptxAnimationPreviewRequest | null
  onEnd?: () => void
}) {
  const bound = useRef<{
    request: PptxAnimationPreviewRequest
    path: string
    version: number
    selectionKey: string
  } | null>(null)
  const callback = useRef(onEnd)
  useEffect(() => {
    callback.current = onEnd
  })
  useEffect(() => {
    const container = host.current
    if (!container || !request) {
      bound.current = null
      return
    }
    if (
      bound.current?.request === request &&
      (bound.current.path !== slide.path ||
        bound.current.version !== version ||
        bound.current.selectionKey !== selectionKey)
    ) {
      callback.current?.()
      return
    }
    bound.current = { request, path: slide.path, version, selectionKey }
    const svg = container.querySelector('svg')
    if (!svg) return
    const box = svg.getAttribute('viewBox')?.split(/[ ,]+/).map(Number)
    const width = box?.[2] || Number(svg.getAttribute('width')) || 1000,
      height = box?.[3] || Number(svg.getAttribute('height')) || 562.5
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const animations: Animation[] = [],
      styles = new Map<SVGElement, string | null>()
    const schedule = pptxPreviewSchedule(request.items ?? getSlideAnimations(slide))
    const starts: ReturnType<typeof setTimeout>[] = []
    const opacity = new Map<SVGElement, string>()
    let stopped = false,
      end = 0
    for (const { item, startMs } of schedule) {
      if (item.effect.startsWith('media')) continue
      const source = elementForSpid(slide.elements, item.spid)
      const shape =
        source &&
        [...container.querySelectorAll<SVGElement>('[data-element-id]')].find(
          (node) => node.dataset.elementId === source.id,
        )
      const target =
        item.paragraph === undefined
          ? shape
          : shape?.querySelector<SVGElement>(`[data-pptx-paragraph="${item.paragraph}"]`)
      if (!target?.animate) continue
      if (!styles.has(target)) {
        styles.set(target, target.getAttribute('style'))
        opacity.set(target, target.style.opacity)
        if (entrances.has(item.effect)) target.style.opacity = '0'
      }
      target.style.transformBox = 'fill-box'
      target.style.transformOrigin = 'center'
      const duration = reduced ? 100 : Math.max(1, item.durationMs),
        delay = reduced ? Math.min(startMs, 300) : startMs
      const play = () => {
        if (stopped) return
        const authorOpacity = opacity.get(target)!
        if (authorOpacity) target.style.opacity = authorOpacity
        else target.style.removeProperty('opacity')
        animations.push(
          target.animate(pptxAnimationFrames(item, width, height, reduced), {
            duration,
            fill: 'forwards',
            easing: item.effect === 'motionPath' ? 'linear' : 'ease-out',
          }),
        )
      }
      // Future effects must not apply their backwards fill over an earlier effect on the same shape.
      if (delay === 0) play()
      else starts.push(setTimeout(play, delay))
      end = Math.max(end, delay + duration)
    }
    const restore = () => {
      if (stopped) return
      stopped = true
      starts.forEach(clearTimeout)
      animations.forEach((animation) => animation.cancel())
      styles.forEach((style, node) => {
        if (style === null) node.removeAttribute('style')
        else node.setAttribute('style', style)
      })
    }
    const stop = () => {
      if (stopped) return
      restore()
      callback.current?.()
    }
    const timer = setTimeout(stop, end + 150)
    const escape = (event: KeyboardEvent) => {
      if (!stopped && event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault()
        event.stopPropagation()
        stop()
      }
    }
    container.addEventListener('pointerdown', stop)
    window.addEventListener('keydown', escape, true)
    window.addEventListener('blur', stop)
    return () => {
      clearTimeout(timer)
      container.removeEventListener('pointerdown', stop)
      window.removeEventListener('keydown', escape, true)
      window.removeEventListener('blur', stop)
      restore()
    }
  }, [host, slide, version, selectionKey, request])
  return null
}
