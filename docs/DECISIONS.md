# 决策记录

按时间追加。**只记有实质取舍的决定**——那些「换个人来做可能选得不一样」的。

格式约定：

- **背景**：当时面对什么问题
- **决定**：选了什么
- **否决**：还考虑过什么、为什么不选（**这一节最重要**）
- **影响**：这个决定约束了后面什么

**被取代的决定不要删。** 标上「已被 D-0xx 取代」并保留原文——
否则后人会重新踩一遍已经踩过的坑。

---

## D-001 中文检索用 jieba 预分词

**背景**：Postgres 对中文没有词边界概念。`simple` 配置会把「组件性能优化」
当成一个 token，用户搜「组件」永远搜不到。

**决定**：写入时用 `@node-rs/jieba` 分词，以空格连接存进 `documents.search_text` 列，
在该列上建 GIN 表达式索引。查询串用同一套分词切分后交给 `plainto_tsquery`。

**否决**：

| 方案 | 为什么不用 |
|---|---|
| `Intl.Segmenter`（Node 内置） | 实测把「组件」切成「组/件」、「纪录片」切成「纪录/片」，质量不达标。零依赖但不可用 |
| ParadeDB 的 `chinese_lindera` | 一个索引同时给 BM25 排序和中文分词，比本方案干净。但 Community 版是 **AGPL-3.0**。个人自用无约束，但会成为一个需要解释的依赖 |
| 自建带 zhparser 的 Postgres 镜像 | 能省掉 Node 侧分词，但要多维护一个镜像构建，SCWS 词典还要单独装 |
| `pg_trgm` 直接作用于原文 | 实测相似度只有 0.32，且没有词边界概念 |

**影响**：所有全文索引都必须建立在这个列上。查询侧必须用同一套分词，
两边不一致会静默搜不到。子串兜底通道是分词切错时的补救，不是替代。

---

## D-002 AI SDK 选 TanStack AI

**背景**：候选三个——`@earendil-works/pi-*`、`@deepseek-ai/dsh`、`@tanstack/ai`。

**决定**：用 `@tanstack/ai` 0.55.0。

**否决**：不是因为另外两个质量差，而是**它们不是同一类东西**。

| 方案 | 实测情况 |
|---|---|
| pi-agent | 是 CLI/TUI 编码 agent 工具箱。`pi-ai` 本身不错（支持国产模型、有成本追踪），但**没有 embedding、没有 rerank**，也没有任何 Web 应用侧脚手架。README 明确说「不包含权限系统」——为本地命令行场景设计 |
| deepseek-harness | **是完整应用不是库**。主包只有 `bin` 字段，没有 `main`/`exports`。架构是 Cordis 插件树，全部子包 `0.0.1-rc.1`。README 明确写着「developer preview，将有不兼容变更」 |
| TanStack AI | 唯一为「嵌入到自己的应用里」设计的。能力拆成可 tree-shake 的 activities，含本项目需要的 chat / embed / rerank |

**影响**：0.x 版本 + 周更，锁死精确版本。两个已知边界见 `TECH.md` §5.2
（`openaiCompatible` 只覆盖 chat；rerank 适配器路径写死）。

---

## D-003 RAG 不引入框架，检索层自建

**背景**：调研了三个层次的方案。

**决定**：检索层就是约 100 行 SQL 加一个分词函数，模型调用交给 TanStack AI。

**否决**：

| 方案 | 实测情况 |
|---|---|
| RAGFlow | 91k★，Apache-2.0。但最低 **4 核 / 16GB 内存 / 50GB 磁盘**，编排拉起 ES/Infinity + MySQL + MinIO + Redis + NATS + ClickHouse。引用是它自己 UI 里的引用 |
| Dify | 156k★，修改版 Apache **含商业限制条款**。是平台不是库 |
| Mastra RAG | 分块器与 reranker 不错，但 `@mastra/core` 是 peer 依赖（31 个直接依赖），`@mastra/pg` 会接管向量存储，与自己的 Drizzle schema 形成两个真相源 |
| LlamaIndex.TS | `@llamaindex/postgres` 是 **0.0.66**，依赖 `pg-promise`——又一个 PG 驱动并存 |

