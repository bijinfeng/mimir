# apps/web/AGENTS.md

前端的区域规则。根目录的 `AGENTS.md` 仍然适用，这里只写这一层特有的。

---

## 这一层的结构

```
src/
├── main.tsx         挂载点。只组装 provider，不放具体配置
├── router.tsx       路由实例（routeTree.gen.ts 是生成物，不要手改）
├── routes/          页面。根路由承担鉴权守卫，_app.tsx 是三栏骨架
├── components/      可复用组件；document/ 是文档页的子组件
├── editor/          Tiptap 扩展配置与保真测试
├── theme/           设计 token、自定义 token、provider 与守门测试
├── styles/          全局样式（唯一的全局出口）
└── lib/             API 客户端 / Query 配置 / 路由 context / 对话包的宿主适配
```

**文件别太长。** 一个组件文件超过约 300 行就说明它该拆了。
对话那一大块**已经拆成一个包**（`@mimir/chat`，D-099），宿主里只剩适配层；
`components/document/` 里的文档面板也是按「一个独立关注点一个文件」分的。
拆的依据是「它是不是一个独立的关注点」，不是行数本身——行数只是信号。

**两个前端包住在 `packages/` 里**（`@mimir/office` 与 `@mimir/chat`）：
它们以源码发布（`exports` 指 `src/index.ts`），由 Vite 编进本站产物。
「壳与渲染归包、方言与取写归宿主」是两者的同一条边界——office 是
`EditorIo`（取字节 / 写回），chat 是 `ChatIo`（建会话 / 读历史 / 存笔记 /
跳转）加一个数据槽（`composerStatus`）。包内 import 不到本目录的任何东西，
这是结构性的，不是约定。

`routes/` 下的非路由文件要用 `-` 前缀（`-foo.ts`），否则 TanStack Router
的生成器会警告「这个文件没有导出 Route」，`pnpm dev` 时一直刷屏。

---

## 鉴权

守卫在 `routes/__root.tsx` 的 `beforeLoad`，**不在每个页面各写一遍**。

新增页面时不需要加守卫——但如果你要放行某个路径（比如回调页），
改的是那一处，而不是在页面里绕过。漏一个未鉴权页面在自托管暴露公网时
等于把整个知识库交出去。

### 本地模式（D-100）下界面按服务端事实分支

桌面客户端的「本地使用」模式下没有登录——进入方式由客户端持有（宿主注入的
本机令牌）；守卫读到的 `get-session` 是服务端合成的会话，所以**这一层不需要
任何分支**。

需要分支的是「账号语义」那几处，判据一律是 `RuntimeConfig.localMode`
（服务端回传，**不要**用 `isDesktopShell()` 推——桌面壳也可以在云端模式下，
而浏览器里访问本地端口也会是本地模式）：

- 账号分区与左导航菜单：本地模式**不出现登出**，账号分区不显示邮箱
- 名称的保存端点：本地模式走 `api.local.updateProfile`（Better Auth 的
  `update-user` 要求真实会话，那条路在本地模式下必然失败）
- 登录页：本地模式显示「回桌面客户端使用」，而不是一个填不对的表单
- 设置页的「客户端」分区只在桌面壳存在（`isDesktopShell()`），
  浏览器里连 tab 都不渲染；URL 里带着 `?section=client` 时落回默认分区

---

## React Compiler

已开启。它会在构建期自动插入记忆化，所以**不要手写 `useMemo` / `useCallback` / `memo`**——
写了也不会更差，但会让人以为需要它们。

两条必须遵守的规则：

### 不要抑制 React 规则

抑制 hook 规则会让编译器**跳过整个组件**，而且不报错。正确做法是改代码结构。

### 只读一次的初始值用 ref 承接

```ts
// ✗ 放进依赖数组 → 每次保存回写都重建实例（编辑器会丢光标）
// ✗ eslint-disable 排除 → React Compiler 跳过整个组件
// ✓ ref 快照：符合 Rules of React，且只在挂载时取一次
const initialBodyRef = useRef(doc.body)
useEffect(() => {
  const editor = new Editor({ content: initialBodyRef.current, ... })
  return () => editor.destroy()
}, [])
```

**ref 的声明顺序必须在用它的 effect 之前**，否则报
`react-compiler(Immutability)` 并静默跳过优化。

