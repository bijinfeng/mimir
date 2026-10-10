# 会静默出错的地方

这一层特有的坑。渲染层的坑表在 `.trellis/spec/renderer/frontend/index.md`，
跨区域的在[项目坑表](../../project/pitfalls.md)。

| 症状 | 原因 |
|---|---|
| **改了界面代码，浏览器里没反应** | 界面代码不在本包。`apps/web/src` 下现在只有一个入口文件，业务代码全在 `packages/renderer/src`——改错地方时「文件存在、保存成功、页面不变」，没有任何报错（D-103） |
| **`@/` 别名指到了意料之外的地方** | 本包的 `@/` 仍然指本包的 `src/`（只有 index.tsx）。渲染层是**正常的 package 导入**（`@mimir/renderer`），不走别名——给它配别名就等于把那个包当目录用，它挪一个文件就会无声弄坏这里 |
| **中文 PDF 整段空白（不是乱码，也不报错）** | pdf.js 按**原始文件名**去 `public/pdfjs/` 取 cmaps，而那 198 个文件是构建期从 `pdfjs-dist` 拷的。插件漏注册、或 `publicDir` 指错时只有那一个文件能被找到，其余 404——页面照常渲染，文字空白（插件在 `@mimir/renderer/vite-preset`） |