**共同问题**：它们都想接管文档与分块的数据模型，而本项目必须让引用能指回自己的表。

**影响**：检索质量完全由自己负责。参数（RRF k、各通道权重）暴露在设置页里，
最终要按自己的语料调。

---

## D-004 布局三栏，导航会话优先

**背景**：原型阶段比较了三种布局与两种导航结构。

**决定**：三栏（左导航 / 中列表 / 右内容），左栏会话历史排在文档入口之前。

**否决**：

- **单栏 + 强命令面板**：最专注，但发现性差——不记得存过什么时连「翻一翻」都做不到。
  而「想不起存过什么」正是个人知识库的头号问题
- **文档优先导航**：写笔记是主要活动，听起来更合理。但用户明确选了会话优先

**影响**：这个决定改变了**中栏的语义**，不只是排序：

| 模式 | 中栏 | 右栏 |
|---|---|---|
| 对话 | 本次引用了哪些文档 | 对话 |
| 文档 | 文档列表 | 阅读 / 编辑 |

会话优先意味着「问答」是主场景，那么**「它读了什么」就该和「我有什么」一样可见**。

---

## D-005 编辑器用所见即所得，接受非无损

**背景**：Tiptap 会按自己的规范重写 Markdown。实测表格会被补齐列宽。

**决定**：只用所见即所得，不做源码模式。

**否决**：源码 + 预览分栏（对技术内容更精确，但写的时候要脑内渲染）。

**关键实测**（`apps/web/src/editor/drift.test.ts`）：

```
输入      | 1 | 2 |
首次保存  | 1   | 2   |   被整理成编辑器的规范形
之后每次  | 1   | 2   |   不再变化
```

**不是无损的，但是幂等的。** 这个区别决定了适用边界：

- **可以**作为唯一编辑器——内容不会逐次劣化
- **不要**用 Obsidian / VS Code 改同一批文件——两边各有一套规范形

正文、标题、列表、代码块、引用、链接往返逐字节一致；表格是唯一被重排的结构。

---

## D-006 删掉 AI 侧栏

**背景**：侧栏原本是「不离开阅读位置就能问当前文档」。

**决定**：删掉。AI 只有一个入口——主视图对话。

**理由**：侧栏被两头夹掉了。

- 问某一段 → 内联工具条的「就这段提问」，锚定选中内容，更精确
- 问整篇 → 主视图对话 + 范围选「当前文档」

侧栏的范围比内联宽、比主视图窄，两边都不如。代价是 392px 屏幕和一个要维护的面。

**删除后补的三件事**（不做这些会让「问当前文档」比以前更难）：
文档工具条的「问 AI」带上下文进主视图；内联「就这段提问」预填引用；
**「返回对话」入口**——从对话点引用跳去文档后，没有它用户会以为对话没了。

---

## D-007 插件架构指内部接缝，不是外部市场

**背景**：「插件架构」在实践里指向两种成本差一个数量级的东西。

**决定**：只做内部接缝（代码按接缝组织，加实现＝加文件）。

**否决**：外部插件市场（公开 API、版本化、兼容承诺、沙箱、权限模型）。
那是为有生态野心的产品准备的，对个人项目会引入比它解决的问题更多的负担。

**推进方式：先别造框架。**

四条接缝的边界已定（capturer / parser / leg / provider），但只有 `leg` 有
两个实现，所以只有它抽了接口。**规则：等第二个实现出现，从共同点反推接口。**
凭想象设计接口八成会设计错。

---

## D-008 共享包以编译产物发布

**背景**：`@mimir/shared` 最初以源码形式发布（`exports: "./src/index.ts"`）。
开发时正常（tsx/vite 会处理），生产容器启动直接报：

```
ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING
```

Node 拒绝从 `node_modules` 里剥离 TypeScript 类型。

