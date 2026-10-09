# apps/web/AGENTS.md

浏览器部署的区域规则。根目录的 `AGENTS.md` 仍然适用，这里只写这一层特有的。

---

## 这一层只是一个壳

界面与业务代码**全部在 `@mimir/renderer`**（D-103）。这个应用只剩三件东西：

```
src/index.tsx      注入浏览器插槽 → createApp()
index.html         首帧外观脚本 + 挂载点
vite.config.ts     浏览器侧的构建（代理、产物位置）
```

所以**改界面不在这里改**——去 `packages/renderer`，那里有自己的
`AGENTS.md` 与三份子目录规则（编辑器 / 主题 / 文档面板）。

### 浏览器这一侧只说一句「我是浏览器」

```ts
createApp(createRoot(container), {
  router: buildRouter(routeTree),
  platform: { kind: 'browser' },   // 没有桥、没有标题栏，由判别联合表达
})
```

不要改成「从 `window` 探测」：这一侧的事实是确定的，探测只会让「浏览器里
为什么没有标题栏」变成一个需要运行时才能回答的问题。

平台契约是判别联合（`@mimir/renderer` 的 `platform.tsx`，D-104）：
`{ kind: 'browser' }` 这一支里**写 `bridge` 是类型错**，不是「传 undefined」。

### 渲染层需要的构建插件从包里取

```ts
plugins: [
  ...rendererPlugins({
    publicDir: resolve(import.meta.dirname, 'public'),
    generatedRouteTree: resolve(import.meta.dirname, 'src/routeTree.gen.ts'),
    // 浏览器没有平台专属路由，所以不传 extraRoutes
  }),
  react({ compiler: { logDiagnostics: true } }),
]
```

文件路由生成与 pdf.js 资产拷贝都在 `@mimir/renderer/vite-preset`，
桌面端引同一份。**不要在这里再写一遍**——两件事都不报错：路由漏生成是
某一页 404，pdf.js 资产漏拷是中文 PDF 整段空白。

**路由树产物落在本应用**（D-104）：桌面端会多挂几条自己的路由，两个平台
共用一份产物的话，浏览器会拿到一条它永远到不了的路由。`typecheck` 与
`build` 都先跑 `routes:generate`——路由树是构建产物，而 `tsc` 需要它先存在。

`public/pdfjs/` 是构建期从 `pdfjs-dist` 拷过来的产物，**不进 git**
（`.gitignore` 里两个平台各一条）。

---

## 后端代理

`PORT` 来自仓库根的 `.env`（与服务端 `src/env.ts` 同源），**不在这里再写
一遍**。写死 3000 的代价是「改了 `PORT` 只有一半生效」：后端换了端口、代理
还指着旧的，表现为前端所有请求失败，而两个终端都看不出原因。
要覆盖用 `VITE_API_TARGET`。

---

## 会静默出错的地方

这一层特有的坑。渲染层的坑表在 `packages/renderer/AGENTS.md`，
跨区域的在根 `AGENTS.md`。

| 症状 | 原因 |
|---|---|
| **改了界面代码，浏览器里没反应** | 界面代码不在本包。`apps/web/src` 下现在只有一个入口文件，业务代码全在 `packages/renderer/src`——改错地方时「文件存在、保存成功、页面不变」，没有任何报错（D-103） |
| **`@/` 别名指到了意料之外的地方** | 本包的 `@/` 仍然指本包的 `src/`（只有 index.tsx）。渲染层是**正常的 package 导入**（`@mimir/renderer`），不走别名——给它配别名就等于把那个包当目录用，它挪一个文件就会无声弄坏这里 |
| **中文 PDF 整段空白（不是乱码，也不报错）** | pdf.js 按**原始文件名**去 `public/pdfjs/` 取 cmaps，而那 198 个文件是构建期从 `pdfjs-dist` 拷的。插件漏注册、或 `publicDir` 指错时只有那一个文件能被找到，其余 404——页面照常渲染，文字空白（插件在 `@mimir/renderer/vite-preset`） |
