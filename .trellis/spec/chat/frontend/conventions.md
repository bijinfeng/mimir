# packages/chat —— 对话面板

会话面板（消息区、检索过程、引用、失败卡、输入区）。**状态层在这个包里**
（`@assistant-ui/react` 的运行时 + AG-UI 客户端），宿主只提供「数据」与
「动作」。

**动手前先读这一页。** 它讲的都是「不知道就会踩第二次」的事。

---

## 目录形状

```
src/
  index.ts              公开面。只有 ChatPanel / ChatHostVars 与类型
  types.ts              ChatPanelProps / ChatComposerStatus / ChatDraft / ChatIo
  ChatPanel.tsx         面板：组装 + 两块本轮设置（范围 / 强度）+ 两种空态分派
  ChatThread.tsx        滚动区里的三态：加载骨架 / 空态 / 消息列
  EmptyStage.tsx        主视图空态的问候语
  ChatHostVars.tsx      宿主填主题变量的兜底层（字号八档 + gutter）
  ChatPanel.style.ts    面板级样式（字号走 var(--mimir-chat-font-*)）
  custom-token.d.ts     这个包消费的宿主自定义 token（tintList / tintHover / inlineCodeFg）
  runtime/
    io.ts               宿主动作面（ChatIo）与它的默认实现（全抛错）
    agent.ts            HttpAgent 的包装：建会话 + 参数注入
    history.ts          落库 Message → parts（历史与实时同一个形状）
    chat-context.tsx    包内的动作 context（重试 / 取回 / 引用跳转）
    use-mimir-runtime.ts 运行时的唯一入口（组件不直接碰引擎）
  parts/
    MessageItem.tsx     消息根：顺序在这里，见下
    MarkdownPart.tsx    markdown 正文（@tanstack/markdown）
    CodeBlock.tsx       代码块的两头（语言名 + 复制）
    TraceActivity.tsx   检索过程行（D-097/D-098 的形态）
    CitationList.tsx    引用块
    FailureNotice.tsx   失败卡 + 连接中断
    StoppedNotice.tsx   已停止那一行
    AnswerActions.tsx   存成笔记 / 复制
    data-parts.ts       从消息 parts 里读 trace / citations / failure
  composer/
    Composer.tsx        输入区（引擎的 composer 原语）
    ComposerMenus.tsx   底栏三个菜单与指示器
  hooks/use-scrolled.ts 滚动显形开关（对话区自己的那份）
  test-dom.ts           测试垫片（ResizeObserver / IntersectionObserver / rAF / matchMedia / act 环境）
```

---

## 四条不能违反的

### 1. 主题变量由宿主填，包不自己定义

包内的 `createStyles` 读 `var(--mimir-chat-font-*, <回退值>)` 与
`var(--mimir-chat-gutter, 40px)`。**值由宿主挂**（`ChatHostVars`，宿主侧是
`packages/renderer/src/components/chat/ChatThemeBridge.tsx`）。

- 字号来自宿主的 `FONT_SIZE`（`packages/renderer/src/theme/tokens.ts`）——包不认识
  宿主，写死数字会让「同一角色在不同页面用不同值」重新长出来
- 回退值**不是装饰**：不挂也能渲染（包内测试与独立预览靠它）

CSS 自定义属性**只在声明它的元素及其子树上生效**。挂错位置的表现是
「样式全都退回回退值」——界面能用、字号差半个像素，**不报错**。
`packages/renderer/src/theme/editor-theme-bridge.ts` 记过同一条。

### 2. `createStyles` 的样式体里**不能声明 `--*` 自定义属性**

消费宿主变量（`var(--mimir-chat-font-note, 12.5px)`）没问题；**声明新的**
（`--trace-label: ${token.colorTextSecondary}` 这种，哪怕只是想拿它当
hover 变量）会让 antd-style 把自定义属性的**值**拼进类名——类名长成
`acss-s5fzfa-#5c6570-rgba(31,35,41,0.88)`，`#` 与括号使整个选择器非法，
浏览器整条丢弃，元素裸奔成浏览器默认样式（实测：原生 button 灰底、
Arial 13px，界面能用但丑了一圈，不报错）。hover 态的传值走属性选择器
（`&:hover [data-label]`）或让颜色随 trigger 的 `color` 继承。

### 3. 不新建主题、不传 theme 的 ConfigProvider