**决定**：编译到 `dist` 以产物发布，构建顺序固定为 shared → web/server。

**影响**：这是**在 Docker 构建时才暴露**的问题——本地开发完全正常。
教训：声称能部署就得真的构建并运行一次。

---

## D-009 开启 React Compiler

**背景**：编辑器组件持有大量状态，手写记忆化的依赖数组很容易写错。

**决定**：通过 `@vitejs/plugin-react` 的 `compiler` 选项开启，并保留
`logDiagnostics: true`。

**否决**：`babel-plugin-react-compiler` 与 `@rolldown/plugin-babel`。
它们是插件的 optional peer，但属于**另一条路径**（单独导出的
`reactCompilerPreset`）；`react({ compiler: true })` 只动态导入
`oxc-transform-react`。

**验证方式不是读文档，是逐字节对比**：删掉那两个包的声明前后，
构建产物完全一致（805393 字节，`cmp` 无差异）。

**影响**：不要手写 `useMemo` / `useCallback` / `memo`；不要抑制 React 规则
（会让编译器跳过整个组件）。

---

## D-010 工具链用 oxc，版本集中管理

**背景**：需要 lint + format，以及跨包版本一致性。

**决定**：oxlint + oxfmt；依赖版本进 pnpm catalog。

**否决**：

- **ESLint + Prettier**：lint 跑得慢的直接后果是没人跑。oxlint 单命令跑全仓约 100ms
- **oxfmt 格式化 Markdown**：它按字节算列宽，中文表格会被补齐得更难读。
  排除 `**/*.md`——Markdown 是内容不是代码

**catalog 的主要价值不是去重**，而是让「必须版本一致」成为结构保证：
`@tiptap/*` 有 10 个包，版本错开会冲突 ProseMirror schema，
而这类错误报得晚、很难查。

**补充（同 D-011 同批）**：`.agents/**` 也排除出 oxfmt。那是 vendored 的第三方
skill（由 `skills-lock.json` 锁定哈希），`.claude/skills`、`.zcode/skills`、
`.trae/skills` 都只是指向它的符号链接。格式化它们会让下次同步 skill 时冲突，
而且它们不是我们的代码——和排除 `**/*.md` 是同一类判断：排除内容，不排除代码。

---

## D-011 设计规范以 Ant Design 为底，但覆盖语义色与文字阶

**背景**：前端已有 antd 6 与一个交互原型（`output/index.html`），但两边各有一套
视觉值——原型有自己手挑的灰阶和状态色，antd 有它的默认值。`main.tsx` 里只配了
主色/圆角/字号三项，其余全走默认。需要一份统一的设计规范，否则每做一个页面
都要重新决定一次「这个灰用多少」。

**决定**：以 Ant Design 的体系为骨架（4px 网格、字体阶、圆角语义、动效三档、
三层表面模型、主色 `#1677ff`），但**覆盖两处**：

1. **语义色改用原型那套深阶色**，且以叶子 token 形式覆盖
2. **文字阶改为不透明色**（`#1c1c1c` 系派生 → `#5c6570` / `#68707c`）

**否决**：

| 方案 | 为什么不用 |
|---|---|
| 全盘接受 antd 默认 | 实测它的语义色在自家浅底上不达 AA——successText on successBg 只有 **2.21:1**、warning **1.83:1**、error **2.99:1**。这些色是给图标和边框设计的，不是给文字。三级文字（`rgba(0,0,0,.45)`）也只有 2.75:1 |
| 替换 antd 的**种子色**（`colorSuccess: '#137333'`） | 实测会派生 `colorSuccessBg: '#a8b3aa'` 这种灰绿脏色。派生算法假定种子是亮色，改种子会让整套派生色一起跑偏且方向不可预测 |
| 不用 antd，自建一套 token | 组件库已经定了（`apps/web/AGENTS.md`：样式走 antd token，不新引入 CSS 方案）。自建的 token 与 antd 的派生体系并存，等于两套真相 |
| 照搬原型 CSS 变量原文 | 原型是单文件手写 CSS，没有主题体系也没有深色模式的余地；它的**值**是对的，**结构**不能搬 |
| 只覆盖主色，其余留默认 | 那就等于放弃了「状态必须看得见」这条原则（`PRD.md` §5.9）。一个看不清的「保存失败」比不提示更糟 |

