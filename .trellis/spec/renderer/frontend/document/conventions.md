# packages/renderer/src/components/document —— 文档页的子组件

`DocumentPanel`（详情面板）、`FilePreview`（原件预览）、`DocChatSidebar`
（问 AI 侧栏）等文档页子组件。父层 `.trellis/spec/renderer/frontend/index.md` 仍然适用。

---

## 搜索面板的当前文档命令

### 适用范围与签名

`mimir:document-command` 事件 detail 为 `{ command: 'rename' | 'move' | 'search', documentId: string }`；宿主校验发起文档 ID。旧内部字符串 detail 仍兼容。笔记支持重命名、移动、查找；文件和只读资料只支持移动；文档加载失败不推断成笔记能力。

### 行为契约

`DocumentCommandModal` 按文档和命令保留当前草稿，等待时禁用提交与关闭。组合输入确认前不提交或关闭，弹窗内 Ctrl/Cmd+K 不再叠加全局搜索。重命名/移动属于同文档元数据更新，不额外触发离开保护；查找去空白至少两个字符才执行，不提供下一处/替换。移动沿用实际 8 秒撤销。片段的 `snippet/start/end/matchedBy` 与重复正文定位继续走现有算法。

元数据更新成功后精确刷新 document query，不把更新响应的整对象覆盖活编辑器。后台读取失败而缓存仍有 doc 时，保留同一编辑器节点和本地正文；只有无 doc 的读取失败才展示整页错误。已写入但刷新失败在弹窗明确提示，“重试刷新”只读，不再次提交元数据。

### 验证与错误矩阵

| 条件 | 界面与执行 |
|---|---|
| 重命名空白/超长、查找不足两字、移动到原目录 | 阻止提交并给出字段提示 |
| 元数据请求在途 | 单次请求，禁止关闭/重复提交，草稿仍可读 |
| 写入失败 | 弹窗保留草稿，可重试原操作 |
| 写入成功、刷新失败 | 保留正文与草稿，明确已保存，只重试读取 |
| 文档已切换，旧请求返回 | 不更新新文档的等待/弹窗状态 |

### 正常与边界案例

正常：从搜索面板重命名，标题同步且焦点回到有效文档入口。边界：写入后 GET 失败，编辑器仍保留未保存正文，恢复读取只发生一次 PATCH。错误：将无目标文档 ID 的迟到命令应用到新文档，或用 `isError` 无条件卸载有缓存的编辑器。

### 回归断言

`DocumentCommandModal.test.tsx` 覆盖 IME、等待、失败草稿、目录恢复、查找门槛和快捷键包含；`DocumentPanel.commands.test.tsx` 断言刷新失败后编辑器节点身份、正文与命令草稿不变，恢复过程不重复写入。

### 错误与正确写法

错误：`if (docQuery.isError) return <Error />`，后台刷新错误会卸载活编辑器。正确：无缓存 doc 才进入整页错误；有 doc 时保留编辑器并展示读取恢复入口。

---

## 文件类文档的界面（`.trellis/spec/project/design.md` §8.16、`.trellis/spec/project/architecture.md` §13）

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
html / pdf；markdown 是笔记，走 `NoteEditor`）。它是宿主的适配层：
包 `EditorIo`（取字节 / 写回）、铺主题变量；有真实 Agent 执行器的编辑器把
当前文档绑定的 `ChatDocumentAgent` 句柄交给同页 `DocChatSidebar`。DOCX、XLSX、
PPTX、HTML、PDF 的执行器均经这个宿主适配层连接；各格式只开放目录中真实可执行的
操作，未接入的上游工具仍须保持不可用。句柄随文档切换失效，不能交给
主视图或其他文档。跨层合同见[文档 Agent 通道](../../../shared/contract/document-agent.md)，
DOCX 专有工具见 [DOCX 对话编辑](../../../shared/contract/docx-agent.md)。
**加第七种格式时不要新建组件**
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
六种可编辑格式的能力边界见 `.trellis/spec/project/architecture.md` §15。

---
