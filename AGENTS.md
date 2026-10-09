# AGENTS.md

给 AI agent 的项目入口。**先读完这一页再动手**——它不重复文档内容，只告诉你
什么绝对不能违反、以及去哪里找答案。

---

## 这个项目是什么

mimir —— 自托管的个人知识库。写 Markdown 笔记、收集外部资料、带引用地问 AI。
单用户，Docker 部署在自有服务器上。

设计已经定稿。你的工作是在既有决策下实现功能，**不是重新评估它们**。

---

## 常用命令

| 命令 | 干什么 |
|---|---|
| `pnpm dev` | 全仓并行 dev（web / server 等有 dev 脚本的包；桌面端另用 `pnpm desktop:dev`） |
| `pnpm check` | lint + 样式守卫 + format + typecheck + test，一条命令跑完 |
| `pnpm build` / `pnpm test` / `pnpm -r typecheck` | 全仓构建 / 测试 / 类型检查 |
| `pnpm lint`（`lint:fix`）/ `pnpm format:check`（`format`） | oxlint / oxfmt（oxfmt 不碰 `**/*.md`） |
| `pnpm db:up` / `db:down` | 起 / 停 Postgres（Docker）。不设 `DATABASE_URL` 时本地默认 SQLite，不需要它 |
| `pnpm db:migrate` / `db:reindex` | 跑迁移 / 重建全文与分块索引 |
| `pnpm db:generate:pg` + `db:generate:sqlite` | 生成两侧迁移，**两边的迁移文件要同批提交** |
| `pnpm desktop:dev` / `desktop:build` | 桌面端开发（electron-vite 三段 watch 构建，**改完刷新窗口**）/ 打包安装包（`server-deploy/` 是 gitignore 的产物） |

---

## 开工前必读（按顺序）

| 顺序 | 文件 | 读它是为了 |
|---|---|---|
| 1 | 本页 | 铁律、完成定义、跨区域的坑 |
| 2 | `docs/PRD.md` 的 §1 非目标 | 知道什么不该做 |
| 3 | 从根到你改动的目录**沿途**的 `AGENTS.md` | 区域规则与坑表；最近者优先（见下） |
| 4 | 任务涉及的 `docs/TECH.md` 章节 | 该模块的设计 |

不必通读全部文档。但上面四项**没读完不要开始写代码**。

**AGENTS.md 沿目录嵌套**（openai/codex 的同一套约定）：工作在某个目录时，
从仓库根到该目录**沿途**的每份 `AGENTS.md` 都适用——下层只**加码**，
不放松根上的铁律（最近者优先）。某个目录有独属于自己的规则与坑，就在那里
建一份；一份超过约 200 行、且其中某块内容只属于某个子目录时，继续往下拆。
个人本地的临时覆盖写 `AGENTS.override.md`（已 gitignore，不提交）。

---

## 铁律

违反这些的改动一律不接受。每条都附了原因——原因比规则重要，因为规则的边界
要靠原因来判断。

### 1. 不要抑制 React 规则

```ts
// ✗ 这会让 React Compiler 跳过整个组件
// eslint-disable-next-line react-hooks/exhaustive-deps
useEffect(() => { ... }, [a])
```

React Compiler 会跳过「抑制了 React 规则」的组件——抑制 hook 规则通常意味着
代码违反 Rules of React，编译器无法保证优化后行为一致。**这是静默的**：不报错，
只是组件不再被优化。

正确做法是改代码结构，不是关诊断。见 `apps/web/AGENTS.md` 的「只读一次的初始值」。

### 2. 写入顺序：先文件，后数据库

```
✗ 数据库 → 文件    失败时产生「数据库里有、文件打不开」的记录
✓ 文件 → 数据库    失败时只是「文件存在但未入库」，重建索引即修复
```

因为**文件是真相，数据库是可重建的索引**。任何新的写入路径都要遵守这个顺序。

### 3. 所有内容统一成为 Markdown

不管来源是手写、网页、公众号还是 GitHub，入库后都是同一条 `documents` 记录
加同一套 Markdown 正文。不要为新来源引入新的存储形状——那会让检索、引用、
导出各自长出分支。

### 4. 中文必须预分词

Postgres 的 `simple` 配置没有词边界概念，「组件性能优化」会被当成**一个** token，
用户搜「组件」永远搜不到。所以写入时用 jieba 切好存进 `search_text` 列。
SQLite 路径同理：FTS5 的 `unicode61` 分词器也不认中文词边界，索引的正是
这份预分词文本。

