# 桌面端规则

桌面端（Electron 载体）的区域规则。[项目规则](../../project/rules.md)仍然适用，这里只写
这一层特有的。

---

## 这一层的结构

**三段源码，由 electron-vite 统一构建**（D-103）：

```
apps/desktop/
├── electron.vite.config.ts   三段的构建编排（main / preload / renderer）
├── src/
│   ├── main/                 主进程
│   │   ├── index.ts          窗口、两种模式、cookie 注入、启动窗/重启接线
│   │   ├── sidecar.ts        本地 mode 的 runtime 子进程：配置、fork、IPC、日志、关停
│   │   ├── runtime-manifest.ts 读产物 manifest 并校验 required/平台/版本/shellAbi
│   │   ├── cloud.ts          云端模式的地址处理：归一化与探活（不依赖 Electron，可单测）
│   │   └── config.ts         模式选择的持久化（<userData>/desktop-config.json，临时文件 + rename）
│   ├── preload/index.ts      沙箱化 preload：只暴露宿主↔载体的握手契约（packages/shared/src/desktop.ts）
│   └── renderer/             渲染进程——**只有载体独有的**。三个 HTML 入口 + boot.html
│       ├── index.html        主应用的入口（electron-vite 的约定位置）
│       ├── index.tsx         注入桌面插槽 → createApp()
│       ├── setup.html        首启选择页的入口（D-100）
│       ├── setup.tsx         选择页挂载（不注入插槽——它自己就是桌面专属的）
│       ├── update.html       独立软件更新窗口入口（专用 preload，无知识库宿主）
│       ├── update/           更新详情组件与样式
│       ├── setup/            选择页的组件与样式
│       ├── components/       自绘标题栏（D-094）、窗口控件（两处共用）
│       └── lib/              桌面桥的取值（window.mimirDesktop）
└── scripts/                  图标生成（D-091）、启动自检（smoke.mjs）
```

**本地宿主是独立 sidecar 进程**（D-114）：主进程只写 0600 配置、fork runtime
CLI、等 IPC ready/校验版本、开窗；不再在 Electron 主进程里 import 服务端。
`host.ts`/`artifacts.ts` 已删除。

**界面与业务代码不在这里**：它们在 `@mimir/renderer`，与浏览器部署共用一份
源码。这一侧只给两样东西（D-104）：

```ts
createApp(createRoot(container), {
  router: buildRouter(routeTree),        // 基础路由 + /client/* 专属页
  platform: { kind: 'desktop', bridge, renderTitleBar },
})
```

平台契约是判别联合，桌面端这一支里 `bridge` 与 `renderTitleBar` 都**必填**——
所以入口处那句「桥不存在就抛」不是防御，而是组装前提。

**客户端专属页面放 `src/renderer/routes/`**，由构建配置的 `extraRoutes` 挂到
`/client` 前缀下。放进共享包的话浏览器侧也会生成它，多出一条永远到不了的
路由（而类型上还合法）。

标题栏之所以住在这里而不在渲染层：它整条是 `-webkit-app-region: drag`、
三枚控件走 IPC——浏览器里一件都不存在。**仅本地模式**加载这份桌面
renderer；云端模式加载远端 Web 构建，用系统边框与原生「更换使用方式」菜单
（D-105）。桌面专属路由和设置分区在云端页面中也不存在。

### 选择页为什么是第二个 HTML 入口，而不是主应用的一条路由

它**必须在没有任何宿主时也能打开**：首次启动时本地宿主还没起，云端连不上时
远端也没有。所以它由 `file://` 加载——而主应用的路由是 history 模式，
`file://` 下不工作。

但它不再是一份自包含的静态页（D-103 之前是 553 行 HTML，手抄了一套
`--bg` / `--text` / `--border` 变量、一份深色媒体查询，还另存了一份
BrandMark 的 path）。现在它用同一套 antd 主题、同一个 `BrandMark`、
同一组 `WindowControls`——那些是不该有第二份的东西。