想看编译器有没有跳过某个组件，把 `vite.config.ts` 的 `compiler.logDiagnostics`
打开构建一次。

---

## 对话：不要手搓状态，也不要手搓 UI

对话是这类应用里最容易写错的一块：流式 token 的拼接顺序、并发发送的排队、
中断后的清理、半截 markdown 的渲染与转义。这些**都别自己写**——整块面板
（消息区 / 检索过程 / 引用 / 失败卡 / 输入区 / 状态层）在
**`packages/chat`（`@mimir/chat`）**里，宿主只做适配。

| 层 | 用什么 |
|---|---|
| 消息状态、流式接收、队列、停止、滚动跟随 | `@assistant-ui/react` + `@assistant-ui/react-ag-ui`（包内 `runtime/use-mimir-runtime.ts` 是唯一入口） |
| 消息渲染 | 包内的 `parts/*`（正文走 `@tanstack/markdown`） |
| 宿主侧 | `lib/chat-io.ts`（动作，实现 `ChatIo`）+ `lib/use-chat-composer-status.ts`（数据槽）+ `components/chat/ChatThemeBridge.tsx`（字号与 gutter 变量）+ `routes/_app.chat.tsx` / `components/document/DocChatSidebar.tsx`（两个宿主） |

**宿主不要做的事**（做了就绕开包、两处必然漂移）：

1. **不要在本层碰流式状态**（消息、队列、停止、重试）——那是包的内部，
   旧实现里 `use-mimir-chat.ts` 那一层随 D-099 一起删掉了
2. **不要给对话写 `.ant-*` 覆写或再挂一套主题**：包内 `createStyles`
   自动继承本站的 token 与外观。要改观感，改包内样式；要改字号，
   改 `ChatThemeBridge` 传下去的值（它从 `theme/tokens.ts` 的 `FONT_SIZE` 取）
3. **render-prop 必须传模块级函数**：`ChatPanel` 的 `guide` / `guideActions`
   收的是渲染函数，写成内联箭头会让 `react(no-unstable-nested-components)`
   判它是「渲染期定义组件」，React Compiler 随即跳过**宿主**组件
   （`DocChatSidebar` 的 `renderGuide` / `renderQuickAsks` 是先例）

**两条必须踩对的契约**（与搬迁前同源，理由变了但结论没变）：

1. **会话 id 走请求体（`forwardedProps`），不进 agent 的连接地址。**
   地址一变换的就是 agent，而重建会把正在进行的流切断
2. **切换会话靠宿主的 `key` 重挂载，自己刚创建的会话不重挂**：
   `_app.chat.tsx` 的 `panelKey` / `ownedId` 就是这条——新会话的第一问会
   「建会话 → 写 URL」，如果 key 直接跟着 URL 的 id 走，这次导航会把刚挂载的
   对话体卸载重建，正在接收的流全丢（实测症状：提问后右栏什么都不显示，
   而消息其实已经落库）。打开历史会话由包的历史适配器出骨架屏，
   宿主**不再**需要「数据没到位就不许挂载」的 `messagesLoading` 硬契约

**历史读取失败的拦阻仍在宿主**（`_app.chat.tsx` 的 `LoadError`）：用户点开
一个旧会话，看到的若是「问点什么」的全新空态，那比报错更吓人——看起来像
对话被清空了。包只把 `io.loadConversation` 返回的 `null` 当空会话放行，
「读不到该怎么说」是宿主的产品判断。

包内约定（主题变量、data part、引擎的两个反直觉点、测试怎么跑）见
`packages/chat/AGENTS.md`——改对话前先读那一页。

---

## 编辑器

Tiptap 的 markdown 往返**不是无损的，但是幂等的**——首次保存会把内容整理成
编辑器的规范形，之后不再变化。改 `editor/extensions.ts` 后必须跑
`pnpm test`，`drift.test.ts` 会验证幂等性没被破坏。

**扩展不要重复引入**：`StarterKit` 已经内置 `codeBlock` 与 `link`。
重复引入会触发 `Duplicate extension names` 警告，且配置会被其中一份覆盖——
不报错，只是行为不对。

**实例管理交给 `@tiptap/react` 的 `useEditor`，不要 `new Editor()`。**
它把每个回调都包一层、从 `options.current` 读，所以回调里直接用最新的
props/state 就行；手写版需要三个「靠注释提醒自己」的约束（ref 承接回调、
ref 声明顺序、初始值用 state 而非 ref），用它之后全部消失。
`deps` 传 `[]` 时它只 `setOptions` 不重建实例，所以保存回写不会丢光标。

