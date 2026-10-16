import type { Fill } from '../../vendor/packages/pptx-engine/src/types.js'

export const PPTX_FILL_TEXTURES = [
  {
    id: 'paper',
    label: '纸张',
    url: new URL('../../vendor/apps/slides/src/renderer/assets/textures/paper.png', import.meta.url)
      .href,
  },
  {
    id: 'canvas',
    label: '画布',
    url: new URL(
      '../../vendor/apps/slides/src/renderer/assets/textures/canvas.png',
      import.meta.url,
    ).href,
  },
  {
    id: 'wood',
    label: '木纹',
    url: new URL('../../vendor/apps/slides/src/renderer/assets/textures/wood.png', import.meta.url)
      .href,
  },
  {
    id: 'marble',
    label: '大理石',
    url: new URL(
      '../../vendor/apps/slides/src/renderer/assets/textures/marble.png',
      import.meta.url,
    ).href,
  },
  {
    id: 'granite',
    label: '花岗岩',
    url: new URL(
      '../../vendor/apps/slides/src/renderer/assets/textures/granite.png',
      import.meta.url,
    ).href,
  },
  {
    id: 'denim',
    label: '牛仔布',
    url: new URL('../../vendor/apps/slides/src/renderer/assets/textures/denim.png', import.meta.url)
      .href,
  },
  {
    id: 'cork',
    label: '软木',
    url: new URL('../../vendor/apps/slides/src/renderer/assets/textures/cork.png', import.meta.url)
      .href,
  },
  {
    id: 'parchment',
    label: '羊皮纸',
    url: new URL(
      '../../vendor/apps/slides/src/renderer/assets/textures/parchment.png',
      import.meta.url,
    ).href,
  },
] as const
export type PptxFillMode = 'none' | 'solid' | 'gradient' | 'texture'
export type PptxFillDraft = {
  mode: PptxFillMode
  color: string
  stops: { pos: number; color: string }[]
  angle: number
  path: '' | 'circle' | 'rect' | 'shape'
  texture: string
}
export function pptxFillDraft(fill: Fill | undefined): PptxFillDraft {
  return {
    mode: !fill || fill.type === 'none' ? 'none' : fill?.type === 'gradient' ? 'gradient' : 'solid',
    color: fill?.type === 'solid' ? fill.color : '#4472C4',
    stops:
      fill?.type === 'gradient'
        ? fill.stops.map((stop) => ({ ...stop }))
        : [
            { pos: 0, color: '#4472C4' },
            { pos: 1, color: '#FFFFFF' },
          ],
    angle: fill?.type === 'gradient' ? (fill.angle ?? 0) / 60000 : 0,
    path: fill?.type === 'gradient' ? (fill.path ?? '') : '',
    texture: 'paper',
  }
}
export function pptxFillSummary(fill: Fill | undefined): string {
  if (!fill || fill.type === 'none') return '无填充'
  if (fill.type === 'solid') return `纯色 ${fill.color.toUpperCase()}`
  if (fill.type === 'gradient')
    return `${fill.path ? '路径' : '线性'}渐变 · ${fill.stops.length} 个色标${fill.path ? '' : ` · ${Math.round((fill.angle ?? 0) / 60000)}°`}`
  if (fill.type === 'image') return `图片 · ${fill.mode === 'tile' ? '平铺' : '拉伸'}`
  return '图案填充'
}
export function pptxFillPreview(draft: PptxFillDraft): string {
  if (draft.mode === 'none') return 'transparent'
  if (draft.mode === 'solid') return draft.color
  if (draft.mode === 'texture')
    return `url("${PPTX_FILL_TEXTURES.find((item) => item.id === draft.texture)?.url}")`
  const stops = draft.stops
    .toSorted((a, b) => a.pos - b.pos)
    .map((stop) => `${stop.color} ${stop.pos * 100}%`)
    .join(', ')
  return draft.path
    ? `radial-gradient(${draft.path === 'circle' ? 'circle' : 'ellipse'}, ${stops})`
    : `linear-gradient(${draft.angle + 90}deg, ${stops})`
}
export function pptxShapeFillOp(
  draft: PptxFillDraft,
  target: { slide: number; el: string },
  textureBytes?: string,
): Record<string, unknown> {
  if (draft.mode === 'texture') {
    if (!textureBytes) throw new Error('纹理尚未载入，请重试')
    return { op: 'setImageFill', target, source: { bytes: textureBytes, ext: 'png' }, tile: true }
  }
  return {
    op: 'setFill',
    target,
    fill:
      draft.mode === 'none'
        ? 'none'
        : draft.mode === 'solid'
          ? draft.color
          : {
              stops: draft.stops.toSorted((a, b) => a.pos - b.pos),
              ...(draft.path ? { path: draft.path } : { angle: Math.round(draft.angle * 60000) }),
            },
  }
}
export function pptxBackgroundFillOps(
  draft: PptxFillDraft,
  slides: number[],
  textureBytes?: string,
): Record<string, unknown>[] {
  return slides.map((slide) => {
    const base = { op: 'setBackground', target: { slide } }
    if (draft.mode === 'texture') {
      if (!textureBytes) throw new Error('纹理尚未载入，请重试')
      return { ...base, kind: 'image', source: { bytes: textureBytes, ext: 'png' }, tile: true }
    }
    if (draft.mode === 'gradient') {
      const stops = draft.stops.toSorted((a, b) => a.pos - b.pos)
      return {
        ...base,
        kind: 'gradient',
        from: stops[0]!.color,
        to: stops.at(-1)!.color,
        angleDeg: draft.angle,
        ...(draft.path ? { radial: true } : {}),
      }
    }
    return {
      ...base,
      kind: draft.mode === 'none' ? 'reset' : 'solid',
      color: draft.color,
    }
  })
}

/** Fixed Ribbon: two tone rows × down/right/diagonal/radial. */
export function pptxGradientPresets(base: string) {
  const mix = (to: number, amount: number) =>
    `#${[1, 3, 5]
      .map((at) =>
        Math.round(Number.parseInt(base.slice(at, at + 2), 16) * (1 - amount) + to * amount)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')}`
  const tones = [
    { label: '浅色', from: mix(255, 0.7), to: base },
    { label: '深色', from: base, to: mix(0, 0.5) },
  ]
  return tones.flatMap((tone) =>
    (
      [
        ['向下', 90, ''],
        ['向右', 0, ''],
        ['对角', 45, ''],
        ['径向', 0, 'circle'],
      ] as const
    ).map(([direction, angle, path]) => ({
      label: `${tone.label}·${direction}`,
      tone: tone.label,
      direction,
      stops: [
        { pos: 0, color: tone.from },
        { pos: 1, color: tone.to },
      ],
      angle,
      path,
    })),
  )
}
