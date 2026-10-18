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

就地标题同样显式确认/取消，blur 留稿；组合输入及同步锁阻止重复提交。写入已成功后即使连续 GET 失败也保持 saved 状态，禁止再次 PATCH。标签和目录响应仅合并已写入字段，不能覆盖活正文；标签写失败保留候选，最多 20 个、每项 1–50 字符。目录空串表示移出所有知识库，不能写成“知识库根目录”。

移动与撤销共享元数据锁；每次移动发布新的文档级 token，旧 toast 的撤销不得覆盖后续移动。撤销写入已完成但刷新失败时，同样只读恢复。笔记 AI 结果随 contentHeader 放在正文滚动区内，不能作为外壳 flex 子块挤压活编辑器；下载语义明确是已保存原件，不包含尚未保存的改动。

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

## 文档宿主交互与局部排版

文档宿主沿用已批准的 document-review-v1：头部 48px；只读容器 max-width 856px、padding 36px 48px 72px，正文 15px/1.9；笔记内部 max-width 856px、padding 32px 32px 72px，主标题 28px/1.35（窄屏 25px），H2 22px/1.5。局部角色在 DocumentPanel.style 维护，不能为凑数改全局主题或所有 Office 编辑器。笔记的 contentHeader/contentFooter 插槽位于同一正文滚动区内；外壳工具区仍铺满。

大纲只取真实标题（排除反引号/波浪线围栏），挂载后从活正文 ProseMirror DOM 同步；至少两个标题且非原件、非窄栏、非助手态才显示。196px 大纲不能叠加旧 220px 编辑器留白。跳转失败保留阅读位置并给提示，不能回退匹配元数据标题或伪装成定位成功。

助手是否覆盖由文档容器实际宽度 ≤880px 决定。关闭保持 Chat 挂载和流式结果，隐藏区 inert；覆盖态提供焦点限制、Escape 和遮罩关闭，关闭后回到有效入口。同篇引用定位，跨篇引用和双链/正文内链统一 runGuarded。快捷问题直接发送，选区与编辑器预设仅预填。

AI 整理请求显式提示产生用量；结果是当前文档的临时会话内容。结果提交必须同时匹配文档 ID 与请求 token；A→B→A 也不能接纳旧 A 结果。原网页入口只使用实际 http(s) doc.url，双链仍按内部文档处理。

验证：DocumentTitle、DocumentPanel.core、headings、MarkdownBody、MarkdownHostSlots、DocumentFooter、FilePreview 的回归测试覆盖写后读失败、迟到结果、围栏标题、滚动插槽和真实文件分派；同内容 GUI 对照单独记录实际抽验，不能把枚举状态数写成浏览器通过次数。

文档命令与离开弹窗使用局部 DocumentDialog 样式：桌面宽480px、内边距24px、圆角12px、标题17px；≤575px避开52px导航栏并留左右10px，390px实际left62/top24/width318，内边距18px、标题15px。必须归零窄屏默认上下margin，否则top24会变成实际32px。不能覆盖收集弹窗的独立class。菜单Escape逐层关闭；子菜单回父项，根菜单关闭后回更多入口，不与portal/window监听竞争焦点。

### 未保存守卫注册

`setSave(save, mode = 'manual', canSaveFromGuard = true, editorId?)` 的 `editorId` 由 NoteEditor/OfficeSourceEditor 传当前 doc.id。`canSave` 必须同时有真实回调和代存能力；Office 提示型回调传 false，普通离开提示不出现“保存并离开”，引导回工具栏保存。自动保存模式不提供丢弃已写版本。

同一编辑器的 effect cleanup/setup 不得撤销正在等待的导航；不同 editorId 或真正卸载使旧保存结果失效。保存进行中不能替换待执行目标，保存成功也不能清除期间新增且尚未写入的改动。失败与新改动保留当前内容及目标，继续编辑/Escape 回到实际触发入口。

回归以可控 promise 断言：canSave=false 不调用代存；回调重注册仍完成原请求；切换文档后旧完成不放行；保存期间再改动保持 dirty。`UnsavedGuard.test.tsx`、`markdown-save.test.tsx` 和 `NavSidebar.test.tsx` 分别覆盖 provider、真实笔记保存与导航焦点。浏览器 Back/原生关闭仍按既有宿主能力，不据此声称新增全局路由拦截。

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
