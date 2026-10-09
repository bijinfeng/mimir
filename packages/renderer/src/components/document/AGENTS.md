# packages/renderer/src/components/document —— 文档页的子组件

`DocumentPanel`（详情面板）、`FilePreview`（原件预览）、`DocChatSidebar`
（问 AI 侧栏）等文档页子组件。父层 `packages/renderer/AGENTS.md` 仍然适用。

---

## 文件类文档的界面（`docs/DESIGN.md` §8.16、`docs/TECH.md` §13）

上传件与笔记 / 抓取的资料**共用列表形态与归类动作**，只有正文区多一个分支：

| `kind` | 正文区 |
|---|---|
| `note` | `NoteEditor`（Markdown 笔记） |
| `file` | `FilePreview`（**直接看原件**，D-054） |
| 其余 | `MarkdownBody`（只读渲染） |

**`FilePreview` 没有「正文 / 原件」切换**（D-054 去掉的）。分派判据是
「能不能真的看到东西」：有专用查看器 → 原件；没有但提取出了正文
（txt / csv / 旧版 doc）→ 正文；两个都没有 → 说明卡片 + 下载。
用 `viewerFor` 分派，不要自己判 MIME——两处各判一次必然有一天不一致。

**五种原件格式的编辑器都走 `OfficeSourceEditor`**（docx / xlsx / pptx /
html / pdf；markdown 是笔记，走 `NoteEditor`）。它是宿主的适配层，只做两件事：
包 `EditorIo`（取字节 / 写回）、铺主题变量。**加第七种格式时不要新建组件**
——在 `viewerFor` 加一个 kind、在 `OfficeSourceEditor` 加一个分支就是全部改动。

**提取结果没有消失**：它仍然可搜、可被 AI 引用。那是它真正的用途，
不需要在详情里再占一层。

六条容易做错的地方：

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

不支持 Office/PDF 的格式仍按 `viewerFor` 降级到浏览器原生查看器或下载卡片；
六种可编辑格式的能力边界见 `docs/TECH.md` §15。

---

## 会静默出错的地方

| 症状 | 原因 |
|---|---|
| **给 antd 控件的编辑/展开态写样式，改了却完全没生效** | antd 的 `Typography.Title editable` 进入编辑态时**会把 className 一起挂到编辑容器上**（实测容器的 classList 里就是我们的 `headerTitle` 哈希类），所以「我们的类 + 空格 + antd 类」这种**后代**选择器永远匹配不到——那个类的元素就是容器自己，要写成 `&.ant-typography-edit-content` 同元素式（与「树根样式写成后代式」是同一个坑，`DocumentPanel.style.ts` 的 `headerTitle`）。createStyles 模板里的反引号是另一条独立的坑，见根 `AGENTS.md` |
| 编辑器标题字号不对（38px 或 28px） | 前者是 antd `Typography.Title` 的自带规则特异性更高；后者是抬了特异性之后纯 `<h1>` 又匹配不上、回落到浏览器默认 2em。两个分支都要用 `Typography.Title` |
