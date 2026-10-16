import type { Slide } from '../../vendor/packages/pptx-engine/src/types.js'

export interface PptxShowRequest {
  start: number
  slideIndices?: number[]
  rehearse?: boolean
  presenter?: boolean
}
export interface PptxRehearsalResult {
  version: number
  slidePaths: string[]
  perPageMs: number[]
}
export interface PptxCustomShow {
  id: string
  name: string
  /** Archive paths survive ordinary slide reordering. Local to this browser/document. */
  slidePaths: string[]
}
export function pptxPlayOrder(
  slides: readonly Pick<Slide, 'bodyPrefix'>[],
  start: number,
  subset?: readonly number[],
): number[] {
  if (!Number.isInteger(start) || !slides[start]) return []
  const order = subset?.length ? subset : slides.map((_, index) => index)
  const valid = order.filter(
    (index) =>
      Number.isInteger(index) &&
      slides[index] &&
      (index === start || !/\bshow="0"/.test(slides[index]!.bodyPrefix)),
  )
  return valid.length ? [...new Set(valid)] : [start]
}
export function pptxShowIndices(show: PptxCustomShow, slides: readonly Pick<Slide, 'path'>[]) {
  return show.slidePaths
    .map((path) => slides.findIndex((slide) => slide.path === path))
    .filter((index) => index >= 0)
}
export function pptxReadCustomShows(value: string | null): PptxCustomShow[] {
  try {
    const parsed: unknown = JSON.parse(value ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.slice(0, 100).flatMap((item: unknown) => {
      if (!item || typeof item !== 'object') return []
      const { id, name, slidePaths } = item as Record<string, unknown>
      if (
        typeof id !== 'string' ||
        typeof name !== 'string' ||
        !name.trim() ||
        !Array.isArray(slidePaths) ||
        !slidePaths.every((path) => typeof path === 'string')
      )
        return []
      return [{ id, name: name.slice(0, 80), slidePaths: [...new Set(slidePaths)].slice(0, 1000) }]
    })
  } catch {
    return []
  }
}
export interface PptxRehearsalClock {
  current: number
  enteredAt: number
  perPageMs: number[]
}
export function pptxRehearsalVisit(clock: PptxRehearsalClock, next: number, now: number) {
  const perPageMs = clock.perPageMs.slice()
  if (perPageMs[clock.current] !== undefined)
    perPageMs[clock.current]! += Math.max(0, now - clock.enteredAt)
  return { current: next, enteredAt: now, perPageMs }
}
export function pptxRehearsalOps(result: PptxRehearsalResult) {
  return result.perPageMs.flatMap((ms, index) =>
    Number.isFinite(ms) && ms > 0
      ? [
          {
            op: 'setAdvanceTime',
            target: { slide: index },
            ms: Math.min(4294967295, Math.max(1000, Math.round(ms / 1000) * 1000)),
          },
        ]
      : [],
  )
}
export function pptxShowClock(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