新建任何全文索引前，先确认文本已经过分词。

### 5. 模型调用交给 SDK，检索层自己写

`chat` / `embed` / `rerank` / `summarize` 全部走 TanStack AI。
但**不要引入 RAG 框架**（Mastra、LlamaIndex、LangChain 等）——它们都想接管
文档与分块的数据模型，而我们必须让引用能指回自己的表。

**适配器的构造只在 `plugins/provider/` 里。** 不要在 `apps/server` 里直接
`openaiCompatible(...)`：三个角色的工厂函数各不相同（chat 走
`openaiCompatible`，summarize 与 embed 各有自己的 `create*`），
散着写就会各抄一份——重构前 `assistant.ts` 与 `assistant-stream.ts`
就是两份拷贝。宿主只问「要哪个角色」（`services/model.ts`）。

理由与实测数据见 `docs/RESEARCH.md` §3，协议见 `docs/TECH.md` §7.4。

### 6. 不碰非目标清单

`docs/PRD.md` §1 列出了明确不做的事（多人协作、知识图谱、外部插件市场……）。
**不要因为「顺手」或「看起来合理」就加。** 那份清单是产品判断的结果，不是待办。

### 7. 文档与代码同批提交

只有改动了**现行契约**（产品边界、用户可见行为、数据/接口/部署约束、设计规范）
才同步更新对应文档，并与代码同批提交。普通修复、重构、测试补充、文件搬迁，
若没有改变这些契约，**不要为了「每次修改都登记」而写文档**；验证结果写在提交信息。

如果你发现某个既有决策其实是错的——**先改文档并说明理由**，不要直接改代码。
让判断留在文档里可被评审。

登记前先问三件事：① 半年后仍需要这条信息吗？② 代码、测试或提交记录不能直接回答吗？
③ 它是否已有唯一的归属文档？任一答案不满足，就不新增段落。只有**改变重要取舍**、
且未来可能被误改时才追加 `docs/DECISIONS.md`；不要把过程、文件清单、测试数、
截图流水或「本轮收尾」写进去。现行规范只改它的唯一归属处；静默坑只记症状、
根因、避免办法，按区域放进最近的 `AGENTS.md`。详见 `docs/INDEX.md` 的文档职责。

---

## 完成定义

「改完了」不算完成。以下全部满足才算：

1. **`pnpm check` 通过** —— lint、format、typecheck、test 一条命令
2. **验证方式写进提交信息** —— 跑了什么、看到什么。不是「已测试」
3. **涉及检索或解析的改动** —— 说明怎么确认效果，不要只跑单元测试就宣布完成
4. **涉及界面的改动** —— 说明实际看到了什么，不要只看代码推断
5. **改了现行契约** —— 更新唯一归属文档；有新的实质取舍才追加决策记录，
   其余改动不为登记而登记
6. **没跑过的东西不要声称跑过**

---

## 会静默出错的地方

这几类问题**不报错**，只在你以为没问题的时候悄悄地错。

坑**按区域就近记录**（改哪里的代码，哪份坑表就跟着被读），每份区域
`AGENTS.md` 都有一节「会静默出错的地方」；本节只收**跨区域**的。
新坑记到所属区域的坑表，跨区域的记这里。TECH §10 只做路由。

| 你要改的区域 | 坑表在 |
|---|---|
| 编辑器与界面总则（`packages/renderer`——两个平台共用） | `packages/renderer/AGENTS.md` |
| ├ Markdown 编辑器（`packages/renderer/src/editor`） | `packages/renderer/src/editor/AGENTS.md` |
| ├ 主题与外观（`packages/renderer/src/theme`） | `packages/renderer/src/theme/AGENTS.md` |
| ├ 文档面板与文件预览（`packages/renderer/src/components/document`） | `packages/renderer/src/components/document/AGENTS.md` |
| 浏览器部署的壳（`apps/web`） | `apps/web/AGENTS.md` |
| Office / PDF 总则（`packages/office`） | `packages/office/AGENTS.md` |
| ├ 编辑器外壳——四种格式共用（`packages/office/src/shell`） | `packages/office/src/shell/AGENTS.md` |
| └ 各格式编辑器（`packages/office/src/editors`） | `packages/office/src/editors/AGENTS.md` |
| 对话面板（`packages/chat`） | `packages/chat/AGENTS.md` |
| 服务端 / 数据库 / 检索 / 存储（`apps/server`） | `apps/server/AGENTS.md` |
| 桌面端（`apps/desktop`） | `apps/desktop/AGENTS.md` |

