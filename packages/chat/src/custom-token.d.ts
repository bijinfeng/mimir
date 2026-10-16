/**
 * 这个包消费的宿主自定义 token。
 *
 * `tintList` / `tintHover` / `inlineCodeFg` / `surfaceContent` 是宿主提供的语义
 * （antd 的 token 体系里没有「列表列的底色」「引用块的悬停底」「行内代码的
 * 字色」），它们的**值**由宿主的 `ThemeProvider`（`customToken.ts`）按外观
 * 填进来——包这边只声明「我用这些」，与宿主那边的 `declare module` 合并。
 *
 * ## 为什么要在这里再声明一遍
 *
 * 这个包的类型检查**看不到宿主的 `customToken.ts`**（它不在自己的 program
 * 里，包也不该 import 宿主源码）。少了这份声明，`token.tintList` 在
 * `createStyles` 里就是类型错误。
 *
 * 这就是「宿主 ↔ 包」的 token 契约：名字与角色写在这里，值在宿主。
 * **改宿主那边的 token 名要同时改这里**（TS 能挡：改了一边另一边就报错，
 * 因为两边声明的是同一个接口的同一批成员）。幸运的是这类改动很少见，
 * 而且 `design.test.ts` 守着这些值的对比度底线。
 *
 * ## 为什么不引更多
 *
 * 只声明**这个包实际使用的角色**。多写等于承诺，而承诺的兑现方在宿主那边——
 * 写下但宿主没填的表现是 `undefined` 传进 CSS（样式静默失效）。
 *
 * ## 这个文件必须是一个**模块**
 *
 * 有顶层 `import` 或 `export` 才算。否则它就是一个**脚本**，而脚本里的
 * `declare module 'antd-style'` 不是「增强」而是**重新声明整个模块**——
 * `antd-style` 的所有导出（`createStyles` 等）都会消失。症状是满屏的
 * `Module '"antd-style"' has no exported member 'createStyles'`，
 * 而它与我们真正想加的自定义 token 一点关系都没有。
 *
 * 用一个**真实的**导出而不是 `export {}`：后者会命中
 * `unicorn(require-module-specifiers)`（空导出列表），而 `export type`
 * 同样能让它成为模块——两全。
 */
export type ChatCustomTokens = 'tintList' | 'tintHover' | 'inlineCodeFg' | 'surfaceContent'

declare module 'antd-style' {
  export interface CustomToken {
    /** Main workspace surface; independent from card/input surfaces in dark mode. */
    surfaceContent: string
    /** 第四层表面：引用块 / 出处条的底 */
    tintList: string
    /** 引用块悬停时的底（与 tintList 拉开 ≥1.08:1，宿主的守门测试管着） */
    tintHover: string
    /** 行内代码的字色。配 `colorFillSecondary` 底 */
    inlineCodeFg: string
  }
}