包消费宿主的 antd token（`createStyles` 内部就是 `theme.useToken()`）。
内层再传一次 `theme` 会让 antd 重算 `cssVar` 的 key、`--ant-*` 变量名跟着换，
所有引用处**静默失效**（`.trellis/spec/renderer/frontend/conventions.md` 第 5 条 / `.trellis/spec/office/engine/index.md`
的 D-064）。

### 4. React Compiler 的三条红线（与宿主同）

- 不写 `useMemo` / `useCallback` / `memo`
- 不 `eslint-disable` 任何 React 规则（会让编译器**静默跳过**整个组件）
- **render-prop 不能写内联箭头**：`react(no-unstable-nested-components)` 判它是
  「渲染期定义组件」→ 编译器跳过宿主组件 → 不报错，只是不再优化。
  `ChatThread` 里 `ThreadPrimitive.Messages` 收的是**模块级组件表**
  （`MESSAGE_COMPONENTS`），`MessageItem` 里 Parts 的 `components` 也是模块级
  常量——都是这条规则的落点
- `try … finally` 会让编译器跳过整个组件（`AnswerActions.tsx` 里两条路径
  各写一次收尾，不是啰嗦）

---

## 两条数据路径：一切都在消息的 parts 里

**trace / citations / failure 不是 props**，是消息里的 data part。这是本次
架构的支点（D-099）：

| | 从哪来 |
|---|---|
| 实时 | 服务端 CUSTOM 事件 → 引擎把它们变成 canonical data part |
| 历史 | `runtime/history.ts` 把落库字段转成**同名**的 data part |

于是搬迁前那套「实时份与落库份按位置对齐」（旧 `RoundResult.tsx` 的
`resolveRound`）整体退役了——消息在哪，它的依据就在哪。

读它们只有一条路：`parts/data-parts.ts` 的三个 hook（`useTracePart` /
`useCitationsPart` / `useFailurePart`）。**不要**在别处再遍历一次 parts。

### 为什么不用 `makeAssistantDataUI` 注册渲染器

引擎提供了那个机制（按 part 名注册），但它渲染在 **parts 顺序**里，而服务端
先发 trace / 引用、后发正文——那样引用块会落到回答**上方**。本仓的版式是
「过程在上、引用与失败在下」（`.trellis/spec/project/product.md` §5.2/§5.6）。

想把位置摆回来就得让消息根变 flex 再用 `order` 重排，而 flex 会**取消外边距
折叠**——正文里 `p { margin: 12px 0 }` 的段间距会从 12px 变 24px，整块
markdown 的节奏都变。那是一次看不见的排版改动。

所以 `parts/MessageItem.tsx` 里顺序是**显式**的（过程 → 正文 → 引用 → 失败
→ 停止 → 动作条），而 `MessagePrimitive.Parts` 的 `data` 槽被显式关掉
（`{ Fallback: NoPart }`——不关的话注册渲染器与我们的显式渲染会各画一次）。

---

## AG-UI 的每一种消息体类型都必须有渲染件（不许静默丢弃）

引擎的 `MessagePrimitive.Parts` **平台默认组件在 react 上是 `() => null`**
——`MessageItem` 的 parts 组件表漏掉哪一种，那一种就在界面上消失（不报错）。
所以每一类都有对应件与测试（`parts/parts.test.tsx` 的「AG-UI part 类型」
一组 + `ChatPanel.test.tsx` 的端到端一条）：

| part | 渲染件 |
|---|---|
| `text` | `MarkdownPart`（@tanstack/markdown） |
| `reasoning` | `parts/ReasoningPart.tsx`（官方 Reasoning 盒，与 `TraceActivity` 共用 `reasoning-shell.tsx`；运行时需 `showThinking: true`） |
| `tool-call` | `parts/ToolCallPart.tsx`（官方 ToolFallback 换算） |
| `source` / `file` / `image` / `audio` | `parts/MediaParts.tsx`（官方 Sources pill / file chip / 缩略图） |
| `data` | 三个显式读取口（`data-parts.ts`），`data: { Fallback: NoPart }` 跳过 |

**不接线的两类**（记录在案）：`generative-ui`（需要组件白名单作安全边界）
与 `quote`（metadata 槽）。加新类型时：在 `MessageItem.tsx` 的 parts 组件表
挂号 + `parts.test.tsx` 补一条「渲染出官方形态」的断言。

