# 跨区域静默坑

这几类问题**不报错**，只在你以为没问题的时候悄悄地错。

坑**按区域就近记录**（改哪里的代码，哪份坑表就跟着被读）；本节只收**跨区域**的。
新坑记到所属区域的坑表，跨区域的记这里。TECH §10 只做路由。

| 你要改的区域 | 坑表在 |
|---|---|
| 编辑器与界面总则（`packages/renderer`——两个平台共用） | `.trellis/spec/renderer/frontend/index.md` |
| ├ Markdown 编辑器（`packages/renderer/src/editor`） | `.trellis/spec/renderer/frontend/editor/index.md` |
| ├ 主题与外观（`packages/renderer/src/theme`） | `.trellis/spec/renderer/frontend/theme/index.md` |
| ├ 文档面板与文件预览（`packages/renderer/src/components/document`） | `.trellis/spec/renderer/frontend/document/index.md` |
| 浏览器部署的壳（`apps/web`） | `.trellis/spec/web/frontend/index.md` |
| Office / PDF 总则（`packages/office`） | `.trellis/spec/office/engine/index.md` |
| ├ 编辑器外壳——四种格式共用（`packages/office/src/shell`） | `.trellis/spec/office/frontend/shell/index.md` |
| └ 各格式编辑器（`packages/office/src/editors`） | `.trellis/spec/office/frontend/editors/index.md` |
| 对话面板（`packages/chat`） | `.trellis/spec/chat/frontend/index.md` |
| 服务端 / 数据库 / 检索 / 存储（`apps/server`） | `.trellis/spec/server/backend/index.md` |
| 桌面端（`apps/desktop`） | `.trellis/spec/desktop/runtime/index.md` |

跨区域的坑：