**内联工具条用官方的 `BubbleMenu`**（`@tiptap/react/menus`）：
跟随选区、滚动重算、边缘翻转、点工具条不取消选区都是它处理的。

**编辑器外壳在 `@mimir/office` 里**（D-054）：`NoteEditor` 现在是一层适配
——它只把保存包成 `onSave`、注入方言与排版类、把「立即保存」交给
`lib/unsaved` 的守卫。壳（工具条 / 状态行 / 布局）与另外三种格式共用同一份
实现，所以四种编辑器长得一样不靠约定。

**Tiptap v3 的 `useEditor` 默认不在事务上重渲染**
（`shouldRerenderOnTransaction: false`，为性能）。所以工具条里**不能**在渲染期
直接读 `editor.isActive(...)`——它会停在「打开文档那一刻」的值，按钮不亮也
不报错。要用 `useEditorState` 订阅（`MarkdownEditor` 的 `MarkdownToolbar`
就是这么写的）。

---

## 调后端

API 客户端在 `lib/api.ts`。三条约定：

1. 一律 `credentials: 'include'`——鉴权走 cookie
2. 服务端错误外壳统一是 `{ error: { code, message } }`，抛 `ApiRequestError`，
   调用方只需要 catch 一种形状
3. 请求/响应的类型从 `@mimir/shared` 来，**不要在前端重新定义一遍**

改了 API 契约要先改 `packages/shared`，那是前后端唯一的真相来源。

**multipart 走 `sendMultipart`，不要用 `request()`**——后者会强制
`Content-Type: application/json`，而 multipart 的 boundary 必须由 fetch
自己生成（手写它会与实际的 body 不一致）。上传与替换原件都是这么发的。

---

## 文件类文档的界面（`docs/DESIGN.md` §8.16、`docs/TECH.md` §13）

上传件与笔记 / 抓取的资料**共用列表形态与归类动作**，只有正文区多一个分支：

| `kind` | 正文区 |
|---|---|
| `note` | `NoteEditor`（唯一可编辑的） |
| `file` | `FilePreview`（**直接看原件**，D-054） |
| 其余 | `MarkdownBody`（只读渲染） |

**`FilePreview` 没有「正文 / 原件」切换**（D-054 去掉的）。分派判据是
「能不能真的看到东西」：有专用查看器 → 原件；没有但提取出了正文
（txt / csv / 旧版 doc）→ 正文；两个都没有 → 说明卡片 + 下载。
用 `viewerFor` 分派，不要自己判 MIME——两处各判一次必然有一天不一致。

**六种格式的编辑器都走 `OfficeSourceEditor`**（docx / xlsx / pptx / html /
pdf；markdown 是笔记，走 `NoteEditor`）。它是宿主的适配层，只做两件事：
包 `EditorIo`（取字节 / 写回）、铺主题变量。**加第七种格式时不要新建组件**
——在 `viewerFor` 加一个 kind、在 `OfficeSourceEditor` 加一个分支就是全部改动。

**提取结果没有消失**：它仍然可搜、可被 AI 引用。那是它真正的用途，
不需要在详情里再占一层。

五条容易做错的地方：

1. **正文为空时那第二行必须说明原因**，不能留白。四种原因的措辞由
   `@mimir/shared` 的 `parseSupport()` 派生，列表项与详情面板共用
   `list-helpers.ts` 的 `excerptText()`——**不要在组件里现编一句话**
2. **格式与大小是中性文字，不是徽标**。彩色徽标只给「来源」（`KindBadge`）；
   格式是开放集合，按「一格式一色」走下去每加一种就要多一组色对
3. **查看器加载失败要降级成下载卡片**（HEIC 能通过 MIME 判断但浏览器未必
   渲染得了）。空白在那里等于说「这个文件是空的」
4. **文本类文件的正文用等宽只读，不走 Markdown**。csv / json 里的换行与 `#`
   会被 Markdown 渲染折叠或当成标题——那是主动把内容显示错
5. **所有能编辑的格式走同一个组件**（`OfficeSourceEditor`）：差别在
   `packages/office` 内部（解析与保存路径），宿主只负责取字节与写回。
   分多个分支的话，每个分支都要各自记得传 `onDirtyChange`——漏一个就是
   丢改动的路径
