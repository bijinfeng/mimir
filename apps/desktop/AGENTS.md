# apps/desktop/AGENTS.md

桌面端（Electron 载体）的区域规则。根目录的 `AGENTS.md` 仍然适用，这里只写
这一层特有的。

---

## 这一层的结构

```
apps/desktop/
├── src/
│   ├── main.ts      主进程：窗口、两种模式的装配、本地模式 cookie 注入
│   ├── preload.ts   沙箱化 preload：只暴露宿主↔载体的握手契约（packages/shared/src/desktop.ts）
│   ├── host.ts      进程内私有宿主（D-046，host/carrier 分层）——本地模式的载体
│   ├── cloud.ts     云端模式的地址处理：归一化与探活（不依赖 Electron，可单测）
│   └── config.ts    模式选择的持久化（<userData>/desktop-config.json，临时文件 + rename）
├── ui/setup.html    首启选择页（自包含静态文件，不进 dist）
└── scripts/         图标由 make-icons.ts 从 favicon 生成（D-091）
```

**两种使用方式**（D-100）：本地使用（数据在本机 userData，入口是宿主注入的
本机令牌，不是无鉴权）/ 连接服务器（纯壳，加载自部署地址）。行为矩阵见
`docs/TECH.md` §14.6，改本地模式令牌或 env 前先读那张表。

---

## 构建链

`pnpm desktop:build`（仓库根）= web 构建 → server 构建 → desktop 构建 →
`server deploy` 产物落到 `apps/desktop/server-deploy/` → electron-builder 打包。
**`server-deploy/` 是 gitignore 的构建产物**，里面的文件（包括拷进去的
`AGENTS.md`）都不是源，改东西回到 `apps/server` 改。

**桌面端加载的是 `apps/web/dist` 的构建产物**，不是 dev server——改了 web
代码不重新 build，窗口里就永远看不到变化。

---

## 会静默出错的地方

这几类问题**不报错**，只在你以为没问题的时候悄悄地错。改相关代码前先扫一遍。
新坑记到这里（跨区域的记根 `AGENTS.md`；原根坑表与 TECH §10 的桌面条目已于
2026-10 归位至此，合并了重复）。

| 症状 | 原因 |
|---|---|
| **改了桌面端标题栏的前端代码，窗口里看不到变化** | 桌面端加载的是 `apps/web/dist` 的**构建产物**（不是 dev server）——不跑 `pnpm --filter @mimir/web build` 就永远看不到改动，而症状只是「什么都没发生」，很容易去怀疑 IPC 或 preload |
| **自绘标题栏里的按钮点不动（控制台无报错）** | 标题栏整条是 `-webkit-app-region: drag`，里面每个可点元素必须显式 `-webkit-app-region: no-drag`。漏标的表现是「点击被当成拖窗口」——不报错、没有日志、看起来像按钮坏了。**这条是方案 C 被否掉的理由**（要标注的地方太多） |
| **`window.mimirDesktop` 在窗口里不存在** | `BrowserWindow` 的 `preload` 写成了相对路径（`'./dist/preload.js'`）：加载 http 地址时 Electron 解析不了它，**preload 静默不执行**。要用 `path.join(__dirname, …)` 的绝对路径 |
| **云端模式下窗口不能拖也不能关** | 桌面壳是 `frame: false`，拖动区与三枚控件由页面提供，而云端模式落地的第一个界面是**远端登录页**——登录页原先没有 `TitleBar`，实测切到云端后整条窗口 chrome 凭空消失。登录页也要渲染 `TitleBar`（无侧栏时只留拖动区与控件） |
| **桌面端任务栏显示「Electron」或 `@mimirdesktop`** | 三处都默认错，且都不报错：① electron-builder 不给 `executableName` 时用 package.json 的 `name`（`@mimir/desktop`）拼出 `@mimirdesktop`，而 Linux 的窗口列表按可执行文件名推导；② 开发模式（`electron .`）下可执行文件是 `electron`，WM_CLASS 就是它；③ **`--class` 开关在 Electron 44 里已被忽略**（`appendSwitch('class')`、命令行 `--class=`、把二进制改名都实测无效），只有 **`app.setDesktopName('mimir.desktop')`** 生效——注意参数要带 `.desktop` 后缀（D-091 / D-094） |
| **打包版首启白屏（开发时正常）** | 选择页在 `apps/desktop/ui/`，不在 `dist` 下——`electron-builder.yml` 的 `files` 漏了 `ui/**` 时 asar 里没有它，`file://` 加载失败。开发形态读的是仓库里的文件，所以只有打包版才炸 |
| **切到云端后点「返回」/切换没反应** | `showSetupPage` **不能清 `modeState`**：选择页要靠它决定形态（首次选择 vs 切换）与预填地址。进入选择页只置 `setupVisible`（供 did-fail-load 判断），真正改模式的只有 `choose()` |
| **桌面端「换了使用方式但下次启动还是旧的」** | 配置写入是「临时文件 + rename」（`config.ts`）——同目录 rename 是原子的。直接覆盖写时电源断了会留下半截 JSON，而读侧把坏文件一律当「还没选过」——表现是回到选择页或模式回退，用户的选择静默丢失 |
| **「连不上」的错误话术透出 `fetch failed`** | Node / 浏览器给的原话没说清是「域名解析不了」「没人监听」还是「证书不信任」，而这三件的下一步完全不同。`cloud.ts` 的 `describeFetchError` 从 `error.cause.code` 判 ECONNREFUSED / ENOTFOUND / CERT…；另有一条 `bad port`（fetch 拦一批历史危险端口，且**不带** code）。测试用「刚释放的空闲端口」而不是 `:1` 来测连接失败 |
| **选择页首启多出一行「已在其他方式下使用过？」** | `.field` 有 `display:none` 而 `.footnote` 漏了同一条规则——`data-visible='false'` 只是数据，不画出来的那一步靠 CSS。隐藏规则两个元素都要有（`setup.html`）。**这条是靠截图发现的**，DOM 断言不看渲染结果 |