跨区域的坑：

| 症状 | 原因 |
|---|---|
| **两个平台共用的界面代码里出现平台判断（`window.mimirDesktop` / `process`）** | 界面代码在 `packages/renderer`，**浏览器与桌面渲染进程各编译一份**（D-103）。平台差异一律走 `src/slots.ts` 的插槽，由两个入口注入（`apps/web/src/index.tsx`、`apps/desktop/src/renderer/index.tsx`）。写成运行时判断不报错，但那一支在另一个平台永远不成立：桌面专属组件被打进浏览器产物，而读代码的人分不清它是死代码还是有用分支 |
| **`--me-accent` 当文字色用（工具条按下态、菜单当前值）** | 主色是**填充**角色（按钮底、选中底、边框、焦点环）。实测按下态 `#1668dc` on `#15325b` = **2.47:1**（浅色 3.66:1）、菜单当前值浅色 4.10:1／深色 3.50:1——33 个按钮的激活态全都偏难认，而单看一处「像是有高亮」所以没人查。强调**文字**走 `--me-accent-text`（桥接层填 `colorLink`；DESIGN §3.5 的同一条推论，D-096） |
| **rAF 在不可见时根本不派发（焦点送不到 / 分页永久失效）** | `requestAnimationFrame` 的语义是「下一个渲染帧之前」，后台标签页、`display:none` 容器、部分内嵌 webview 里**永远没有帧**——回调不执行且不报错。实测 IAB 里 `rafFired === false`（`useFindHotkey` 第一版就是这么写的，Ctrl+F 什么都不发生）。要「等这次渲染落地」用 `setTimeout(fn, 0)`（分页那边记过同一个坑，D-096） |
| **某个元素整组样式缺失，DevTools 里类名带着 `#` 或括号** | **在 createStyles 的样式体里声明了 `--*` 自定义属性**（哪怕只想拿它当 hover 变量）：antd-style 会把属性**值**拼进类名，`acss-xxx-#5c6570-rgba(…)` 是非法选择器，浏览器整条丢弃，元素裸奔成默认样式（实测：原生 button 灰底 Arial）。消费宿主变量 `var(--mimir-chat-*)` 没问题，声明新的不行；hover 传值走属性选择器（`packages/chat/AGENTS.md` §2） |
| **悬停才出现的按钮/动作条一直不显形（但点得到）** | antd-style 的样式块编译成哈希类名（`acss-xxxx`），同一文件里写 `.card:hover &` 这种**字面类名**的后代选择器永远匹配不到——宿主上没有那个类，规则静默失效：元素 opacity 仍是 0 但留在文档流里、仍可点（自动化点得中、人眼看不见）。宿主要额外挂一个字面类（`LibraryView` 的 `.kb-card` / `.kb-row`，`FolderSection` 的行是同一条做法的先例） |
| **图标迁移后尺寸不对（巨大 / 挤成一团）** | antd 图标随 `font-size` 缩放，lucide 默认 **24px 固定尺寸**——迁移时必须给显式 `size`（本仓两档：14 小字形 / 16 常规按钮槽）。「停止」这类**实心**图标要 `fill="currentColor"`（lucide 的 Square 默认描边空心） |
| **给组件传 `render={(x) => <Child …/>}` 这种内联箭头，整个组件不再被优化** | `react(no-unstable-nested-components)` 判它是「渲染期定义组件」，React Compiler 随即跳过宿主组件（铁律 1 的静默退化）——lint 会报，但**如果你在报之前就提交了**，症状是「没有报错，只是这个组件不再被优化」。修法：render-prop 提到**模块级函数**（`DocChatSidebar` 的 `renderGuide` / `folder-icons.tsx` 的 `FolderGlyph` 是先例） |
| **`const Icon = map[key]; <Icon/>` 让整个组件不再被优化** | `react(no-unstable-nested-components)` 判它「渲染期定义组件」，React Compiler 随即跳过（铁律 1 的静默退化）。渲染时直接调用返回的组件函数，或把组件表提到模块级（`FolderGlyph` / `renderSwitcherIcon` 的写法） |
| 组件没变快 | React Compiler 静默跳过了这个组件，且无任何提示。常见触发：抑制了 React 规则（铁律 1）、ref 声明在使用它的 effect 之后（`react-compiler(Immutability)` 警告）、渲染期读写 ref（`react(refs)`）——参与渲染的值用 state，只在事件处理器里读写 ref。保持 `logDiagnostics: true`；改代码结构而不是 disable |
| 类型对不上 | `^0.145.0` 这类 peer 范围对 0.x 版本意味着 `>=0.145.0 <0.146.0`——装最新版会报 unmet peer，锁到同一个小版本系列 |
| 生产启动报错 | workspace 包（`@mimir/shared` / `core` / `tokenizer` / `plugins/*`）以源码发布，Node 不执行 node_modules 里的 TS（`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`）——必须由使用方编译进产物（前后端都交给 Vite，见 D-023 / D-033）。把任何一个标成 external 就是这个症状，而**本地开发完全正常** |
| 改设置看起来没生效 | 值被环境变量压住了，或保存请求没发出去。设置页必须如实显示**来源**（界面/环境变量/默认），且保存是显式动作而非 `onBlur`——绑定在 blur 上的保存实测不触发，而界面上值看着是改了的 |
| **本地模式（D-100）点进去却要登录** | 令牌的**名字**在两处：桌面宿主写 cookie（`main.ts`）与服务端读 cookie（`services/local-mode.ts`），走 shared 的 `LOCAL_TOKEN_COOKIE` 常量；宿主忘了注入（`injectLocalCookie`）或 env 写成 `true`（服务端只认 `'1'`）都表现成「本地模式却看到登录页」——不报错。服务端「开了本地模式但没令牌」直接启动报错，绝不降级成「有开关就放行」。改这两处前先看 `docs/TECH.md` §14.6 的表 |
| 当天发布的依赖被拒 | pnpm 12 的供应链策略——锁到上一个稳定版本 |
| 无头截图里浮层看起来透明 | 动画冻结——只是截图问题，真实浏览器正常 |
| oxlint 的历史规则误报 | `react-in-jsx-scope`（React 17+ 的历史遗留）与 `import/no-named-as-default`（Tiptap 包同时有 default 与 named 导出）——都关掉，统一用 named 导入 |
| oxfmt 把中文表格越排越乱 | 列宽按字节算——oxfmt 排除 `**/*.md` |
| node_modules 里出现没声明过的包 | `@vitejs/plugin-react` 的 optional peer 被 pnpm autoInstallPeers 自动装了——不是依赖没删干净 |
| 照抄 Vite 文档的 `build.rollupOptions` | Vite 8 里它只是 `rolldownOptions` 的别名（已标 deprecated）。新配置一律用 `rolldownOptions` |
| 测试报「找不到模块」而构建正常 | vitest 与 vite 各有一份配置，别名只在一边配了。别名定义在 `alias.ts`，两个配置都从它取 |
| 改了样式文件，报错指向一句中文注释（`Expected a semicolon`） | 反引号在 createStyles / createGlobalStyle 的 css 模板串里**直接终止字符串**——注释里也不行，整段样式变非法 TS，而改的人只是往注释里加了一对强调用的反引号。模板里一律不写反引号，强调用「」或 `**`。机器守：`scripts/check-style-backticks.mjs` 逐行配对扫描（正则写法抓不到，见该脚本注释；**加断言后要用注入验证它能红**——第一版就是永远绿的）。这个坑咬过三次（`StatsSection.style.ts` 两次、`styles/global.ts` 一次） |