6. **PDF 的资产在 `public/pdfjs/`，不要在别处引**：pdf.js 按**原始文件名**
   取 cmap（`cmaps/Adobe-GB1-0.bcmap`），所以那些文件必须被原样复制、不改名。
   `public/` 是唯一这样的位置。挪走或改成打包器哈希 URL 的症状是**中文 PDF
   整段文字空白**（不是乱码），而它不报错（TECH §15.12）

查看器只用浏览器自带能力（`<iframe>` / `<img>` / `<audio>` / `<video>`）：
pdf.js 那 1MB 换来的是一致外观，而「PDF 批注」这个需求还没出现
（`docs/PRD.md` §1 明确不做非 Markdown 原件的在线编辑）。

---

## 字号：走阶梯，不要写字面量

`theme/tokens.ts` 的 `FONT_SIZE` 是**唯一**的字号来源，九档、每档对应一个
角色（`body` / `item` / `excerpt` / `note` / `meta` / `badge` …）。

```ts
// ✗ 随手写一个值 —— 全仓曾散落过 11 个不同的 font-size
font-size: 13px;

// ✓ 先找角色
font-size: ${FONT_SIZE.excerpt}px;
```

`design.test.ts` 会扫源码拦下字面量（**扫描根含 `packages/chat/src`**——
对话包的组件不在 `src/` 下，不加进那条守卫就把它们静默漏掉了）。
唯一的例外是**图标字形**，必须在行内标注 `非文本` 才放行
（`font-size: 9px; /* 图标字形，非文本 */`）。

包**不能** import 这个模块（它不认识宿主），所以包内写的是
`var(--mimir-chat-font-note, 12.5px)`——值由 `ChatThemeBridge` 从这个
`FONT_SIZE` 填下去。改阶梯时改这里，包里的回退值跟着对齐即可。

理由见 `docs/DECISIONS.md` D-017：字号最容易被随手改，而同一个角色在不同
页面用不同值不会报错，只会让整页看起来不整齐。

---

## 样式

**样式方案是 antd-style（css-in-js）。** 它把「消费 token」和「写样式」合成一件事：
`createStyles` 里能直接读 antd token，产出的还是带作用域的类名。
规范是 `docs/DESIGN.md`，动手前先读它。

```
src/theme/tokens.ts         antd token 的真相来源（含字体栈常量、浅/深两套色）
src/theme/customToken.ts    mimir 自己的 token（antd 没有的语义），浅/深各一套
src/theme/appearance.ts     外观状态（auto / light / dark）与持久化
src/theme/MimirProvider.tsx provider 与全局样式的唯一组装处
src/theme/design.test.ts    对比度底线守卫（两套外观跑同一组断言）
src/styles/global.ts        全局样式：重置、高度链、文档字体、底色、动效退化
src/**/*.style.ts           组件/页面样式（createStyles）
```

十二条容易踩的：

1. **不要替换 antd 的种子色**（`colorSuccess` 这类），只覆盖叶子 token。
   改种子会让 antd 派生出一套跑偏的浅底色，实测得到 `#a8b3aa` 这种脏色
2. **不要把 `colorPrimary` 当文字色**——选中态浅底上只有 3.61:1。文字用
   `token.colorLink`
3. **页面里不写字面量颜色**，用 `token.*`。例外只有 `theme/customToken.ts`
   里的那几组值（列底色、行内代码色、高亮底、热力色阶，antd 没有
   这些语义）。**深色那一套也要走 token**，不要在页面里写
   `appearance === 'dark' ? … : …`
4. **不新增 `.css` 文件，不新增全局类名**。全局样式只有一个出口
   （`styles/global.ts`）。编辑器正文那种「渲染裸 DOM、拿不到 className」的
   场景，用祖先类名 + `createStyles` 的嵌套选择器（见 `NoteEditor.style.ts`）
5. **`ConfigProvider` 不能重复传 `theme`**。antd 会按传入的 theme 重算
   `cssVar` 的 key，`--ant-*` 变量名跟着变，所有引用变量的地方静默失效。
   `MimirProvider` 里它只负责 locale，主题归 `ThemeProvider`
6. **`createGlobalStyle` 里拿不到 `--ant-*`**——变量注入在 antd 组件的 DOM
   子树上。要主题值就用 `${(p) => p.theme.xxx}`，别写变量名