**关键实测**：覆盖成叶子 token 后，四组语义文字色对全部达标——
成功 5.24:1、警告 4.58:1、错误 5.48:1、信息 5.78:1。文字阶在四种底
（容器/列表/导航/布局）上也全部 ≥ 4.5:1。这些数字进了
`apps/web/src/theme/design.test.ts`，会被真正计算而不是写在文档里。

**在真实浏览器里验证时又发现三处**（只看代码看不出来）：

1. **`<App>` 包装层会断掉 `height:100%` 的链条**——`.ant-app` 默认没有高度，
   登录卡片因此不垂直居中，`Layout height:100%` 只撑到内容高度。不报错，
   只是布局不对。已在 `global.css` 补 `#root > .ant-app { height: 100% }`
2. **antd v6 的 `<Tag bordered={false}>` 已废弃**，正确写法是 `variant="filled"`
3. **列底色定义了却没用上**——规范说好的三栏靠底色区分，但页面里没人引用那两个
   变量。补齐后才真正生效（实测 `#fbfbfc` / `#fcfcfd`）

**影响**：

- `theme/tokens.ts` 是 token 的唯一真相来源，`main.tsx` 只负责接线
- **不要替换 antd 的种子色**，只覆盖叶子 token（原因见上）
- **不要把 `colorPrimary` 当文字色用**——它在选中态浅底上只有 3.61:1。
  文字角色走 `colorLink: #0958d9`（≥ 5.41:1）
- 字体栈只有一处定义（`global.css` 的 `--mimir-font-sans`），`tokens.ts` 用
  `var()` 引用它，避免两处字体栈漂移
- **来源徽标不要用 `<Tag color="green">` 预设色**——预设走 antd 自己的调色板，
  对比度不由我们控制。色对收在 `components/DocumentBadges.tsx`
- 改了 token 导致 `design.test.ts` 红了，**改设计不改断言**

**未做的部分**：深色模式。antd 有 `darkAlgorithm`，但列底色、内容区排版、
来源徽标都需要在深色下重新校准。半成品的深色模式比没有更糟，仍列在
`PRD.md` §6 待决项。

**后续（D-012）**：本条的**视觉决定全部不变**（不换种子色、文字走 `colorLink`、
语义色成对、来源徽标不用预设色）。变的是落地方式——样式从手写 `global.css`
改为 antd-style 的 `createStyles` / `createGlobalStyle`，因此文中「字体栈定义在
`global.css` 的 `--mimir-font-sans`」与「列底色是 `--mimir-*` 变量」两处已过时：
值相同，位置改到 `theme/tokens.ts` 与 `theme/customToken.ts`。

---

## D-012 样式方案采用 antd-style，取代手写 CSS 文件

**背景**：D-011 定下「以 antd token 为底」，但落地方式是一份手写的
`styles/global.css` 加页面里的内联 `style`。这套做法在页面只有两三张时看不出
问题，往后会分叉出三类麻烦：

1. **内联 style 越来越多**。`routes/docs.tsx` 一个文件里就有九处内联样式，
   条件态（选中项）只能写成三元表达式，颜色和布局混在 JSX 里
2. **`:root` 与组件之间要来回倒变量**。字体栈、列底色定义在 `:root`（因为
   `--ant-*` 注入在 antd 的 DOM 子树上，`:root` 拿不到），组件再 `var()` 引用。
   一个值在两处出现，改一处忘一处就漂了
3. **没有类型**。`var(--ant-color-text-tertiary)` 拼错是运行时静默失效——
   颜色不对但不报错

