/**
 * 环境声明。
 *
 * ## 为什么自己声明 `*.css` 而不装 vite/client
 *
 * 这个包确实要 import CSS（编辑器样式），但 TypeScript 需要一条「CSS 是可
 * import 的」声明才不会报 TS2882。`vite/client` 里有这条，但装它等于把
 * 整个 Vite 的类型面（`import.meta.env`、`?raw`、`?url`……）也带进来——
 * 而这个包不跑 Vite，那些声明在这里是**假的**：写着 `import.meta.env.DEV`
 * 能通过类型检查，运行时却是 undefined。
 *
 * 所以只声明真正需要的那一条：副作用导入 CSS。类型是 `unknown`——反正
 * 也没人会去读它的默认导出。
 */
declare module '*.css' {
  const css: unknown
  export default css
}