| 症状 | 原因 |
|---|---|
| **两个平台共用的界面代码里出现平台判断（`window.mimirDesktop` / `process`）** | 界面代码在 `packages/renderer`，**浏览器与桌面渲染进程各编译一份**（D-103）。平台差异走 `src/platform.tsx` 的 Context + 判别联合，由两个入口注入（D-104；`apps/web/src/index.tsx`、`apps/desktop/src/renderer/index.tsx`）。写成运行时判断不报错，但那一支在另一个平台永远不成立：桌面专属组件被打进浏览器产物，而读代码的人分不清它是死代码还是有用分支 |
| **`--me-accent` 当文字色用（工具条按下态、菜单当前值）** | 主色是**填充**角色（按钮底、选中底、边框、焦点环）。实测按下态 `#1668dc` on `#15325b` = **2.47:1**（浅色 3.66:1）、菜单当前值浅色 4.10:1／深色 3.50:1——33 个按钮的激活态全都偏难认，而单看一处「像是有高亮」所以没人查。强调**文字**走 `--me-accent-text`（桥接层填 `colorLink`；DESIGN §3.5 的同一条推论，D-096） |
| **rAF 在不可见时根本不派发（焦点送不到 / 分页永久失效）** | `requestAnimationFrame` 的语义是「下一个渲染帧之前」，后台标签页、`display:none` 容器、部分内嵌 webview 里**永远没有帧**——回调不执行且不报错。实测 IAB 里 `rafFired === false`（`useFindHotkey` 第一版就是这么写的，Ctrl+F 什么都不发生）。要「等这次渲染落地」用 `setTimeout(fn, 0)`（分页那边记过同一个坑，D-096） |
| **某个元素整组样式缺失，DevTools 里类名带着 `#` 或括号** | **在 createStyles 的样式体里声明了 `--*` 自定义属性**（哪怕只想拿它当 hover 变量）：antd-style 会把属性**值**拼进类名，`acss-xxx-#5c6570-rgba(…)` 是非法选择器，浏览器整条丢弃，元素裸奔成默认样式（实测：原生 button 灰底 Arial）。消费宿主变量 `var(--mimir-chat-*)` 没问题，声明新的不行；hover 传值走属性选择器（`.trellis/spec/chat/frontend/index.md` §2） |
| **悬停才出现的按钮/动作条一直不显形（但点得到）** | antd-style 的样式块编译成哈希类名（`acss-xxxx`），同一文件里写 `.card:hover &` 这种**字面类名**的后代选择器永远匹配不到——宿主上没有那个类，规则静默失效：元素 opacity 仍是 0 但留在文档流里、仍可点（自动化点得中、人眼看不见）。宿主要额外挂一个字面类（`LibraryView` 的 `.kb-card` / `.kb-row`，`FolderSection` 的行是同一条做法的先例） |
| **图标迁移后尺寸不对（巨大 / 挤成一团）** | antd 图标随 `font-size` 缩放，lucide 默认 **24px 固定尺寸**——迁移时必须给显式 `size`（本仓两档：14 小字形 / 16 常规按钮槽）。「停止」这类**实心**图标要 `fill="currentColor"`（lucide 的 Square 默认描边空心） |
| **给组件传 `render={(x) => <Child …/>}` 这种内联箭头，整个组件不再被优化** | `react(no-unstable-nested-components)` 判它是「渲染期定义组件」，React Compiler 随即跳过宿主组件（铁律 1 的静默退化）——lint 会报，但**如果你在报之前就提交了**，症状是「没有报错，只是这个组件不再被优化」。修法：render-prop 提到**模块级函数**（`DocChatSidebar` 的 `renderGuide` / `folder-icons.tsx` 的 `FolderGlyph` 是先例） |
| **`const Icon = map[key]; <Icon/>` 让整个组件不再被优化** | `react(no-unstable-nested-components)` 判它「渲染期定义组件」，React Compiler 随即跳过（铁律 1 的静默退化）。渲染时直接调用返回的组件函数，或把组件表提到模块级（`FolderGlyph` / `renderSwitcherIcon` 的写法） |
| 组件没变快 | React Compiler 静默跳过了这个组件，且无任何提示。常见触发：抑制了 React 规则（铁律 1）、ref 声明在使用它的 effect 之后（`react-compiler(Immutability)` 警告）、渲染期读写 ref（`react(refs)`）——参与渲染的值用 state，只在事件处理器里读写 ref。保持 `logDiagnostics: true`；改代码结构而不是 disable |
| 类型对不上 | `^0.145.0` 这类 peer 范围对 0.x 版本意味着 `>=0.145.0 <0.146.0`——装最新版会报 unmet peer，锁到同一个小版本系列 |
| 生产启动报错 | workspace 包（`@mimir/shared` / `core` / `tokenizer` / `plugins/*`）以源码发布，Node 不执行 node_modules 里的 TS（`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`）——必须由使用方编译进产物（前后端都交给 Vite，见 D-023 / D-033）。把任何一个标成 external 就是这个症状，而**本地开发完全正常** |
| 改设置看起来没生效 | 值被环境变量压住了，或保存请求没发出去。设置页必须如实显示**来源**（界面/环境变量/默认），且保存是显式动作而非 `onBlur`——绑定在 blur 上的保存实测不触发，而界面上值看着是改了的 |
| **本地模式（D-100）点进去却要登录** | 令牌的**名字**在两处：桌面宿主写 cookie（`main.ts`）与服务端读 cookie（`services/local-mode.ts`），走 shared 的 `LOCAL_TOKEN_COOKIE` 常量；宿主忘了注入（`injectLocalCookie`）或 env 写成 `true`（服务端只认 `'1'`）都表现成「本地模式却看到登录页」——不报错。服务端「开了本地模式但没令牌」直接启动报错，绝不降级成「有开关就放行」。改这两处前先看 `.trellis/spec/project/architecture.md` §14.6 的表 |
| 当天发布的依赖被拒 | pnpm 12 的供应链策略——锁到上一个稳定版本 |
| 无头截图里浮层看起来透明 | 动画冻结——只是截图问题，真实浏览器正常 |
| oxlint 的历史规则误报 | `react-in-jsx-scope`（React 17+ 的历史遗留）与 `import/no-named-as-default`（Tiptap 包同时有 default 与 named 导出）——都关掉，统一用 named 导入 |
| oxfmt 把中文表格越排越乱 | 列宽按字节算——oxfmt 排除 `**/*.md` |
| node_modules 里出现没声明过的包 | `@vitejs/plugin-react` 的 optional peer 被 pnpm autoInstallPeers 自动装了——不是依赖没删干净 |
| 照抄 Vite 文档的 `build.rollupOptions` | Vite 8 里它只是 `rolldownOptions` 的别名（已标 deprecated）。新配置一律用 `rolldownOptions` |
| 测试报「找不到模块」而构建正常 | vitest 与 vite 各有一份配置，别名只在一边配了。别名定义在 `alias.ts`，两个配置都从它取 |
| 改了样式文件，报错指向一句中文注释（`Expected a semicolon`） | 反引号在 createStyles / createGlobalStyle 的 css 模板串里**直接终止字符串**——注释里也不行，整段样式变非法 TS，而改的人只是往注释里加了一对强调用的反引号。模板里一律不写反引号，强调用「」或 `**`。机器守：`scripts/check-style-backticks.mjs` 逐行配对扫描（正则写法抓不到，见该脚本注释；**加断言后要用注入验证它能红**——第一版就是永远绿的）。这个坑咬过三次（`StatsSection.style.ts` 两次、`styles/global.ts` 一次） |

---
