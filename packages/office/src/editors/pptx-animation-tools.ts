import { matchesElementRef } from '../../vendor/packages/pptx-engine/src/identity.js'
import {
  elementSpid,
  getSlideAnimations,
  type AnimEffectKind,
  type SlideAnimation,
} from '../../vendor/packages/pptx-engine/src/animation.js'
import type { Slide, SlideElement } from '../../vendor/packages/pptx-engine/src/types.js'

export const PPTX_ANIMATION_LABELS: Record<AnimEffectKind, string> = {
  appear: '出现',
  fade: '淡入',
  flyIn: '飞入',
  wipe: '擦入',
  wipeDown: '向下擦入',
  splitIn: '劈裂进入',
  bounce: '弹跳',
  flipIn: '翻转进入',
  zoom: '缩放进入',
  pulse: '脉冲',
  spin: '旋转',
  grow: '放大',
  teeter: '摇摆',
  disappear: '消失',
  fadeOut: '淡出',
  flyOut: '飞出',
  wipeOut: '擦出',
  zoomOut: '缩放退出',
  motionPath: '运动路径',
  shrink: '缩小退出',
  mediaPlay: '媒体播放',
  mediaPause: '媒体暂停',
  mediaStop: '媒体停止',
}
export const PPTX_MOTION_PRESETS = [
  { key: 'right', label: '向右直线', path: 'M 0 0 L 0.25 0' },
  { key: 'down', label: '向下直线', path: 'M 0 0 L 0 0.25' },
  { key: 'diagonal', label: '对角线', path: 'M 0 0 L 0.25 0.25' },
  {
    key: 'circle',
    label: '圆形',
    path: 'M 0 0 C 0.069 0 0.125 0.056 0.125 0.125 C 0.125 0.194 0.069 0.25 0 0.25 C -0.069 0.25 -0.125 0.194 -0.125 0.125 C -0.125 0.056 -0.069 0 0 0 Z',
  },
  { key: 'zigzag', label: '折线', path: 'M 0 0 L 0.12 -0.12 L 0.24 0.12 L 0.36 0' },
] as const
export function pptxAnimationDefaultDuration(effect: AnimEffectKind): number {
  if (effect === 'appear' || effect === 'disappear' || effect.startsWith('media')) return 0
  if (['spin', 'grow', 'bounce', 'motionPath'].includes(effect)) return 2000
  return effect === 'pulse' || effect === 'teeter' ? 1000 : 500
}
export function pptxAnimationElement(
  elements: readonly SlideElement[],
  id: string,
): SlideElement | undefined {
  for (const element of elements) {
    if (matchesElementRef(element, id)) return element
    if (element.type === 'group') {
      const found = pptxAnimationElement(element.children, id)
      if (found) return found
    }
  }
  return undefined
}
/** Source model paragraphs; never count the renderer's visual wrapping. */
export function pptxAnimationParagraphCount(element: SlideElement | undefined): number {
  return element && (element.type === 'text' || element.type === 'shape')
    ? (element.text?.paragraphs.length ?? 0)
    : 0
}
export interface PptxAnimationChoice {
  effect: AnimEffectKind
  byParagraph?: boolean
  trigger?: SlideAnimation['trigger']
  durationMs?: number
  delayMs?: number
  direction?: SlideAnimation['direction']
  motionPath?: string
  paragraph?: number
}
export function pptxAnimationItems(
  slide: Slide,
  id: string,
  choice: PptxAnimationChoice,
): SlideAnimation[] {
  const element = pptxAnimationElement(slide.elements, id)
  if (!element) return []
  const spid = elementSpid(element)
  if (spid == null) return []
  const base: SlideAnimation = {
    spid,
    effect: choice.effect,
    trigger: choice.trigger ?? 'onClick',
    durationMs: choice.durationMs ?? pptxAnimationDefaultDuration(choice.effect),
    delayMs: choice.delayMs ?? 0,
    ...(choice.direction ? { direction: choice.direction } : {}),
    ...(choice.motionPath ? { motionPath: choice.motionPath } : {}),
    ...(choice.paragraph !== undefined ? { paragraph: choice.paragraph } : {}),
  }
  const n =
    choice.byParagraph && !choice.effect.startsWith('media')
      ? pptxAnimationParagraphCount(element)
      : 0
  return n > 1 ? Array.from({ length: n }, (_, paragraph) => ({ ...base, paragraph })) : [base]
}
/** One atomic native transaction; remove only selected shape, retaining all sibling/preset timing. */
export function pptxAnimationOps(
  slide: Slide,
  target: { slide: number; el: string },
  choice: PptxAnimationChoice | 'none',
  replace: boolean,
): Record<string, unknown>[] {
  const ops: Record<string, unknown>[] = replace ? [{ op: 'removeAnimation', target }] : []
  if (choice === 'none') return ops
  return [
    ...ops,
    ...pptxAnimationItems(slide, target.el, choice).map(({ spid: _spid, ...item }) =>
      Object.assign({ op: 'addAnimation', target }, item),
    ),
  ]
}
export function pptxSelectedAnimations(slide: Slide, id: string): SlideAnimation[] {
  const element = pptxAnimationElement(slide.elements, id)
  const spid = element && elementSpid(element)
  return spid == null ? [] : getSlideAnimations(slide).filter((item) => item.spid === spid)
}
