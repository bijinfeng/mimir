# AGENTS.md

给 AI agent 的项目入口。**先读完这一页再动手**——它不重复文档内容，只告诉你
什么绝对不能违反、以及去哪里找答案。

---

## 这个项目是什么

mimir —— 自托管的个人知识库。写 Markdown 笔记、收集外部资料、带引用地问 AI。
单用户，Docker 部署在自有服务器上。

设计已经定稿。你的工作是在既有决策下实现功能，**不是重新评估它们**。

---

## 开工前必读（按顺序）

| 顺序 | 文件 | 读它是为了 |
|---|---|---|
| 1 | 本页 | 铁律与完成定义 |
| 2 | `docs/PRD.md` 的 §1 非目标 | 知道什么不该做 |
| 3 | 你改动区域的 `AGENTS.md` | 区域特有的规则 |
| 4 | 任务涉及的 `docs/TECH.md` 章节 | 该模块的设计 |

不必通读全部文档。但上面四项**没读完不要开始写代码**。

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

改了行为就要改对应文档。文档和代码分开提交，等于制造一个「谁说真话」的问题。

如果你发现某个既有决策其实是错的——**先改文档并说明理由**，不要直接改代码。
让判断留在文档里可被评审。

---

## 完成定义

「改完了」不算完成。以下全部满足才算：

1. **`pnpm check` 通过** —— lint、format、typecheck、test 一条命令
2. **验证方式写进提交信息** —— 跑了什么、看到什么。不是「已测试」
3. **涉及检索或解析的改动** —— 说明怎么确认效果，不要只跑单元测试就宣布完成
4. **涉及界面的改动** —— 说明实际看到了什么，不要只看代码推断
5. **改了行为** —— 同步更新对应文档；有实质取舍的，在 `docs/DECISIONS.md` 追加一条
6. **没跑过的东西不要声称跑过**

---

## 会静默出错的地方

这几类问题**不报错**，只在你以为没问题的时候悄悄地错。改动相关代码前读一遍。