---

## 文档地图

细分的「按问题找」在 [`docs/INDEX.md`](docs/INDEX.md)（唯一一份，这里不重复）。
速查：

| 你要动的地方 | 入口 |
|---|---|
| 产品边界、里程碑 | `docs/PRD.md`（§1 非目标、§4 功能范围） |
| 技术设计、数据模型、插件接缝、部署 | `docs/TECH.md` |
| 视觉与交互的值（实测对比度） | `docs/DESIGN.md` |
| 选型证据与被否决的方案 | `docs/RESEARCH.md` |
| 历史决策（为什么这样选） | `docs/DECISIONS.md`（顶部有分组索引） |
| 交互原型 | `output/index.html`（双击打开） |
| **区域规则与坑表** | 各级 `AGENTS.md`——完整嵌套地图见「会静默出错的地方」的路由表 |

---

## 当前进度

| | 状态 |
|---|---|
| 设计 | 定稿 |
| 数据库 | **双后端**（D-045）：服务器 = Postgres 17 + pgvector（Docker）；本地开发 / 桌面端 = SQLite（免 Docker，`DATABASE_URL` 未设置时默认） |
| 后端 | M0 完成：文档 CRUD、目录、标签、双链、检索、会话、抓取、问答（流式）、导出。**首启播种**（D-085）：第一次建号时自动建一个「开始使用」知识库 + 一篇《mimir 产品说明》；已有实例由启动时补齐，靠 `seed.defaultContent` 标记保证只播一次 |
| 前端 | **界面代码抽成 `@mimir/renderer`**（D-103）：浏览器（`apps/web`）与桌面渲染进程各是一个薄壳，平台差异走 Context + 判别联合（D-104）。两栏界面（D-047）：导航 + 主区（知识库页 / 详情两态）、会话导航、对话视图、命令面板、抓取对话框、设置页。**知识库是内容的主容器**（D-079）：侧栏平铺列知识库，进子文件夹靠「文档 / …」面包屑；没有「全部文档」页（`scope=all` 落到第一个知识库）；收集入口是知识库页的「添加文档」下拉（上传文件 / 上传文件夹 / 网页抓取 / 直接编辑，都带当前目录）。**四种编辑器共用一套外壳**（D-054：上工具条 / 中编辑区 / 下状态行，铺满容器，头部单行） |
| 桌面端 | **两种使用方式**（D-100）：**本地使用**（数据在本机 userData、免登录——入口是宿主启动时注入的本机令牌，不是无鉴权）/ **连接服务器**（纯壳，加载自部署地址）。首启选择页是 `apps/desktop/src/renderer/setup.html` 的第二个构建入口，之后可在设置 › 客户端或原生菜单里「更换使用方式」；选择存在 `<userData>/desktop-config.json`，切换不迁移数据、不删本地数据。**窗口边框**（D-094 / D-105）：本地模式 Win/Linux 自绘控件、mac 保留系统红绿灯；云端模式加载 Web 构建，使用系统边框与原生菜单。**Electron 载体**（D-046）：窗口加载宿主或远端地址（cookie / SSE / Range 原生可用）。**三段由 electron-vite 构建**（D-103：main / preload / renderer，渲染进程不再从 `apps/web/dist` 取）。**品牌**见 D-091：图标由 `scripts/make-icons.ts` 从 favicon 生成、`executableName: mimir`、Linux 用 `setDesktopName('mimir.desktop')` 定 WM_CLASS |
| 文件 | **多格式上传已落地**（`docs/TECH.md` §13、D-044）：任意格式的原件入库、列表、按格式预览、下载、替换、随导出打包；文本 / HTML / Office / **PDF** 的正文可搜（M1-E，D-084）。**RSS 订阅已落地**（设置 › 订阅；收进来的文章与手动抓取同形状） |
| 六种格式 | **GenOffice 支持的六种都能预览与编辑**（D-056 / D-057）：docx 全文、xlsx 单元格、pptx 文字、html 源码、markdown（即笔记）、pdf 页面级（旋转/删除/调序）。PDF 的**改文字**未做——那要 PDFium 的 WASM，见 TECH §15.12 |
| Office | 三种格式的原件层都能看、**都能改**：**docx 全文编辑**（分页视图 + 工具栏；D-049）、**pptx 改文字**（渲成 SVG；D-051/D-052）、**xlsx 改单元格**（D-050/D-053）。三者保存都是**补丁式**（改一处不重排整篇 XML）。**界面在包里**（`packages/office/src/shell` + `src/editors`），markdown 笔记与它们同壳（D-054） |
| 检索与 AI | **M1 完成**（D-084）：分块 + 向量化（PG=halfvec HNSW / SQLite=sqlite-vec）、混合检索（关键词 + 子串 + 向量，加权 RRF）、引用指回分块真实偏移（相邻合并 + 每篇上限）、AI 摘要 / 标签建议（「⋯」菜单） / 内联改写（选区工具条）。分块与嵌入状态在设置 › 检索；「待嵌入 N 段」如实显示，补嵌入分批可重入 文档页「问 AI」侧栏与大纲语雀式布局见 D-087 |
| 下一步 | M2（PRD §4）：浏览器扩展、GitHub Star 同步、划线与注释、移动端速记。Postgres 路径的向量迁移（`drizzle/0010_chunks.sql` 的 HNSW）部署时首次跑一次确认 |

不确定从哪开始就问，不要猜。
