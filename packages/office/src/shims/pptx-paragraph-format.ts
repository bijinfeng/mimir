import type { Paragraph } from '../../vendor/packages/pptx-engine/src/types.js'

/**
 * 段落格式补丁 —— 上游 `ParagraphFormatPatch` 的**等价声明**。
 *
 * ## 为什么要在这里重写一遍
 *
 * 这个接口定义在上游的 `packages/pptx-engine/src/index.ts` 里，而那个文件
 * **不能 vendored**：它 import `zip.ts`（`node:crypto`）与 `media-insert.ts`
 * （`node:zlib`）等一大批写路径模块，整条拉进来浏览器里跑不了（见
 * `../pptx-engine-types.ts` 文件头）。
 *
 * 而 `pptx-ops/src/edit-text.ts`（已 vendored）需要它。所以按上游原样
 * 声明一份，放在 `src/shims/` 下——**这个目录的定位就是「上游依赖的等价替代」**
 * （`i18n.ts` 同理）。
 *
 * ## 漂移会不会静默
 *
 * 不会。vendored 的 `edit-text.ts` 读写这个类型的字段，字段少了或名字变了
 * 会在 `pnpm typecheck` 里立刻报错——那是编译期检查，不依赖运行时行为。
 * 上面那个 import 就是为此：`align` 字段直接引用引擎的 `Paragraph['align']`，
 * 不是自己抄一份字面量联合。
 */
export interface ParagraphFormatPatch {
  /** 'char' 圆点项目符号 / 'number' 编号 / 'blip' 图片符号 / 'none' 显式取消 */
  bullet?: 'char' | 'number' | 'blip' | 'none'
  /** `buAutoNum` 方案（ST_TextAutonumberScheme），配合 bullet: 'number'；单独给出时改已有编号段的方案 */
  numType?: string
  /** 编号的起始值；单独给出时只影响已是编号的段落 */
  startAt?: number
  /** 图片符号已落进包里（媒体路径 + 幻灯片的 rId），配合 bullet: 'blip' */
  bulletBlip?: { mediaRef: string; blipEmbedId: string }
  /** 自定义符号字符（配合 bullet: 'char'；默认 '•'） */
  bulletChar?: string
  /** 符号字体的 `<a:buFont>`（PowerPoint 的符号库把 Wingdings/Courier 码位与字体配对） */
  bulletFont?: string
  /** 符号的悬挂缩进（EMU）；单独给出时调整已有符号的缩进 */
  bulletHangEmu?: number
  /** 符号大小（占文字大小的百分比，100 = 同大）；单独给出时只影响有符号的段落 */
  bulletSizePct?: number
  /** 符号颜色（#RRGGBB）；单独给出时只影响有符号的段落 */
  bulletColor?: string
  /** 行距（%，100 = 单倍） */
  lineSpacingPct?: number
  /** 段前 / 段后距离（pt） */
  spaceBeforePt?: number
  spaceAfterPt?: number
  align?: Paragraph['align']
  /** 段落基础方向（a:pPr rtl）；false 会写出显式的 rtl="0" */
  rtl?: boolean
  /** 缩进层级增量（多级列表的 Tab/⇧Tab；钳在 0..8） */
  indentDelta?: 1 | -1
}