| 症状 | 原因 |
|---|---|
| 中文搜不到 | 缺了 jieba 预分词，或 `new Jieba()` 没带词典（会退化成逐字切分）；SQLite 下还可能是 FTS5 触发器被绕过、索引落后于表（`pnpm db:reindex` 重建） |
| 编辑器只有内容高、下面一大片空白 | 高度链缺了一环。整条链是 `scroll(min-height:0)` → `cols(min-height:100%)` → `innerWide(align-self:stretch)` → 主题变量层(`flex:1;min-height:0`) → `.mimir-editor(flex:1)`。实测断过两次：`cols` 的 `align-items: flex-start`、主题变量那一层是默认 `block` |
| 工具条不粘（滚走了） | `.mimir-editor` 用了 `overflow: hidden`——它会让元素成为滚动容器，里面的 `sticky` 相对它定位而它与内容同高。要用 `overflow: clip` |
| **窄窗口下工具条右端的「保存」看不见** | 宽度链缺了一环：`.mimir-editor` 是 flex 子项，`min-width: auto` 让它不会缩到比内容更窄（里面有一张 900px 的 pdf 页面），于是整块外壳比视口宽（实测 420px 窗口里量出 932px）。它看起来像「工具条没折行」，其实是外壳的宽度下界。`min-width: 0` 即可——注意 `overflow: clip` **挡不住**它（Chrome 只对 `hidden`/`auto`/`scroll` 把自动最小尺寸算作 0），而 `clip` 又是 sticky 那条必需的 |
| **小屏幕下侧边栏被压缩变形** | 同一个断点（880px）被写了两份：外壳的 `@media` 把左列压到 48px，而栏内内容仍按折叠偏好渲染成展开态——中文标签逐字竖排、品牌名与开关叠在一起（实测 `scrollWidth` 129 对 `clientWidth` 47）。断点只在 `theme/tokens.ts` 定义（`NAV_NARROW_QUERY`），CSS 与 `lib/nav-collapse.ts` 的 `matchMedia` 共用它（DESIGN §5.5 / D-055） |
| **目录树点哪行不进哪行** | rc-tree 的 `.ant-tree-title` 是行内元素，而标题内容是个块级 flex 盒子——放不进图标所在的 line box，被折到下一行（实测每行标题 top 比本行高恰好 28px）。名字画在下一行的行带上，`elementFromPoint` 取名字中心命中的是后一行：点「技术」进的是 `folder:技术/后端`。wrapper 补 `display:flex;align-items:center`、title 补 `display:flex;flex:1;min-width:0`（`FolderSection.tsx` 的 `treeWrap`，DESIGN §8.1 / D-069） |
| **目录树整体浮着一块底色 / 树根样式写了不生效** | createStyles 里把树根样式写成 `.treeWrap .ant-tree` 后代式，而 treeWrap 类就挂在**树根自己身上**——祖先-后代关系不成立，规则静默失效：目录顶着 antd 的 colorBgContainer 坐了两个迭代，D-070 删掉右缘线没了遮挡才被看见。同一条坑还埋着选中态规则（`-node-selected` 类也在 wrapper 自己身上，从没生效过，一直是 antd 默认在渲染）。要用 `&.ant-tree` 同元素选择器；css 模板注释里不能出现反引号（直接终止模板串，check-style-backticks 守着）。展开三角的坑在同一段代码里还有一对：三角必须 z-index 抬过 content-wrapper（relative 且 DOM 在后，否则 elementFromPoint 命中 wrapper、点三角落空），闲时 pointer-events none（那个位置平时点图标 = 进目录）（`FolderSection.tsx` 的 `treeWrap`，DESIGN §8.1） |
| 改了单元格、保存也成功，界面上还是旧值 | `setCell` 只改了 XML 没改内存模型，而界面读模型（`view()`）。文件是对的，所以只有对着界面看才发现（TECH §15.7） |
| 编辑器标题字号不对（38px 或 28px） | 前者是 antd `Typography.Title` 的自带规则特异性更高；后者是抬了特异性之后纯 `<h1>` 又匹配不上、回落到浏览器默认 2em。两个分支都要用 `Typography.Title` |
| 中文 PDF 整段文字空白（不是乱码） | pdf.js 的 cmaps 没加载到。它按**原始文件名**取（`cmaps/Adobe-GB1-0.bcmap`），所以资产必须放 `apps/web/public/pdfjs/`（原样复制、不改名）——带哈希的产物目录里没有那些名字，404 之后内容就是空白（TECH §15.12） |
| PDF 界面全白且无报错 | 并发渲染。第一版用「取消上一次」防并发，而 StrictMode 挂载两次会让两次都没画。要用**代次**（`pdf-render.ts`） |
| 预览过一次之后保存的 PDF 是 0 字节 | `getDocument` 把字节 transfer 给 worker 了。要传 `bytes.slice()` |
| 删了会话/文档但关联记录还在 | SQLite 默认**关闭**外键，CASCADE 静默失效——连接时必须显式 `PRAGMA foreign_keys = ON`（`db/client.ts` 已做，别在新连接里漏） |
| 原先连 Postgres 的环境「数据全空」 | `DATABASE_URL` 没设，默认换到了 SQLite 空库（`data/mimir.db`）——部署环境要显式设置；启动日志打印当前驱动与库位置 |
| 组件没变快 | React Compiler 静默跳过了（抑制了 React 规则，或 ref 声明晚于使用它的 effect） |
| 建索引失败 | pgvector 的 HNSW 上限 2000 维，超过要用 `halfvec` |
| 类型对不上 | `^0.145.0` 这类 peer 范围对 0.x 版本意味着 `>=0.145.0 <0.146.0`，装最新版会失败 |
| 生产启动报错 | workspace 包（`@mimir/shared` / `core` / `tokenizer` / `plugins/*`）以源码发布，Node 不执行 node_modules 里的 TS —— 必须由使用方编译进产物。把任何一个标成 external 就是这个症状，而**本地开发完全正常** |
| 改设置看起来没生效 | 值被环境变量压住了，或保存请求没发出去。设置页必须如实显示**来源**（界面/环境变量/默认），且保存是显式动作而非 `onBlur`——绑定在 blur 上的保存实测不触发，而界面上值看着是改了的 |
| 设置项在界面上有、代码里没人读 | 键没有注册进键表（`packages/core` 的 `CORE_SETTING_SPECS` 或插件的 `params`）。写入端点会拒绝未注册的键，但只读代码看不出来 |
| 插件在设置页显示的状态不对 | 状态由 core 从 `requires` / `unavailable()` 算出来（`docs/TECH.md` §7.4）。实现自己编状态字符串就会与真实原因脱节 |
| 描述符指向的文件不存在 | `plugins.test.ts` 有一条断言在守（描述符的 `file` 路径必须真实存在）。它防的是「设置页显示的文件路径是手写的」——那正是重构要消掉的东西 |
| 静态资源 404 | 服务端产物被打包成 chunk，`resolveWebDist()` 算错层级 —— Vite 的 SSR 构建要开 `preserveModules` |
| 服务端 dev 起不来 | dev 入口自己调了 `serve()`，与 Vite 的 dev server 抢端口 —— 监听只由生产入口 `src/index.ts` 做 |
| 路径算错 | `src/` 与 `dist/` 的目录层级不同，不要写死相对偏移量 |
| 状态色看不清 | 换了 antd 的**种子色**，派生色跑偏；或用了 `Tag color="green"` 预设色（对比度不由我们控制） |
| 界面颜色不对但不报错 | 内层 `ConfigProvider` 又传了一次 `theme` —— `cssVar` 的 key 被重算，`--ant-*` 变量名换了，引用处静默失效 |
| 改了深色的链接色但没生效 | 与 seed **同名**的 token（`colorLink`、`colorPrimary`）会被 antd 的 `formatToken` 丢掉，值由算法重新派生 —— 浅色下看着像生效了（浅色阶把输入色放在第 6 阶），深色下不达标注。要用 `tokens.ts` 的校准层（`MappingAlgorithm`） |
| 深色下焦点环看不见 | antd 深色把 `colorPrimaryBg` 与 `colorPrimaryBorder` 设成**同一个值**，而后者是焦点环。深色单独校准了描边 |
| 深色下露出白色 | `html` 上没画底色，或没写 `color-scheme` —— 滚动条与原生下拉不受 CSS 管辖 |
| 深色用户看到一下白闪 | 外观状态没在首帧前算出来。`theme/appearance.ts` 与 `index.html` 的内联脚本必须同源 || 改了字但格式没了（或文件里别的东西被重排） | 补丁式保存退化成整体重建。pptx 靠**元素锚点**（未改动的元素用 `anchor.originalXml` 原样回填，见 `packages/office/src/pptx-save.ts`），docx 靠**块比对**。`pptx-save.test.ts` / `docx.test.ts` 各有断言守着「只有该变的条目变」 |
| 第二次保存把第一次的改动回滚 | pptx 的 `save()` 成功后必须 `commit()`——否则下次拼字节时干净元素回填的是**旧**字节，而两次保存都报成功 |
| pptx 编辑后画布不更新 | 编辑是就地改模型的，`slides()` 返回同一个数组，React 的 `useMemo` 依赖它不会重算。要用 `view()` 的**不可变快照**当依赖 |
| pptx 点画布没反应 | 渲染的 SVG 少了 `data-element-id`（事件代理靠它把点击映射回模型元素）。漏掉是静默的——看着像「这个元素不能编辑」 |
| **pptx 段尾打字（或段首 / run 边界插字），同段其余 run 的格式没了** | 纯插入的改动区间是**零宽**的，与 0 条 run「相交」——按「区间与几条 run 相交」判断会误判成整段重写、把整段压成一条 run（实测两条 run 的段落段尾加一个字符，`<a:r>` 由 2 变 1）。落点要单独算：插入点**前一个字符所在的 run**（`PptxEditor.tsx` 的 `editParagraphRuns` / `insertIntoRuns`），软换行哨兵不当落点；跨了多条 run 的才是整段重写（不带 `srcRun`，让 `dominantRun` 跟正文走）。`PptxEditor.test.tsx` 的段尾 / 段首 / run 边界 / 软换行四条用例守着 |
| 改了 A1，D7 也跟着变 | xlsx 的**共享字符串**被就地改写了（`<c t="s"><v>17</v></c>` 里的 17 被多个格子共用）。新文本必须写成内联字符串（`packages/office/src/xlsx-edit.ts`） |
| 改完格子又变回旧值 | xlsx 的公式格：只换了 `<v>` 而留着 `<f>`，Excel 打开时按公式重算。覆盖时必须连 `<f>` 一起清 |
| xlsx 新写的格跑到行首 | 插入位置要按**列号**比，而列号要从 `r="A5"` 里只取列字母。我们的预览按 `r` 定位所以照常显示，而 Excel 要求 `<c>` 按列升序 |
| 表格里改列宽，越改越离谱 | 单元格的 `colwidth` 属性存的是 **px**（解析 `convert.ts:930` 写入、保存 `:1236` 自己 ×15 换回 twips），而输入框说的是 twips——读要过 `pxToTwips`、写要过 `twipsToPx`（`DocxEditor.tsx`），漏掉任何一次就是「每次编辑把列宽放大 15 倍，重开显示又缩小 15 倍」 |
| 段落样式换了级别，重开又变回去 | Tiptap 的 `setNode` 会把没点名的属性原样带过去（`attributesToCopy`）——换样式必须显式 `styleId: null`，否则文件里的 `w:pStyle` 还是旧样式（`generate.ts:1742` 优先写它） |
| 格式刷点上去反而把格式抹掉 | 源选区起点正好压在格式区间起点上时，`$from.marks()` 返回**前一个节点**的 marks（实测为空）——要取**选区区间里第一个文本节点**的 marks |
| 菜单面板里的下拉「点一档什么也不会发生」 | 面板里的 antd `Select` 打开后弹层 **portal 到 body**，而关面板的 `pointerdown`（capture）只认「面板或触发按钮内部」——按下瞬间面板被关、选项随面板卸载，之后的 `click` 落空，界面不报错。`useToolbarPopup` 的 `insidePanel()` 要用 antd 自己写的 `aria-controls` / `aria-owns` 把「面板里控件拥有的弹层」也算作面板内（`EditorShell.tsx`）。**测试也要按真序列驱动**（pointerdown → click）：只派发 click 时 React 会批处理，`onChange` 照样发出，这个 bug 会被测成通过 |
| 图标档的按钮读屏只念「单选按钮 1 of 3」 | antd `Segmented` 把 `title` 挂在内层 label 的 div 上，而可聚焦的是 `<input type=radio>`——两者不关联，`title` 在这里根本不当名称用（真 Chromium 的 AX 树实测 `name: ""`）。文字要用 `.me-sr-only`（`clip-path`，**不是** `display:none`）塞进 label 元素里 |
| 输入框比同排的按钮小一号 | `.me-input` 那套手写观感（height / padding / border / 字号）挂在 antd 的 `Input` 上，与 antd 的 `:where(…).ant-input` 特异性相同而项目样式更靠后——实测同一排里输入框 12px / 按钮 14px、圆角 4 对 8。控件观感一律归 `--ant-*`，这个类已删（只剩宽度/弹性类） |

