# apps/desktop/AGENTS.md

桌面端（Electron 载体）的区域规则。根目录的 `AGENTS.md` 仍然适用，这里只写
这一层特有的。

---

## 这一层的结构

**三段源码，由 electron-vite 统一构建**（D-103）：

```
apps/desktop/
├── electron.vite.config.ts   三段的构建编排（main / preload / renderer）
├── src/
│   ├── main/                 主进程
│   │   ├── index.ts          窗口、两种模式的装配、本地模式 cookie 注入
│   │   ├── host.ts           进程内私有宿主（D-046，host/carrier 分层）——本地模式的载体
│   │   ├── cloud.ts          云端模式的地址处理：归一化与探活（不依赖 Electron，可单测）
│   │   ├── config.ts         模式选择的持久化（<userData>/desktop-config.json，临时文件 + rename）
│   │   └── artifacts.ts      启动前的产物检查（缺失时给清单式错误）
│   ├── preload/index.ts      沙箱化 preload：只暴露宿主↔载体的握手契约（packages/shared/src/desktop.ts）
│   └── renderer/             渲染进程——**只有载体独有的**。两个 HTML 入口
│       ├── index.html        主应用的入口（electron-vite 的约定位置）
│       ├── index.tsx         注入桌面插槽 → createApp()
│       ├── setup.html        首启选择页的入口（D-100）
│       ├── setup.tsx         选择页挂载（不注入插槽——它自己就是桌面专属的）
│       ├── setup/            选择页的组件与样式
│       ├── components/       自绘标题栏（D-094）、窗口控件（两处共用）
│       └── lib/              桌面桥的取值（window.mimirDesktop）
└── scripts/                  图标生成（D-091）、启动自检（smoke.mjs）
```

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

`isTrustedSender()` 的信任判据是「页面 URL 等于那个 `file://` 地址」，
改选择页的产出位置时要一起看：安全模型挂在它上面（云端模式下窗口里跑的是
远端页面，不能让它驱动模式切换）。

**两种使用方式**（D-100）：本地使用（数据在本机 userData，入口是宿主注入的
本机令牌，不是无鉴权）/ 连接服务器（纯壳，加载自部署地址）。行为矩阵见
`docs/TECH.md` §14.6，改本地模式令牌或 env 前先读那张表。

---

## 构建链

`pnpm desktop:build`（仓库根）= server 构建 → **desktop 三段构建** →
`server deploy` 产物落到 `apps/desktop/server-deploy/` → electron-builder 打包。
自 D-103 起**没有单独的 web 构建那一步**：渲染进程是本包的第三个入口。

**`server-deploy/` 是 gitignore 的构建产物**，里面的文件（包括拷进去的
`AGENTS.md`）都不是源，改东西回到 `apps/server` 改。

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

## 会静默出错的地方

这几类问题**不报错**，只在你以为没问题的时候悄悄地错。改相关代码前先扫一遍。
新坑记到这里（跨区域的记根 `AGENTS.md`；原根坑表与 TECH §10 的桌面条目已于
2026-10 归位至此，合并了重复）。