## 宿主边界

包内 **import 不到** `apps/web` 的任何东西（相对路径也够不着——这是结构性的，
不是约定）。需要宿主的东西一律走两个口：

| 口 | 是什么 | 谁实现 |
|---|---|---|
| `io: ChatIo` | **动作**：建会话、读历史、存笔记、跳转 | `packages/renderer/src/lib/chat-io.ts` |
| `composerStatus` | **数据**：文档列表、模型角色、用量 | `packages/renderer/src/lib/use-chat-composer-status.ts` |

三态（加载中 / 失败 / 空）必须**如实传过来**：「读取失败」与「还没有文档」
是两件事，混成一支会让用户以为内容没了。

---

## 引擎的三个「与直觉不同」的地方

### 1. `composer.send()` 才是唯一的发送路径

按钮与键盘都走它。**不要自己写一个 `<Button onClick={composer.send()}>`**：
`canSend` 只管「有没有内容、能不能发」，而**生成中能不能排队**是另一条规则
（引擎的 `composerSendDisabled` 把 `capabilities.queue` 也算进去了）。
手写那一版会在生成中禁掉按钮，于是「生成中 Enter 排队」在鼠标路径上到不了
——键盘那条却通着，两个入口行为不一致且不报错。

用 `ComposerPrimitive.Send/Cancel` + `render={<antd Button/>}`，且
**发送 / 停止是一个键位的两种形态**（`canCancel ? Cancel : Send`）：
两颗都常驻的话空闲时停止键是一块灰方块；上游 registry 的 `thread.tsx`
也是 `AuiIf` 条件渲染同一套（实测修过）。

### 2. 停止时队列**不会**还回输入框

引擎的取消只 `notifyCancelled()` → 暂停队列（`message-queue.js`）。
而 mimir 的语义是「停止 / 失败 → 还给输入框」（D-098）。所以
`runtime/use-mimir-runtime.ts` 的 `onCancel` 里显式做「取队列首条 →
`setText` → `removeQueueItem`」。漏了它的症状是**用户的字不见了**。

### 3. `useAuiState` 的选择器必须返回**store 里已有的引用**；`incomplete` 分两种

`useAuiState` 建立在 `useSyncExternalStore` 上，快照比较是 `Object.is`。
选择器里 `return { kind, detail }` 这种**新对象字面量**每次调用都是新引用，
状态没变快照却「变了」→ React 进入订阅-重渲染循环，报
`Maximum update depth exceeded` 并把整页交给错误边界（实测：带失败 part 的
会话一渲染就白屏）。选择器只取 `part.data` 这类已存在的引用，展示用的
对象在选择器**外**组装（`parts/data-parts.ts` 的 `useFailurePart`）。

`incomplete` 被**停止与失败共用**：`reason: 'cancelled'` 才是用户按了停止
（显示「已停止生成」），`reason: 'error'` 是流断了（由失败卡 / 连接中断卡
交代）。只判 `status.type` 会把「已停止生成」挂到失败卡下面（实测踩过，
`ChatPanel.test.tsx` 的失败轮用例守着）。同理，动作条（存成笔记 / 复制）
在失败 / 中断轮**不渲染**——失败轮的正文是错误原文，存进知识库或复制报错
都是错（旧的明确决定，PRD §5.7/§5.8）。

---

## 测试

```bash
pnpm --filter @mimir/chat test
```

- `src/runtime/history.test.ts` —— 落库消息 → parts（历史保真的唯一落点）
- `src/parts/parts.test.tsx` —— 展示件的形状（静态渲染）
- `src/ChatPanel.test.tsx` —— 端到端挂载：**起一个真的 HTTP 服务**推真实帧
  （顺序、live 相位、排队取回）。不要 mock 引擎——那等于把要验的东西验没了

测试文件顶部要 `installDomShims()`（`./test-dom.js`），它补四样
happy-dom 缺的东西 + `IS_REACT_ACT_ENVIRONMENT`。**必须在 import 组件之前**
（模块顶层）——放 `beforeAll` 里太晚。

`vitest.config.ts` 里关掉了 happy-dom 的同源策略（端到端那条要连
`127.0.0.1` 的随机端口）。注意它在 `settings.fetch` 这一层下面——写成顶层会被
happy-dom 直接拒绝（`Unknown browser setting`，测试**起不来**）。

---
