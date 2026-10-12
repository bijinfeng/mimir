# 共享渲染层规则

渲染层的区域规则——**浏览器与桌面渲染进程共用的那一份界面代码**（D-103）。
[项目规则](../../project/rules.md)仍然适用，这里只写这一层特有的。
**本层还有三份按子目录嵌套的规则**（最近者优先，改到那里先读那份）：
`src/editor/`（Markdown 编辑器）、`src/theme/`（token 与外观）、
`src/components/document/`（文档面板与文件预览）。

---

## 这个包是什么

界面与业务代码的**全部**。两个使用方都只是薄壳：

```
apps/web/src/index.tsx              注入浏览器平台与路由 → createApp()
apps/desktop/src/renderer/index.tsx 注入桌面平台与路由   → createApp()
```

它**以源码发布**（`exports` 指 `src/*.ts`，与 `@mimir/chat` / `@mimir/shared`
同一种做法，见 D-023）：两个使用方各自用自己的 Vite 把它编译进产物。

### 包内一律相对导入，不要引入 `@/` 别名

`@/` 是**应用**的别名。它留在一个被 import 的包里，就要求每个使用方都去配
一遍这个包的内部目录结构——包的导出边界形同虚设，而漏配一处的症状是
「某个平台构建能过、另一个找不到模块」。抽包时 204 处 `@/` 全部改成了相对
路径，别加回来。

### 平台差异走 Context，不要在这里判断平台

```ts
useIsDesktop()        // 决定侧栏是否画自己的顶栏
useDesktopBridge()    // 浏览器返回 undefined
useTitleBar(props)    // 桌面端给 TitleBar，浏览器给 null
```

契约在 `src/platform.tsx`，是一个**判别联合**——桌面端那一支里 `bridge` 与
`renderTitleBar` 都是必填，所以消费端收窄之后**不需要可选链**：

```ts
export type Platform =
  | { kind: 'browser' }
  | { kind: 'desktop'; bridge: MimirDesktopBridge; renderTitleBar: … }
```

平台值由入口传给 `createApp(root, { router, platform })`，顺序由签名保证。
**不要改回模块级 setter**（D-104 换掉的就是那个）：它的顺序依赖是隐式的、
测试要 `resetModules` 才能换桩、而且类型上表达不了「桌面端一定有桥」。

**不要在这一层 import 任何 Electron 相关的东西**，也不要写
`if (window.mimirDesktop)`——那等于让共享代码里住着一块只有一个平台能用的
分支，而下一个读的人不会知道它永远走哪一支。

自绘标题栏（D-094）就是按这条搬去 `apps/desktop/src/renderer/components/` 的：
它整条是 `-webkit-app-region: drag`、三枚控件走 IPC，浏览器里一件都不存在。

### 路由树不在这个包里（D-104）

`routeTree.gen.ts` 由构建期插件生成，**每个平台一份**（落在各应用下）：
桌面端在基础路由之外挂自己的页面（`/client/*`），共用一份产物的话浏览器会
拿到一条它永远到不了的路由。

本包内也有一份，但它**只含基础路由、只服务于本包的 typecheck**——
`createFileRoute('/login')` 这类调用靠模块增强校验路径字面量，没有它包内每个
路由文件都报错（见 `src/route-register.ts`）。

路由配置只有一份：`route-config.mjs`，同时被 Vite 插件与 `generate-routes.mjs`
使用。各写一遍会出现「构建能过、typecheck 看到的是另一棵树」。

**`RouterContext` 与 `AuthSession` 必须留在公共导出面上**：跨包的文件路由
要求路由 context 的类型是公开的，否则生成的树每个路由都报 TS2883
（`inferred type cannot be named … not portable`）。

### 标题栏实现方要用的件走 `./titlebar-kit`

桌面端的标题栏需要品牌标记、侧栏品牌行的字形、以及 `TITLEBAR_HEIGHT`——
这些属于设计系统（`.trellis/spec/project/design.md` §9.1 要求两处同字重同字距），所以由这个
包**显式导出**，而不是让桌面端深路径 import `src/components/...`。
深路径等于把包当目录用：这里挪一个文件就会无声弄坏桌面端。

### 渲染层自己需要的构建插件在 `vite-preset.ts`

文件路由生成（扫 `src/routes/`）与 pdf.js 资产拷贝，两个平台引同一份
`rendererPlugins(publicDir)`。各写一遍的代价很具体：**两件事都不报错**——
路由漏生成是某一页 404，pdf.js 资产漏拷是中文 PDF 整段空白，且都只在那一个
平台上出现。

---

## 这一层的结构

