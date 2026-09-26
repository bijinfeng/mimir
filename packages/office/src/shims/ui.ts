/**
 * `@genoffice/ui` 的等价 shim。
 *
 * ## 为什么整个 ui 包不 vendor
 *
 * 上游的 `packages/ui` 是它的**办公壳 UI kit**：26 个文件、13 个 React 组件
 * （Dropdown / FindPanel / CropDialog / 图片查看器…）+ CSS token。mimir 不用
 * 那些组件——界面由自己的统一外壳（`src/shell/`）承担，这是 D-054 的决定。
 *
 * 但 vendored 代码里确实有几处引用它，**全部是「数据」或「类型」**，没有一处
 * 需要它的组件：
 *
 * | 引用点 | 要什么 | 这里怎么给 |
 * |---|---|---|
 * | `editor/protected-render.ts` | `WORDART_PRESETS` / `wordArtStrokePx`（纯数据 + 纯函数） | 从 `wordart-presets.js` 重导出（那一份是从上游**原样复制**的） |
 * | `source/SourceEditor.tsx`、`source/find-target.ts`、`source/cm-find.ts` | `FindTarget` / `FindOptions`（**纯类型**） | 在下面**逐字重声明** |
 *
 * ## 为什么类型要重声明而不是「反正运行时不需要」
 *
 * 那三个文件写的是 `import type { … } from '@genoffice/ui'`——类型在运行时被
 * 擦除，所以**不写这份声明也能跑**。但 TypeScript 会报「找不到模块」，而
 * vendored 文件的 `@ts-nocheck` 横幅只关掉了**它们自己**的检查：闭包自检与
 * `src/` 的类型检查仍会走到这条导入上。更实际的理由是：这份声明是**唯一**
 * 记录「我们到底借了 ui 包的哪两样东西」的地方——不写下来，下一个人只能靠
 * 全仓 grep 猜。
 *
 * 声明与上游 `packages/ui/src/find-panel.tsx` / `find-text.ts` **逐字一致**。
 * 上游改了字段名，这里要跟着改——`--check` 会报出 vendor 里的导入点变了，
 * 但那不覆盖这份 shim，所以这条提醒留在注释里。
 */

export * from './wordart-presets.js'

/* ── 以下逐字来自 packages/ui/src/find-text.ts ──────────────────── */

export interface FindOptions {
  matchCase: boolean
  wholeWord: boolean
}

/* ── 以下逐字来自 packages/ui/src/find-panel.tsx ────────────────── */

/**
 * 查找面板对编辑器的适配接口。
 *
 * 上游的 `FindPanel`（React 组件）调它；mimir **不用那个面板**（我们的查找
 * 走浏览器自带的 Ctrl+F，见 `HtmlEditor` 的说明），但 `cmFindTarget` 生成的
 * 对象要实现这个接口——所以类型仍然需要。
 */
export interface FindTarget {
  readonly editable: boolean
  /** rescan and repaint the highlights; returns the match count */
  search(query: string, opts: FindOptions, activeIndex: number): number
  /** move the active highlight to `index` and scroll it into view */
  activate(index: number): void
  replaceOne(index: number, replacement: string): void
  replaceAll(replacement: string): void
  /** drop every highlight */
  clear(): void
  /** fires after any document change so the panel can rescan */
  onDocChanged(listener: () => void): () => void
}