**决定**：引入 antd-style（`createStyles` / `createGlobalStyle`），把样式写进
组件旁边的 `.style.ts`，token 从 `createStyles` 的入参直接取。

四件事随之调整：

1. **字体栈从 CSS 变量变成 TS 常量**（`tokens.ts` 的 `FONT_SANS` / `FONT_MONO`）。
   原先用 `var(--mimir-font-sans)` 是为了让 `:root` 与 antd token 共用一份值；
   现在 `createGlobalStyle` 能直接读 theme，间接层没有存在意义了
2. **列底色、行内代码色、高亮底改走 `customToken`**，不再有 `--mimir-*` 变量
3. **内容区排版（`.note-body`）搬进 `NoteEditor.style.ts`**。它管的是编辑器渲染
   出的裸 DOM，是一个组件的样式，就该有作用域
4. **provider 栈抽成 `MimirProvider`**，让守门测试能渲染和线上完全一样的结构

**否决**：

| 方案 | 为什么不用 |
|---|---|
| 保持现状（global.css + 内联 style） | 见背景三条。现在改的成本是 6 个文件，等页面铺开之后再改成本是全部文件 |
| Tailwind | 与 antd token 体系是两套心智：Tailwind 的 `bg-blue-500` 不认识 `colorPrimaryBg`，要用就得把 token 映射成配置，从此主题值有两处真相。且 D-011 已定「不引入第二套方案」 |
| CSS Modules | 能用 token，但要靠 `var()` 字符串，回到「拼错不报错」。而且它解决的是「作用域」这一个问题，antd-style 同时给了类型、token 访问和动态主题 |
| styled-components | 多 10KB+ 体积（antd-style 官方对比数据）；且它把样式绑在组件上用，而 mimir 大量场景是「给已有 antd 组件加类名」，`createStyles` 更贴 |
| 只迁移页面、不动 `global.css` | 字体栈与列底色会留在 `:root`，`--mimir-*` 与 `customToken` 并存——正是要消掉的那种两处真相 |

**关键实测**（`design.test.ts` 里会真跑）：

- **`ConfigProvider` 内层不能再传 `theme`**。antd 的 `useTheme` 会在传入 theme 时
  用新的 `useId` 重算 `cssVar.key`，`--ant-*` 的变量名随之改变（实测类名从
  `.mimir` 变成 `.css-var-r1`）。不传时 antd 直接继承外层 theme 的 key。
  **这是静默的**：不报错，只是所有引用变量的地方颜色不对
- **`colorFillSecondary` 是半透明的 `rgba(31,35,41,0.06)`**，算行内代码对比度时
  必须先合成到底色上。不合成直接算会得到 2.86:1 这种把黑色当底色的假结果；
  合成到白底实际是 4.93:1
- **`createStyles` 的嵌套选择器能穿透 Tiptap 渲染的裸 DOM**。实测 `.tiptap` 的
  `h1` / `pre` / `th` / `code` 全部命中且带作用域，`createGlobalStyle` 里的
  `#root > .${prefixCls}-app` 高度链也正常注入

**影响**：

- **组件样式一律走 `createStyles`**，不新增 `.css` 文件，全局样式只有
  `styles/global.ts` 一个出口
- **`ConfigProvider` 只负责 locale**，主题归 `ThemeProvider`——重复传 theme 会
  静默换掉变量名
- **`createGlobalStyle` 里拿不到 `--ant-*`**，要用 `${(p) => p.theme.xxx}` 取主题值
- **覆写 antd 组件内部结构时用 `${prefixCls}`**，不写死 `.ant-`
- 字体栈的唯一真相来源改为 `tokens.ts` 的 `FONT_SANS` / `FONT_MONO`
- 列底色等四个值的唯一真相来源改为 `theme/customToken.ts`

**顺带修的**：`vitest.config.ts` 原先没有 `@` 别名（只有 `vite.config.ts` 有），
一旦测试要 import 用 `@/` 的模块就会失败。现在两个配置从 `alias.ts` 取同一份定义。
