# D-047 待办五项收尾

## 1. 「存成笔记」按钮补 UI（PRD §5.7 闭环）

- 服务端 `POST /api/conversations/messages/note` 与 `saveMessageAsNote` 已存在且幂等（`savedNoteId` 去重、引用写成站内链接进双链）；恢复 api 客户端方法 `conversations.saveAsNote`
- ChatPanel：最后一条助手回答的引用卡旁加「存成笔记」按钮（PRD §5.7 位置）。点击时 `queryClient.fetchQuery(['conversation', activeId])` 拿落库消息（流式完成后 onFinish 已失效缓存；新会话的 activeId 由 `mimir.conversation` 事件回传，`use-mimir-chat` 需要把 `activeId` 加进返回值）→ 按「最后一条助手消息」取落库 id → 调用 → `message.success`，按钮变为「打开笔记」跳 `openDocument(noteId)`
- UI 消息 id 与落库 id 不同（useChat 会重新生成），按位置对齐是既有模式（storedAssistant 同款）

## 2. 引用点击 → 原文滚动 + 高亮（补上「跳回原文位置」的下半句）

- context 恢复 citation 携带：`openCitation(documentId, citation)`；`_app.tsx` 存 `citation` 状态并暴露 `clearHighlight`（这次有消费者）；`_app.docs` 传入 DocumentPanel 新 prop `citation`
- DocumentPanel：文档加载后 TreeWalker 在滚动容器里找 `citation.snippet` 对应的文本（先精确匹配，失败则**两边剥 Markdown 标点再匹配**——snippet 来自原始正文，渲染后的 DOM 没有 `**` 这类记号）；命中后滚动居中 + **CSS Custom Highlight API**（`CSS.highlights.set('mimir-citation', …)`，全局样式 `::highlight(mimir-citation)` 用主色浅底），对只读正文与 Tiptap 编辑器 DOM 都生效；找不到就不高亮（只跳转），不说谎
- 消费后清除（`clearHighlight`），换文档不残留

## 3. 归档可见 + 计数收缩（来源计数换成归档计数）

- shared `documentCountsSchema`：`{ inbox, all, archived }`（note/clip 计数随来源维度退役删除）；server `countDocuments` 同步
- 导航加「已归档」（`counts.archived`）；`scopeParams('archived') → {status:'archived'}`；`SCOPE_LABEL.archived = '已归档'`——TriageBar 的「归档」从此有去处
- server 测试 `upload.test.ts` 的 clip 计数断言改写（kinds 契约保留，断言改走全部列表长度）

## 4. 设置页合并（三处）

- **删「抓取」分区**：内容与插件分区的 capturer 描述重复，RSS/扩展的 pending 是路线图信息（PRD 已有）；SECTIONS 与 CaptureSection.tsx 移除
- **头像菜单去掉「外观」子菜单**：外观的 canonical 位置是设置页外观分区（带完整说明）；菜单只剩 账号资料 / 登出
- **统计面**：细看后是两个不同问题（统计分区=用量热力图，数据分区=库存与导出），**不合并**；删掉数据分区里无处可去的「标签」面板（标签浏览已在库视图）；此判断修正记入 D-048

## 5. ≤880px 断点

- 不做隐藏导航（断了导航可用性）：≤880px 时左栏**强制折叠为 48px 图标条**（CSS 覆写，展开态在此宽度下也被压到折叠宽），主区占满。DESIGN §5.5 表格同步改写

## 文档（同批）

- DECISIONS D-048：五项收尾 + 统计面的判断修正
- PRD §5.7（存成笔记落地确认）、§5.10（归档入口）；DESIGN §5.4/§5.5（880 行为）
- AGENTS 进度行

## 验证（完成定义）

- `pnpm check` 全绿（server counts 断言改写、web 测试同步）
- 浏览器实测：对话里让 AI 回答 → 存成笔记 → 打开笔记（引用来源进双链）；点引用 → 滚动到原文 + 高亮带 → 返回；TriageBar 归档 → 导航「已归档」能看到它；≤880px 导航折叠；深浅色
- 提交两笔（docs、code），写明验证方式