7. **覆写 antd 组件内部结构时用 `${prefixCls}`**，不要写死 `.ant-` 前缀——
   antd-style 会把当前前缀给你，换前缀时规则自动跟着换
8. **antd v6 的 `Tag` 用 `variant="filled"`，不要用 `bordered={false}`**——
   后者已废弃且会打警告。同理，**徽标不要用 `<Tag color="green">` 预设色**，
   预设走 antd 自己的调色板，对比度不由我们控制；用 `components/DocumentBadges.tsx`
9. **`packages/office` 的样式读 `--me-*` 变量，那些值由
   `theme/editor-theme-bridge.ts` 填**。改动编辑器里的颜色时改那个桥，
   不要在 `apps/web` 的样式里再去盖它——两处都在管同一件事，必然有一处
   是过期的。**变量只在声明它的元素及其子树上生效**，所以那个类必须挂在
   编辑器祖先上（挂错的表现是样式全部退回回退值：界面能用、颜色不对）
10. **对话包同理但只有字号与栏宽需要桥**（`--mimir-chat-*`）：颜色 / 间距 /
    圆角由包内的 `createStyles` 直接读本站 token（它内部就是
    `theme.useToken()`），**不需要也不该**在宿主里再传一套。桥是
    `components/chat/ChatThemeBridge.tsx`，值只有 `FONT_SIZE` 八档 +
    「主视图 40px / 侧栏 16px」的 `gutter`。两个宿主都走它，
    各挂一份必然会漂移，而漂移是**静默**的（字号差半个像素）
11. **编辑器工具条里的控件是 antd 组件（D-064），但它们住在 `packages/office`
    里，不归 `apps/web` 的样式管。** 那棵子树由包内一层只传
    `componentSize="small"` 的 `ConfigProvider` 管尺寸；要改那里的观感，
    改 `packages/office/src/shell/shell.css`（布局、弹层、非 antd 元素）或
    那个包的 `EditorShell.tsx`，**不要在宿主里加 `.ant-*` 覆写**——那会与包内
    的样式争同一处，而且两边都看不见对方
12. **`antd` 与 `antd-style` 的版本从 `pnpm-workspace.yaml` 的 catalog 取**
    （写 `"antd": "catalog:"`）。两个包都把它们声明成 peer，**两份拷贝的症状
    是「某些控件不吃 componentSize / 弹层不吃主题」与「样式重复注入、顺序
    漂移」，都不报错**——antd-style 有自己的模块级 cache，单实例是结构要求

`design.test.ts` 会真算对比度，也会真的挂载 provider 栈验证 cssVar 注入、
局部样式生成、以及**切换外观后变量块被替换**。它红了不要改断言，先改设计。
两条**源码扫描**守卫的射程都包含了 `packages/chat/src`（D-099）：
`design.test.ts` 的字面字号扫描、`scripts/check-style-backticks.mjs` 的
样式模板反引号扫描——代码搬进包不会让守卫跟着搬，漏一个目录的表现是
「静默失去覆盖」。

---

## 外观（浅色 / 深色）

两套外观是**并列**的，不是「浅色 + 一个滤镜」。加任何颜色前先读
`docs/DESIGN.md` §3.8。

三条硬约束：

1. **需要两套值的东西用 `useAppearance()` 分支**（如徽标色对），
   而不是在样式里散落 `appearance === 'dark' ? … : …` 判断。
   样式层拿 token 就够，`customTokenFor(appearance)` 已经按外观选好了
2. **深色不得弱于浅色。** 深色最常见的退化是「看着还行就用」，
   而单看深色的截图判断不出来——`design.test.ts` 有一条跨外观逐项比较
3. **与 seed 同名的 token 覆盖会被 antd 丢掉**（`colorLink`、`colorPrimary`
   这些）。需要精确控制时用 `tokens.ts` 的校准层，那是一个
   `MappingAlgorithm`，跑在算法链最后。**浅色下这条看不出来**，
   所以别用「浅色生效了」推断深色也生效

外观状态在 `theme/appearance.ts`，它把结果写到 `html` 的 `data-theme` 与
`color-scheme` 上。`index.html` 里有一段**等价的内联脚本**先跑一遍，
覆盖「脚本执行到样式注入」那段空白——改判断逻辑时两处必须一起改。
