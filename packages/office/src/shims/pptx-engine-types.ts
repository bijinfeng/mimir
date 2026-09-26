/**
 * `@genoffice/pptx-engine` 的**门面**（vendored pptx 代码用）。
 *
 * ## 为什么需要它
 *
 * 上游 pptx-render / pptx-ops 从引擎的**包名**导入。这些导入分两类：
 *
 *   - **类型**（`import type { Slide, Fill } …`）：运行时什么都不加载
 *   - **值**（`import { encodeRunLink } …`）：运行时真的要用
 *
 * 但同步脚本的闭包计算**不区分类型导入**——它会顺着 `@genoffice/pptx-engine`
 * 走到引擎的 `index.ts`，把整条**写路径**拉进 vendor：`insert` / `generate` /
 * `media-insert` / `slide-transfer` / `sections` 等约 10K 行，而且它们带
 * `node:zlib`、`node:crypto`、`Buffer`（浏览器里跑不了）。
 *
 * 所以这个文件替掉那个包名：类型逐项 re-export，值**在这里实现等价版本**。
 *
 * ## 值那一半的边界
 *
 * 值导入只有 `encodeRunLink`（`pptx-ops/src/edit-text.ts` 用它把编辑器回传的
 * 链接编码成 `TextRun.hyperlink` 的字符串形式）。它是个纯函数、三行，
 * 依赖只在上游 `hyperlink.ts` 里，而**那个文件本身是重闭包**（import
 * `parse.ts` / `index.ts` / `resource-cleanup.ts`…，46 个文件 24.6K 行）。
 * 为一个三行纯函数拉进它不划算，所以在这里复刻——并写一条测试锁住它与
 * 上游语义一致（`pptx-save.test.ts` 的「链接编码」）。
 *
 * 复刻的判据是 `hyperlink.ts` 的两个函数（`encodeRunLink` / `decodeRunLink`）
 * 与 `TextRun.hyperlink` 的注释；`decodeRunLink` 对应物在渲染侧
 * （`pptx-svg.ts` 判断 `slide:` 前缀时就地解）。
 */

export type {
  ArrowEnd,
  ChartElement,
  EmuRect,
  Fill,
  GroupElement,
  Paragraph,
  PassthroughElement,
  PictureElement,
  ShadowEffect,
  Slide,
  SlideDeck,
  SlideElement,
  SlideSize,
  Stroke,
  TableElement,
  TextBody,
  TextElement,
  TextRun,
  Transform,
} from '../../vendor/packages/pptx-engine/src/types.js'

/** `ChartModel` 在 chart.ts，不在 types.ts（见文件头） */
export type { ChartModel } from '../../vendor/packages/pptx-engine/src/chart.js'

/** 段落格式补丁（`pptx-ops/src/edit-text.ts` 用它收格式改动） */
export type { ParagraphFormatPatch } from './pptx-paragraph-format.js'

/** 命名动作（上一张/下一张…）。`pptx-ops` 的 types.ts 要用 */
export type { NamedAction } from '../../vendor/packages/pptx-engine/src/named-action.js'

/**
 * 上游 `hyperlink.ts` 的 `LinkTarget` / `encodeRunLink` 的等价实现。
 *
 * 编码方式（`TextRun.hyperlink` 的约定）：
 *   `slide:<序号>`  → 片内跳转（序号是**从 0 开始**的 sldIdLst 下标）
 *   `action:<名>`   → 具名动作（上一张等）
 *   其余            → 外部 URL
 */
export type LinkTarget =
  | { kind: 'url'; url: string }
  | { kind: 'slide'; slideIndex: number }
  | { kind: 'action'; action: string }

export function encodeRunLink(target: LinkTarget): string {
  if (target.kind === 'slide') return `slide:${target.slideIndex}`
  if (target.kind === 'action') return `action:${target.action}`
  return target.url
}

/** 上游 `decodeRunLink` 的等价实现（渲染侧也用同一套前缀判断） */
export function decodeRunLink(value: string): LinkTarget | null {
  const slide = /^slide:(\d+)$/.exec(value)
  if (slide) return { kind: 'slide', slideIndex: Number(slide[1]) }
  const action = /^action:(\w+)$/.exec(value)
  if (action) return { kind: 'action', action: action[1]! }
  return value ? { kind: 'url', url: value } : null
}
