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

/**
 * `?raw` 导入：把文件读成字符串。
 *
 * 这不是 Vite 专有的——Rollup / webpack / esbuild 都有同样的约定，而我们
 * 只用它引一类东西：**要原样塞进别处的脚本**（html 预览的检视脚本
 * `inspector.js`，它必须作为字符串注入 `<iframe>` 的文档里，不能作为模块
 * 被求值）。
 *
 * 类型是 `string` 而不是 `unknown`：那种用法里就是要拼字符串。
 */
declare module '*?raw' {
  const content: string
  export default content
}

/**
 * `?url` 导入：拿到这个文件的**产物 URL**（不是内容）。
 *
 * 用于必须交给运行时按 URL 取的东西——pdf.js 的 worker（浏览器按 URL 启动它）
 * 与它的资产目录。打包器负责把文件复制进产物并给出可访问的路径。
 */
declare module '*?url' {
  const url: string
  export default url
}
