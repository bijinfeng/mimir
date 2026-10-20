# 会静默出错的地方

这几类问题**不报错**，只在你以为没问题的时候悄悄地错。改相关代码前先扫一遍。
新坑记到这里（跨区域的记[项目坑表](../../project/pitfalls.md)）。

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
| **云端模式下窗口不能拖也不能关** | 云端直接加载远端 Web 构建，它固定注入 `{ kind: 'browser' }`，不会渲染桌面标题栏。云端窗口必须用系统边框，模式切换由主进程菜单提供（D-105）；本地与选择页才用 `frame: false` / 自绘控件。跨形态切换由 WorkspaceTransition 等旧窗确实关闭后再建新窗，期间抑制普通退出；beforeunload 拒绝时必须保留旧窗口身份，不能留下失去跟踪的编辑窗口 |
| **桌面端任务栏显示「Electron」或 `@mimirdesktop`** | 三处都默认错，且都不报错：① electron-builder 不给 `executableName` 时用 package.json 的 `name`（`@mimir/desktop`）拼出 `@mimirdesktop`，而 Linux 的窗口列表按可执行文件名推导；② 开发模式（`electron .`）下可执行文件是 `electron`，WM_CLASS 就是它；③ **`--class` 开关在 Electron 44 里已被忽略**（`appendSwitch('class')`、命令行 `--class=`、把二进制改名都实测无效），只有 **`app.setDesktopName('mimir.desktop')`** 生效——注意参数要带 `.desktop` 后缀（D-091 / D-094） |
| **打包版首启白屏（开发时正常）** | 选择页自 D-103 起是渲染进程的第二个入口，产物在 `dist/renderer/setup.html`，由打包配置的 `files: dist/**` 带进 asar——所以这一条现在是**结构性成立**的（原先它在 `ui/` 下，`files` 漏了 `ui/**` 就只有打包版炸）。但改 `setupPagePath()` 或 renderer 的 `outDir` 时仍要想到这对：开发形态读仓库里的文件，打包形态读 asar 内的，两者路径表达式必须同一个 |
| **切到云端后点「返回」/切换没反应** | `showSetupPage` **不能清 `modeState`**：选择页要靠它决定形态（首次选择 vs 切换）与预填地址。进入选择页只置 `setupVisible`（供 did-fail-load 判断），真正改模式的只有 `choose()` |
| **桌面端「换了使用方式但下次启动还是旧的」** | 配置写入是「临时文件 + rename」（`config.ts`）——同目录 rename 是原子的。直接覆盖写时电源断了会留下半截 JSON，而读侧把坏文件一律当「还没选过」——表现是回到选择页或模式回退，用户的选择静默丢失 |
| **「连不上」的错误话术透出 `fetch failed`** | Node / 浏览器给的原话没说清是「域名解析不了」「没人监听」还是「证书不信任」，而这三件的下一步完全不同。`cloud.ts` 的 `describeFetchError` 从 `error.cause.code` 判 ECONNREFUSED / ENOTFOUND / CERT…；另有一条 `bad port`（fetch 拦一批历史危险端口，且**不带** code）。测试用「刚释放的空闲端口」而不是 `:1` 来测连接失败 |
| **选择页的三种形态串了（首启显示「切换」的措辞、或多出不该有的按钮）** | 三种入口形态（首启 / 设置里更换 / 云端连不上的兜底）只差几句文案与一两个按钮的有无，漏一处不报错，只是界面在说错话。D-103 之前靠手写 `data-visible` + CSS 控制，踩过一次：`.field` 有 `display:none` 而 `.footnote` 漏了同一条规则——**那次是靠截图发现的**，DOM 断言看不出来。现在是 React 的条件渲染，`SetupPage.test.tsx` 逐条锁住了三种形态 |
| **改了选择页的产出位置，模式切换的安全模型跟着失效** | `isTrustedSender()` 的判据是「页面 URL 等于 `setupPageUrl()`」。云端模式下窗口里跑的是**远端服务端发来的页面**，它不能驱动模式切换（否则一台被攻破的服务器能让客户端启动本地宿主再导航过去，把本机知识库读走）。改 `setupPagePath()` 时两处要一起看——不一致的表现不是报错，而是**选择页自己的按钮变成「不受信任」**，点了会多弹一个原生确认框 |
| **切到另一 localhost 服务后带上本地免登录令牌** | Cookie 不按端口隔离；若本地与云端共用 `defaultSession`，`127.0.0.1:<另一个端口>` 也收到 `mimir-local`。本地令牌只写入 `persist:mimir-local`，云端按服务器地址分 Session；`BrowserWindow` 的 Session 创建后不能只靠 `loadURL` 切换，跨模式必须新建窗口（D-107） |
| **远端页面打开本地宿主或请求设备权限** | 仅同源 URL 可留在 Electron 窗口；`will-navigate`、重定向与 `window.open` 都要守，跨源 web 链接交系统浏览器。云端不加载 preload，Session 默认拒绝设备权限；同源文件预览子窗口也不注入 preload（D-107） |