```
src/
├── main.tsx         createApp(root)：只组装 provider，不放具体配置
├── platform.tsx     平台 Context 与判别联合（D-104）
├── titlebar-kit.ts  标题栏实现方要用的件（品牌、侧栏字形、高度常量）
├── router.tsx       buildRouter()：按平台组装路由实例
├── index.ts         导出面：createApp + 平台契约
├── routes/          页面。根路由承担鉴权守卫，_app.tsx 是两栏骨架
├── components/      可复用组件；document/ 是文档页的子组件
├── editor/          Tiptap 扩展配置与保真测试（有独立的 Trellis spec）
├── theme/           设计 token、自定义 token、provider 与守门测试（有独立的 Trellis spec）
├── styles/          全局样式（唯一的全局出口）
└── lib/             API 客户端 / Query 配置 / 路由 context / 对话包的宿主适配
```

**文件别太长。** 一个组件文件超过约 300 行就说明它该拆了。
对话那一大块**已经拆成一个包**（`@mimir/chat`，D-099），这里只剩适配层；
`components/document/` 里的文档面板也是按「一个独立关注点一个文件」分的。
拆的依据是「它是不是一个独立的关注点」，不是行数本身——行数只是信号。

**另外两个前端包住在 `packages/` 里**（`@mimir/office` 与 `@mimir/chat`）：
它们同样以源码发布。「壳与渲染归包、方言与取写归宿主」是两者的同一条边界——
office 是 `EditorIo`（取字节 / 写回），chat 是 `ChatIo`（建会话 / 读历史 /
存笔记 / 跳转）加一个数据槽（`composerStatus`）。包内 import 不到本目录的
任何东西，这是结构性的，不是约定。

`routes/` 下的非路由文件要用 `-` 前缀（`-foo.ts`），否则 TanStack Router
的生成器会警告「这个文件没有导出 Route」，`pnpm dev` 时一直刷屏。

### 三栏头部共用高度

工作区侧栏的 `panelHeading`、文档的 `header` 和文档问 AI 侧栏的
`aiSidebarHeader` 都读取 `src/theme/tokens.ts` 的 `PANEL_HEADER_HEIGHT`（48px），
并保留 `flex: none` 与 1px 下边框。三栏并排时，下边框必须在同一水平线；
窄屏侧栏覆盖文档时，返回与关闭操作仍须可达。不要在三份样式里分别写高度，
也不要借用桌面窗口标题栏的 `TITLEBAR_HEIGHT`：那是独立的 44px 区域。


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
（服务端回传，**不要**用插槽的 `isDesktopShell()` 推——桌面壳也可以在云端模式下，
而浏览器里访问本地端口也会是本地模式）：

- 账号分区与左导航菜单：本地模式**不出现登出**，账号分区不显示邮箱
- 名称的保存端点：本地模式走 `api.local.updateProfile`（Better Auth 的
  `update-user` 要求真实会话，那条路在本地模式下必然失败）
- 登录页：本地模式显示「回桌面客户端使用」，而不是一个填不对的表单
- 设置页的「客户端」分区只在桌面壳存在（插槽的 `isDesktopShell()`），
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

想看编译器有没有跳过某个组件，把使用方构建配置里的 `compiler.logDiagnostics`
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
`.trellis/spec/chat/frontend/index.md`——改对话前先读那一页。

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

## 样式

**样式方案是 antd-style（css-in-js）。** 它把「消费 token」和「写样式」合成一件事：
`createStyles` 里能直接读 antd token，产出的还是带作用域的类名。
规范是 `.trellis/spec/project/design.md`，动手前先读它。

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
   不要在本包的样式里再去盖它——两处都在管同一件事，必然有一处
   是过期的。**变量只在声明它的元素及其子树上生效**，所以那个类必须挂在
   编辑器祖先上（挂错的表现是样式全部退回回退值：界面能用、颜色不对）
10. **对话包同理但只有字号与栏宽需要桥**（`--mimir-chat-*`）：颜色 / 间距 /
    圆角由包内的 `createStyles` 直接读本站 token（它内部就是
    `theme.useToken()`），**不需要也不该**在宿主里再传一套。桥是
    `components/chat/ChatThemeBridge.tsx`，值只有 `FONT_SIZE` 八档 +
    「主视图 40px / 侧栏 16px」的 `gutter`。两个宿主都走它，
    各挂一份必然会漂移，而漂移是**静默**的（字号差半个像素）
11. **编辑器工具条里的控件是 antd 组件（D-064），但它们住在 `packages/office`
    里，不归本包的样式管。** 那棵子树由包内一层只传
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
