# apps/web/AGENTS.md

前端的区域规则。根目录的 `AGENTS.md` 仍然适用，这里只写这一层特有的。

---

## 这一层的结构

```
src/
├── main.tsx         挂载点。只组装 provider，不放具体配置
├── router.tsx       路由实例（routeTree.gen.ts 是生成物，不要手改）
├── routes/          页面。根路由承担鉴权守卫，_app.tsx 是三栏骨架
├── components/      可复用组件；chat/ 与 document/ 是各自的子组件
├── editor/          Tiptap 扩展配置与保真测试
├── theme/           设计 token、自定义 token、provider 与守门测试
├── styles/          全局样式（唯一的全局出口）
└── lib/             API 客户端 / Query 配置 / 路由 context / 对话状态
```

**文件别太长。** 一个组件文件超过约 300 行就说明它该拆了。
`components/chat/` 就是 `ChatPanel` 拆出来的（消息、引用卡、检索过程、
失败卡片、输入区各一个文件）。拆的依据是「它是不是一个独立的关注点」，
不是行数本身——行数只是信号。

`routes/` 下的非路由文件要用 `-` 前缀（`-foo.ts`），否则 TanStack Router
的生成器会警告「这个文件没有导出 Route」，`pnpm dev` 时一直刷屏。

---

## 鉴权

守卫在 `routes/__root.tsx` 的 `beforeLoad`，**不在每个页面各写一遍**。

新增页面时不需要加守卫——但如果你要放行某个路径（比如回调页），
改的是那一处，而不是在页面里绕过。漏一个未鉴权页面在自托管暴露公网时
等于把整个知识库交出去。

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
中断后的清理、半截 markdown 的渲染与转义。这些**都别自己写**。

| 层 | 用什么 |
|---|---|
| 消息状态与流式接收 | `@tanstack/ai-react` 的 `useChat` |
| 消息渲染 | `createChatUI`（`@tanstack/ai-react/ui`）+ 官方 `TextPart` |

`lib/use-mimir-chat.ts` 是对话状态的唯一入口，**组件不直接碰 `useChat`**。
它只做四件 SDK 不该知道的事：会话 id 维护、自定义事件收进 state、
让 TanStack Query 失效、把引用回传给中栏。

两条硬约束（都踩过）：

1. **`initialMessages` 只在挂载那一刻生效。** 打开历史会话时必须等数据取回
   再挂载对话体（`ChatPanel` 里那个 `messagesLoading` 分支就是干这个的）。
   先挂载再补数据的症状是：右栏一直空白，而中栏的「本次引用」正常显示
2. **会话 id 走请求体（`forwardedProps`），不进 URL。** `useChat` 在
   connection 变化时会重建客户端并**切断正在进行的流**

`TextPart` 自带流式 markdown 解析与 HTML 转义，所以回答是 Markdown 渲染的；
样式覆写集中在 `ChatPanel` 的 `thread` 里，用 `${prefixCls}` 与 token。

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
里面放 antd 控件即可——它只管浮层位置与显隐。

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

上传件与笔记 / 抓取的资料**共用列表形态与整理动作**，只有正文区多一个分支：

| `kind` | 正文区 |
|---|---|
| `note` | `NoteEditor`（唯一可编辑的） |
| `file` | `FilePreview`（两层：正文 / 原件） |
| 其余 | `MarkdownBody`（只读渲染） |

四条容易做错的地方：

1. **正文为空时那第二行必须说明原因**，不能留白。四种原因的措辞由
   `@mimir/shared` 的 `parseSupport()` 派生，列表项与详情面板共用
   `list-helpers.ts` 的 `excerptText()`——**不要在组件里现编一句话**
2. **格式与大小是中性文字，不是徽标**。彩色徽标只给「来源」（`KindBadge`）；
   格式是开放集合，按「一格式一色」走下去每加一种就要多一组色对
3. **查看器加载失败要降级成下载卡片**（HEIC 能通过 MIME 判断但浏览器未必
   渲染得了）。空白在那里等于说「这个文件是空的」
4. **文本类文件的正文用等宽只读，不走 Markdown**。csv / json 里的换行与 `#`
   会被 Markdown 渲染折叠或当成标题——那是主动把内容显示错

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

`design.test.ts` 会扫源码拦下字面量。唯一的例外是**图标字形**，
必须在行内标注 `非文本` 才放行（`font-size: 9px; /* 图标字形，非文本 */`）。

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

八条容易踩的：

1. **不要替换 antd 的种子色**（`colorSuccess` 这类），只覆盖叶子 token。
   改种子会让 antd 派生出一套跑偏的浅底色，实测得到 `#a8b3aa` 这种脏色
2. **不要把 `colorPrimary` 当文字色**——选中态浅底上只有 3.61:1。文字用
   `token.colorLink`
3. **页面里不写字面量颜色**，用 `token.*`。例外只有 `theme/customToken.ts`
   里的那几组值（列底色、行内代码色、高亮底、整理条、热力色阶，antd 没有
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
   后者已废弃且会打警告。同理，**来源徽标不要用 `<Tag color="green">` 预设色**，
   预设走 antd 自己的调色板，对比度不由我们控制；用 `components/DocumentBadges.tsx`

`design.test.ts` 会真算对比度，也会真的挂载 provider 栈验证 cssVar 注入、
局部样式生成、以及**切换外观后变量块被替换**。它红了不要改断言，先改设计。

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