`isTrustedSender()` 的信任判据包含「页面 URL 等于那个 `file://` 地址」，
改选择页的产出位置时要一起看。云端模式不再装 preload（D-107），远端页面
无法直接拿桌面桥；主进程仍保留发送方校验作为纵深防御。

**两种使用方式**（D-100）：本地使用（数据在本机 userData，入口是宿主注入的
本机令牌，不是无鉴权）/ 连接服务器（纯壳，加载自部署地址）。行为矩阵见
`.trellis/spec/project/architecture.md` §14.6，改本地模式令牌或 env 前先读那张表。

---

## 构建链

`pnpm desktop:build`（仓库根）= server 构建 → **desktop 三段构建** →
`server deploy --prod --node-linker hoisted` 仅为打包生成物理生产依赖树（根安装仍为 isolated），产物落到 `apps/desktop/server-deploy/` → electron-builder 打包。
自 D-103 起**没有单独的 web 构建那一步**：渲染进程是本包的第三个入口。

**`server-deploy/` 是 gitignore 的构建产物**，里面的文件（包括拷进去的
Trellis 规范）都不是源，改东西回到 `apps/server` 改。

产物布局（`dist/**` 整个进 asar）：

```
dist/main/index.js      主进程入口（package.json 的 main 指它）
dist/preload/index.js   preload（主进程用 __dirname/../preload/index.js 绝对路径加载）
dist/renderer/          渲染产物 + public（宿主把它当静态根）
```

### 为什么 `desktop:dev` 不是 `electron-vite dev`

electron-vite 的 dev 形态会为渲染进程另起一个 Vite dev server，让主进程读
`ELECTRON_RENDERER_URL` 去加载。**那会打破 D-046 的同源前提**：窗口加载的
必须是宿主自己的地址，cookie 会话、SSE 聊天流、文件 Range 请求才全部原生
可用。本地模式的免登录更是直接挂在这上面——令牌是写给
`http://127.0.0.1:<宿主端口>` 的 httpOnly cookie（`SameSite=Lax`），
窗口换成 `localhost:<vite 端口>` 后那条 cookie 根本不会带上。

所以 `desktop:dev` 先完整构建并启动，再走 `electron-vite build --watch`：
三段仍产到 `dist/`，由宿主做静态服务。渲染进程没有 HMR，改完要刷新窗口
（Ctrl+R）；main/preload 的新产物要重启 Electron 才会加载。

### 启动自检

`node scripts/smoke.mjs`（手动跑，不进 `pnpm test`）：用一次性 userData 以
本地模式启动真实 Electron，读宿主访问日志核对六件事——渲染产物被加载、
样式被加载、本地模式免登录生效、守卫放行、侧栏开始取数据。

它回答的是「这个客户端真的起来了吗」，而那是**代码推断不出来**的：三段各自
构建成功、类型也过，窗口里仍然可能白屏。改主进程路径、preload 位置、
或宿主静态根之后跑一次。

---

## 选择页异步状态与重复提交

`SetupPage` 的 mode.get 等待期间保留品牌与 `WindowControls`，用 `role=status` 呈现读取状态，不返回空页面。提交按钮和地址 Enter 共用入口；除 pending state 外，用同步 ref gate 在同一帧阻止重复 choose。空白云端地址以及桥缺失都不得 choose。失败（返回失败或异常）释放 gate/pending 并保留地址供重试；成功仅 activate 一次，保持 gate/pending 直到主进程导航。检查空白使用 trim，地址负载沿既有规则，不截断路径/查询。

等待提示独立于动作行，短高页面使用局部滚动，窗口控件保持可用。交互回归使用 deferred promise 锁住同帧防重、失败恢复和成功等待；不要只断言 loading 样式。浏览器模拟桥只能证明组件回调，实际启动/隔离用三段构建与 smoke.mjs；拖拽/系统菜单须另有原生GUI证据。

## 发布与更新

打包签名、四目标发布、更新 IPC 和保存后重启的可执行契约见 [releases-updates](./releases-updates.md)。
