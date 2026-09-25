/**
 * WordArt 预设（`@genoffice/ui` 的等价 shim）。
 *
 * ## 为什么在这里而不 vendor 整个 ui 包
 *
 * 上游把这个文件放在 UI kit（`packages/ui`）里，因为对它而言这是「插入 →
 * WordArt 画廊」的界面素材。但 mimir 只用到**数据与两个纯函数**：渲染 docx 里
 * 已有的 WordArt 时要拿预设的配色与描边宽度，**不需要画廊 UI**。
 *
 * 把整个 ui 包拉进来（26 个文件、13 个 React 组件）只为这两个符号，代价是
 * 无谓的依赖面与 React Compiler 告警。所以整个文件复制过来当 shim——
 * 它是纯数据 + 纯计算，没有 DOM、没有 React，等价替换是安全的。
 *
 * 同步时的 `REWRITES` 把 `@genoffice/ui` 的导入指到这里。
 *
 * ## 原文件说明（上游）
 *
 * 12 presets modeled on the PowerPoint WordArt gallery: solid bold / white text
 * with colored stroke / colored text with dark stroke / black-gold, metallic
 * silver, etc. (stroke widths in EMU: 12700 = 1pt, 19050 = 1.5pt).
 */
export interface WordArtPreset {
  id: string
  nameKey: string
  fill: string
  outline?: { color: string; widthEmu: number }
  bold?: boolean
  italic?: boolean
}

export const WORDART_PRESETS: WordArtPreset[] = [
  // Solid bold series
  { id: 'blue', nameKey: 'ribbonWordArtPresetBlue', fill: '#4472C4', bold: true },
  { id: 'gold', nameKey: 'ribbonWordArtPresetGold', fill: '#FFC000', bold: true },
  { id: 'red', nameKey: 'ribbonWordArtPresetRed', fill: '#C00000', bold: true },
  { id: 'purple', nameKey: 'ribbonWordArtPresetPurple', fill: '#7030A0', bold: true },
  {
    id: 'green-italic',
    nameKey: 'ribbonWordArtPresetGreenItalic',
    fill: '#70AD47',
    bold: true,
    italic: true,
  },
  // White text + colored stroke (outline text effect)
  {
    id: 'white-orange',
    nameKey: 'ribbonWordArtPresetWhiteOrange',
    fill: '#FFFFFF',
    outline: { color: '#ED7D31', widthEmu: 19050 },
    bold: true,
  },
  {
    id: 'white-red',
    nameKey: 'ribbonWordArtPresetWhiteRed',
    fill: '#FFFFFF',
    outline: { color: '#C00000', widthEmu: 19050 },
    bold: true,
  },
  // Colored text + dark stroke (3D feel)
  {
    id: 'gold-brown',
    nameKey: 'ribbonWordArtPresetGoldBrown',
    fill: '#FFC000',
    outline: { color: '#7F5F00', widthEmu: 12700 },
    bold: true,
  },
  {
    id: 'sky-navy',
    nameKey: 'ribbonWordArtPresetSkyNavy',
    fill: '#00B0F0',
    outline: { color: '#1F4E79', widthEmu: 12700 },
    bold: true,
  },
  // Dark text + bright stroke
  {
    id: 'navy-white',
    nameKey: 'ribbonWordArtPresetNavyWhite',
    fill: '#1F3864',
    outline: { color: '#FFFFFF', widthEmu: 12700 },
    bold: true,
  },
  {
    id: 'black-gold',
    nameKey: 'ribbonWordArtPresetBlackGold',
    fill: '#0D0D0D',
    outline: { color: '#FFC000', widthEmu: 19050 },
    bold: true,
  },
  // Metallic silver
  {
    id: 'silver-dark',
    nameKey: 'ribbonWordArtPresetSilverDark',
    fill: '#D9D9D9',
    outline: { color: '#595959', widthEmu: 12700 },
    bold: true,
  },
]

/** Gallery preview stroke: EMU line width → CSS px (12700 EMU = 1pt = 4/3 px). */
export function wordArtStrokePx(widthEmu: number): number {
  return Math.round((widthEmu / 12700) * (4 / 3) * 100) / 100
}

/**
 * Solid-color approximation for targets that cannot express the stroke
 * (e.g. the docx run color): light fills would be invisible on a white page,
 * so fall back to the outline color instead.
 */
export function wordArtSolidColor(preset: WordArtPreset): string {
  if (!preset.outline) return preset.fill
  const hex = preset.fill.replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.8 ? preset.outline.color : preset.fill
}