完整清单见 `docs/TECH.md` §10。

---

## 文档地图

| 你想知道 | 去哪 |
|---|---|
| 该不该做某个功能 | `docs/PRD.md` §1 非目标、§4 功能范围 |
| 某个交互为什么长这样 | `docs/PRD.md` §5 关键交互决策 |
| 某个技术选型为什么 | `docs/TECH.md` §1 与被否决的方案 |
| 某个视觉决定为什么、该用什么值 | `docs/DESIGN.md`（有实测对比度） |
| 为什么不用某个方案 | `docs/RESEARCH.md` —— 有星数、版本号、许可证、实测数据 |
| 数据模型 / 检索设计 | `docs/TECH.md` §4、§7 |
| 想加一个插件（新来源 / 新通道 / 新模型）| `docs/TECH.md` §7.4 + 对应包的 `install()` |
| 某个配置项能不能改、改了什么时候生效 | `docs/TECH.md` §7.5（配置分层）|
| 部署与已知坑 | `docs/TECH.md` §8、§10 |
| 历史上做过哪些决定 | `docs/DECISIONS.md` |
| 原型长什么样 | `output/index.html`（双击打开） |

---

## 当前进度

| | 状态 |
|---|---|
| 设计 | 定稿 |
| 数据库 | **双后端**（D-045）：服务器 = Postgres 17 + pgvector（Docker）；本地开发 / 桌面端 = SQLite（免 Docker，`DATABASE_URL` 未设置时默认） |
| 后端 | M0 完成：文档 CRUD、目录、标签、双链、检索、会话、抓取、问答（流式）、导出 |
| 前端 | 两栏界面（D-047）：导航 + 主区（库视图 / 详情两态）、会话导航、对话视图、命令面板、抓取对话框、设置页。**四种编辑器共用一套外壳**（D-054：上工具条 / 中编辑区 / 下状态行，铺满容器，头部单行） |
| 桌面端 | **Electron 载体**（D-046）：窗口加载宿主的地址（cookie / SSE / Range 原生可用），可切远程地址 |
| 文件 | **多格式上传已落地**（`docs/TECH.md` §13、D-044）：任意格式的原件入库、列表、按格式预览、下载、替换、随导出打包；文本 / HTML / Office 的正文可搜。**PDF 的正文提取**与 RSS 未做 |
| 六种格式 | **GenOffice 支持的六种都能预览与编辑**（D-056 / D-057）：docx 全文、xlsx 单元格、pptx 文字、html 源码、markdown（即笔记）、pdf 页面级（旋转/删除/调序）。PDF 的**改文字**未做——那要 PDFium 的 WASM，见 TECH §15.12 |
| Office | 三种格式的原件层都能看、**都能改**：**docx 全文编辑**（分页视图 + 工具栏；D-049）、**pptx 改文字**（渲成 SVG；D-051/D-052）、**xlsx 改单元格**（D-050/D-053）。三者保存都是**补丁式**（改一处不重排整篇 XML）。**界面在包里**（`packages/office/src/shell` + `src/editors`），markdown 笔记与它们同壳（D-054） |
| 下一步 | 见 `docs/TECH.md` §11（M1：分块与向量化 → 混合检索 → 带引用的问答） |

不确定从哪开始就问，不要猜。
