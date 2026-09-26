/**
 * `@genoffice/pptx-engine` 的**类型桶**（vendored pptx-render 用）。
 *
 * ## 为什么需要它
 *
 * 上游 pptx-render 从引擎的**包名**导入类型（`import type { Slide, Fill } from
 * '@genoffice/pptx-engine'`）。这些导入全是 `import type`，运行时什么都不加载
 * （TS 编译时擦掉），但同步脚本的闭包计算**不区分类型导入**——它会顺着
 * `@genoffice/pptx-engine` 走到引擎的 `index.ts`，把整条**写路径**拉进 vendor：
 * `insert` / `generate` / `media-insert` / `slide-transfer` / `sections` 等
 * 约 10K 行，而且它们带 `node:zlib`、`node:crypto`、`Buffer`（浏览器里跑不了）。
 * 对「只读预览」来说那是纯负重。
 *
 * ## 为什么不直接指向 `types.ts`
 *
 * 大部分类型确实在 `types.ts` 里，但 `ChartModel` 在 `chart.ts`（`types.ts`
 * 只用 `import('./chart').ChartModel` 内联引用，没有 re-export）。指向
 * `types.ts` 会让 `build-chart.ts` 的类型解析失败——而那是**编译期**的错，
 * 同步脚本看不见。
 *
 * 所以这一层把渲染层真正用到的类型**逐项列出**：多一个少一个都会在
 * `pnpm typecheck` 里立刻暴露，不会静默漂移。
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