| 症状 | 原因 |
|---|---|
| **改了前端代码，窗口里看不到变化** | 窗口加载的是 `dist/renderer` 的**构建产物**（不是 dev server，理由见上面「为什么不是 electron-vite dev」）。`desktop:dev` 会 watch 重建，但**要手动刷新窗口**（Ctrl+R）；直接 `electron .` 则完全不会重建。症状只是「什么都没发生」，很容易去怀疑 IPC 或 preload。D-103 之前这条更糟：产物来自 `apps/web/dist`，不单独构建那个包就永远看不到改动 |
| **界面代码改了半天没生效，因为改错了包** | 界面与业务代码在 `@mimir/renderer`（与浏览器部署共用）。`src/renderer/` 下只有标题栏与桥——两个平台都要的东西改到这里，浏览器那侧不会跟着变；反过来，载体独有的东西（拖动区、IPC）放进渲染层会让浏览器产物带上永不成立的分支（D-103） |
| **绕过 `desktop:start` 直接 `electron .` 且产物缺失 → 报 ERR_MODULE_NOT_FOUND** | `host.ts` 在动态 import 之前会检查四个必需产物（serverDist/index.js、db/migrate.js、drizzle-sqlite/、渲染产物的 index.html），缺失时给出「缺少 N 个必需产物：…，修复：pnpm desktop:start」的清单式错误。但**过期产物**（改了代码没重新构建）仍只能靠手动重新构建发现 |
| **产物清单把 `apps/drizzle-sqlite` 报成缺失（一个从来不存在的路径）** | `serverRoot` 曾经写成 `serverDist/../..`——那依赖「serverDist 与 webDist 同在 `apps/` 下」这个巧合，渲染产物搬进本包后就不成立了。正确是退**一级**（两种布局下 serverDist 都是 `<serverRoot>/dist`）。错误信息本身看着很正常（「缺少 drizzle 迁移目录」），只有盯着那个路径才会发现它少了一级；`artifacts.test.ts` 也抓不到，那边直接传 serverRoot。`host.test.ts` 现在锁住了这条推导（D-103） |
| **`desktop:dev` 客户端启动失败后，下一次启动报 3000 被占用** | 旧编排器在独立 Vite 进程里起服务端，直接启动的 `pnpm` 退出后孙进程可能继续监听 3000。现在 `desktop:dev` 与 `desktop:start` 共用进程内宿主和 SQLite，端口随机分配；编排器仍清理整棵进程树，防止构建或 Electron 失败时留孤儿进程 |
| **`desktop:dev` 误用 `.env` 的 PostgreSQL，启动时报缺表** | 旧编排器的独立服务端继承仓库 `.env`。现在与正式桌面端走同一条宿主路径，`host.ts` 在加载服务端前明确设置 SQLite 的 `DATABASE_URL` 与 `DATA_DIR`，不受 `.env` 的 PostgreSQL 配置影响 |
| **`desktop:dev` 报 `Downloading Electron binary... TypeError: fetch failed`** | npm 包虽已由 pnpm registry 安装，Electron 首次运行还会从 GitHub 单独下载二进制；GitHub 不通时包存在但 `dist/electron` 缺失。`desktop:dev` 给子进程默认传 `ELECTRON_MIRROR`（npmmirror，可由用户覆盖）。手动补装命令见 TECH §14.4；无需删整个 `node_modules` |
| **首次运行 `desktop:dev`，Electron 报主进程入口不存在** | Electron 的 npm 包只带运行时，应用主进程与 preload 要由桌面包的 Vite 构建。根命令 `desktop:dev` 调用 `desktop:start`，由它先完成 server/desktop 构建；产物入口是 `dist/main/index.js` |
| **自绘标题栏里的按钮点不动（控制台无报错）** | 标题栏整条是 `-webkit-app-region: drag`，里面每个可点元素必须显式 `-webkit-app-region: no-drag`。漏标的表现是「点击被当成拖窗口」——不报错、没有日志、看起来像按钮坏了。**这条是方案 C 被否掉的理由**（要标注的地方太多） |
| **`window.mimirDesktop` 在窗口里不存在** | `BrowserWindow` 的 `preload` 写成了相对路径（`'./dist/preload.js'`）：加载 http 地址时 Electron 解析不了它，**preload 静默不执行**。要用 `path.join(__dirname, …)` 的绝对路径——三段布局下主进程在 `dist/main/`，所以是 `__dirname/../preload/index.js`（D-103） |
| **云端模式下窗口不能拖也不能关** | 云端直接加载远端 Web 构建，它固定注入 `{ kind: 'browser' }`，不会渲染桌面标题栏。云端窗口必须用系统边框，模式切换由主进程菜单提供（D-105）；本地与选择页才用 `frame: false` / 自绘控件。跨这两种形态切换时先建新窗口再关旧窗，避免 `window-all-closed` 退出应用 |
| **桌面端任务栏显示「Electron」或 `@mimirdesktop`** | 三处都默认错，且都不报错：① electron-builder 不给 `executableName` 时用 package.json 的 `name`（`@mimir/desktop`）拼出 `@mimirdesktop`，而 Linux 的窗口列表按可执行文件名推导；② 开发模式（`electron .`）下可执行文件是 `electron`，WM_CLASS 就是它；③ **`--class` 开关在 Electron 44 里已被忽略**（`appendSwitch('class')`、命令行 `--class=`、把二进制改名都实测无效），只有 **`app.setDesktopName('mimir.desktop')`** 生效——注意参数要带 `.desktop` 后缀（D-091 / D-094） |
| **打包版首启白屏（开发时正常）** | 选择页自 D-103 起是渲染进程的第二个入口，产物在 `dist/renderer/setup.html`，由打包配置的 `files: dist/**` 带进 asar——所以这一条现在是**结构性成立**的（原先它在 `ui/` 下，`files` 漏了 `ui/**` 就只有打包版炸）。但改 `setupPagePath()` 或 renderer 的 `outDir` 时仍要想到这对：开发形态读仓库里的文件，打包形态读 asar 内的，两者路径表达式必须同一个 |
| **切到云端后点「返回」/切换没反应** | `showSetupPage` **不能清 `modeState`**：选择页要靠它决定形态（首次选择 vs 切换）与预填地址。进入选择页只置 `setupVisible`（供 did-fail-load 判断），真正改模式的只有 `choose()` |
| **桌面端「换了使用方式但下次启动还是旧的」** | 配置写入是「临时文件 + rename」（`config.ts`）——同目录 rename 是原子的。直接覆盖写时电源断了会留下半截 JSON，而读侧把坏文件一律当「还没选过」——表现是回到选择页或模式回退，用户的选择静默丢失 |
| **「连不上」的错误话术透出 `fetch failed`** | Node / 浏览器给的原话没说清是「域名解析不了」「没人监听」还是「证书不信任」，而这三件的下一步完全不同。`cloud.ts` 的 `describeFetchError` 从 `error.cause.code` 判 ECONNREFUSED / ENOTFOUND / CERT…；另有一条 `bad port`（fetch 拦一批历史危险端口，且**不带** code）。测试用「刚释放的空闲端口」而不是 `:1` 来测连接失败 |
| **选择页的三种形态串了（首启显示「切换」的措辞、或多出不该有的按钮）** | 三种入口形态（首启 / 设置里更换 / 云端连不上的兜底）只差几句文案与一两个按钮的有无，漏一处不报错，只是界面在说错话。D-103 之前靠手写 `data-visible` + CSS 控制，踩过一次：`.field` 有 `display:none` 而 `.footnote` 漏了同一条规则——**那次是靠截图发现的**，DOM 断言看不出来。现在是 React 的条件渲染，`SetupPage.test.tsx` 逐条锁住了三种形态 |
| **改了选择页的产出位置，模式切换的安全模型跟着失效** | `isTrustedSender()` 的判据是「页面 URL 等于 `setupPageUrl()`」。云端模式下窗口里跑的是**远端服务端发来的页面**，它不能驱动模式切换（否则一台被攻破的服务器能让客户端启动本地宿主再导航过去，把本机知识库读走）。改 `setupPagePath()` 时两处要一起看——不一致的表现不是报错，而是**选择页自己的按钮变成「不受信任」**，点了会多弹一个原生确认框 |
