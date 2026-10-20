# 浏览器壳规则

浏览器部署的区域规则。[项目规则](../../project/rules.md)与[共享渲染层](../../renderer/frontend/index.md)也适用。

---

## 这一层只是一个壳

界面与业务代码**全部在 `@mimir/renderer`**（D-103）。这个应用只剩三件东西：

```
src/index.tsx      注入浏览器插槽 → createApp()
index.html         首帧外观脚本 + 挂载点
vite.config.ts     浏览器侧的构建（代理、产物位置）
```

所以**改界面不在这里改**——去 `packages/renderer`，那里有自己的
[规范入口](../../renderer/frontend/index.md)与三份子目录规则（编辑器 / 主题 / 文档面板）。

### 浏览器这一侧只说一句「我是浏览器」

```ts
createApp(createRoot(container), {
  router: buildRouter(routeTree, import.meta.env.BASE_URL, { publicHome: true }),
  platform: { kind: 'browser' },   // 没有桥、没有标题栏，由判别联合表达
})
```

`publicHome` 只声明该部署展示公开产品首页；认证例外与默认桌面行为见[渲染层路由合同](../../renderer/frontend/conventions.md#公开首页与路由守卫)。

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
