# 文档模块实施与检查上下文摘要

2026-10-18，规划阶段。用户“继续”授权总任务顺序第六模块研究和HTML，未认可本模块产品实施。必须先交具体冻结HTML，下一条明确认可后才task.py start。本摘要为受注入大小限制的入口，不能代替完整覆盖清单。

## 必须读取的权威证据

- document-inventory.md：完整事实/缺口/键盘/失败恢复及全部源码锚点。按组分段读取，不能把前32KB截断当完整。
- document-scenes.json：78组422状态、current/proposal分区、html_paths；原型/检查应程序化完整消费并验证集合一致，不能仅靠本摘要生成映射。
- reference-review.md/reference-evidence.json：WeKnora官网v0.8.3、发布后main固定2c0d8384；Obsidian官方help固定08ef563f。文档非应用源码，官方站正文403无运行时像素测量。
- design.md/implement.md：现有批准方向、规划与后续实施边界。

## 不可丢失合同

48px头部，阅读760px/15px约1.9，笔记/原件铺满外壳，原件无双重大纲。Office工具栏与完整Chat是后续模块，仅宿主交接。
标题当前Enter/blur收起无IME/失败留稿；提案显式确认取消、blur留稿，排除IME、单飞、失败/只读刷新恢复。
元数据改动不触发离开保护、不覆盖活正文；跨篇跳转走guard，当前助手跨篇引用漏guard是修复提案。
空folder是移出所有目录/知识库，不是库根。标签候选等真实写成功才移除；菜单读取失败不伪装空集合。
AI摘要/标签临时当前文档、产生用量、不能自动贴标签；快捷问题直接发送，选区/预设仅预填，两者有别。
文件viewerFor/parseSupport为真相，无正文/无查看器/原生失败各异；无原件不能下载；文本保原样。Office无共享代存能力，不承诺守卫保存并离开成功。
浏览器Back与原生关闭仅记录当前保护边界/宿主未验，不新增全局路由blocker。原网页URL入口可列新增前端提案，当前侧没有；不增加公开分享。
当前和提案同内容/尺寸；所有状态具体可定位，枚举不等于GUI通过。HTML的原生下载、媒体播放、IME、读屏、Electron与后台写入模拟不得宣称实际通过。

## 完整分组入口

| ID | 组名 | 类别 | 首要源码锚点 |
|---|---|---|---|
| DOC-001 | 阅读路由与返回范围 | entry | packages/renderer/src/routes/_app.docs.tsx:20 |
| DOC-002 | 未选文档组件空态 | entry | packages/renderer/src/components/DocumentPanel.tsx:626 |
| DOC-003 | 首次读取与骨架 | read | packages/renderer/src/components/DocumentPanel.tsx:82 |
| DOC-004 | 初次加载失败/不存在 | read | packages/renderer/src/components/DocumentPanel.tsx:638 |
| DOC-005 | 缓存刷新失败保留活内容 | read | packages/renderer/src/components/DocumentPanel.tsx:726 |
| DOC-006 | 文档种类/失败标记 | header | packages/renderer/src/components/DocumentPanel.tsx:807 |
| DOC-007 | 共享紧凑标题栏 | header | packages/renderer/src/components/document/DocumentHeader.tsx:54 |
| DOC-008 | 返回库/返回对话 | navigation | packages/renderer/src/components/document/DocumentHeader.tsx:56 |
| DOC-009 | 笔记主标题与更新时间 | title | packages/renderer/src/components/document/DocumentTitle.tsx:29 |
| DOC-010 | 标题就地编辑提交/取消 | title | packages/renderer/src/components/document/DocumentTitle.tsx:17 |
| DOC-011 | 标题IME与同步单飞 | title | packages/renderer/src/components/document/DocumentTitle.tsx:41 |
| DOC-012 | 标题请求失败与读取恢复 | title | packages/renderer/src/components/DocumentPanel.tsx:278 |
| DOC-013 | 笔记保存状态反馈 | save | packages/renderer/src/components/document/DocumentHeader.tsx:103 |
| DOC-014 | 新建笔记一次性正文焦点 | handoff | packages/renderer/src/components/DocumentPanel.tsx:820 |
| DOC-015 | 逐文档滚动恢复 | navigation | packages/renderer/src/components/DocumentPanel.tsx:102 |
| DOC-016 | 大纲显示条件与归属 | outline | packages/renderer/src/components/DocumentPanel.tsx:137 |
| DOC-017 | 大纲层级/锚点/联动 | outline | packages/renderer/src/components/document/headings.ts:15 |
| DOC-018 | 大纲代码围栏/动态正文边界 | outline | packages/renderer/src/components/document/headings.ts:17 |
| DOC-019 | 引用进入与高亮定位 | citation | packages/renderer/src/routes/_app.tsx:295 |
| DOC-020 | 引用重复正文与Markdown归一化 | citation | packages/renderer/src/components/DocumentPanel.tsx:1015 |
| DOC-021 | 引用无命中/不支持高亮API | citation | packages/renderer/src/components/DocumentPanel.tsx:594 |
| DOC-022 | 引用连续定位与生命周期 | citation | packages/renderer/src/components/DocumentPanel.tsx:580 |
| DOC-023 | 更多菜单打开/键盘/回焦 | organize | packages/renderer/src/components/document/DocumentHeader.tsx:40 |
| DOC-024 | 已有标签/删除/清空 | organize | packages/renderer/src/components/document/doc-menu.tsx:70 |
| DOC-025 | 统计建议标签读取 | organize | packages/renderer/src/components/DocumentPanel.tsx:434 |
| DOC-026 | 标签写入与正文缓存保真 | organize | packages/renderer/src/components/DocumentPanel.tsx:307 |
| DOC-027 | 标签字段/容量边界 | organize | packages/shared/src/documents.ts:76 |
| DOC-028 | 目录菜单与当前路径 | organize | packages/renderer/src/components/document/doc-menu.tsx:119 |
| DOC-029 | 目录加载/失败/恢复 | organize | packages/renderer/src/components/DocumentPanel.tsx:435 |
| DOC-030 | 菜单移动/移出目录 | organize | packages/renderer/src/components/DocumentPanel.tsx:319 |
| DOC-031 | 移动8秒撤销 | organize | packages/renderer/src/components/DocumentPanel.tsx:340 |
| DOC-032 | AI整理入口与费用说明 | ai-organize | packages/renderer/src/components/document/doc-menu.tsx:167 |
| DOC-033 | AI摘要展示/临时性 | ai-organize | packages/renderer/src/components/DocumentPanel.tsx:215 |
| DOC-034 | AI摘要缺模型/失败 | ai-organize | packages/renderer/src/components/DocumentPanel.tsx:388 |
| DOC-035 | AI候选标签生成 | ai-organize | packages/renderer/src/components/DocumentPanel.tsx:411 |
| DOC-036 | AI候选应用/失败恢复 | ai-organize | packages/renderer/src/components/DocumentPanel.tsx:763 |
| DOC-037 | AI结果文档ID与迟到结果 | ai-organize | packages/renderer/src/components/DocumentPanel.tsx:215 |
| DOC-038 | 只读正文排版/复杂块 | body | packages/renderer/src/components/document/MarkdownBody.tsx:14 |
| DOC-039 | 正文内部链接交接 | body | packages/renderer/src/components/NoteEditor.tsx:184 |
| DOC-040 | 抓取原网页来源入口 | body | packages/shared/src/documents.ts:96 |
| DOC-041 | 来源/被引用双链内容 | links | packages/renderer/src/components/document/DocumentFooter.tsx:24 |
| DOC-042 | 双链打开/守卫/失效文档 | links | packages/renderer/src/components/DocumentPanel.tsx:867 |
| DOC-043 | 文件实际分派矩阵 | file | packages/renderer/src/components/document/FilePreview.tsx:77 |
| DOC-044 | 提取原因/可检索性 | file | packages/renderer/src/components/document/FilePreview.tsx:103 |
| DOC-045 | 图片预览/原始大小 | media | packages/renderer/src/components/document/FilePreview.tsx:189 |
| DOC-046 | 音频原生播放器 | media | packages/renderer/src/components/document/FilePreview.tsx:218 |
| DOC-047 | 视频原生播放器 | media | packages/renderer/src/components/document/FilePreview.tsx:224 |
| DOC-048 | 查看器失败下载降级 | media | packages/renderer/src/components/document/FilePreview.tsx:90 |
| DOC-049 | 原样文本预览 | file | packages/renderer/src/components/document/FilePreview.tsx:235 |
| DOC-050 | 提取正文回退 | file | packages/renderer/src/components/document/FilePreview.tsx:244 |
| DOC-051 | 无查看器但有原件 | file | packages/renderer/src/components/document/FilePreview.tsx:268 |
| DOC-052 | 无原件/无正文 | file | packages/renderer/src/components/document/FilePreview.tsx:297 |
| DOC-053 | 下载原件入口 | file | packages/renderer/src/components/document/DocumentHeader.tsx:130 |
| DOC-054 | Office宿主五格式交接 | office | packages/renderer/src/components/document/OfficeSourceEditor.tsx:34 |
| DOC-055 | 原件载入/保存/错误边界 | office | packages/renderer/src/lib/office-source-filename.ts:32 |
| DOC-056 | Office无法守卫代存 | office | packages/renderer/src/components/document/OfficeSourceEditor.tsx:84 |
| DOC-057 | 编辑器AI预设/选区问答交接 | handoff | packages/renderer/src/components/DocumentPanel.tsx:241 |
| DOC-058 | PPTX截图草稿交接 | handoff | packages/renderer/src/components/DocumentPanel.tsx:257 |
| DOC-059 | 文档助手开启/布局 | assistant | packages/renderer/src/components/DocumentPanel.tsx:231 |
| DOC-060 | 关闭助手保留流式与回焦 | assistant | packages/renderer/src/components/DocumentPanel.tsx:902 |
| DOC-061 | 助手引用同篇/跨篇导航 | assistant | packages/renderer/src/components/DocumentPanel.tsx:685 |
| DOC-062 | DOCX能力/AI修订开关 | assistant | packages/renderer/src/components/document/DocChatSidebar.tsx:84 |
| DOC-063 | 其他格式助手能力状态 | assistant | packages/renderer/src/components/document/DocChatSidebar.tsx:91 |
| DOC-064 | 助手设置/保存笔记后跳转 | assistant | packages/renderer/src/components/document/DocChatSidebar.tsx:102 |
| DOC-065 | 助手ChatPanel承载状态边界 | assistant | packages/renderer/src/components/document/DocChatSidebar.tsx:182 |
| DOC-066 | 助手快捷提问 | assistant | packages/renderer/src/components/document/DocChatGuide.tsx:7 |
| DOC-067 | 命令重命名弹窗复用 | commands | packages/renderer/src/components/document/DocumentCommandModal.tsx:77 |
| DOC-068 | 命令移动弹窗复用 | commands | packages/renderer/src/components/document/DocumentCommandModal.tsx:133 |
| DOC-069 | 命令当前笔记查找 | commands | packages/renderer/src/components/document/DocumentCommandModal.tsx:121 |
| DOC-070 | 命令等待/IME/回焦/晚回包 | commands | packages/renderer/src/components/document/DocumentCommandModal.tsx:51 |
| DOC-071 | 未保存手动格式离开 | guard | packages/renderer/src/components/UnsavedGuard.tsx:62 |
| DOC-072 | 自动保存笔记离开 | guard | packages/renderer/src/components/UnsavedGuard.tsx:93 |
| DOC-073 | 守卫保存失败/连续修改 | guard | packages/renderer/src/lib/unsaved.tsx:119 |
| DOC-074 | 浏览器后退/刷新/关闭宿主边界 | guard | packages/office/src/editors/MarkdownEditor.tsx:790 |
| DOC-075 | 390px/中栏/低高度布局 | layout | packages/renderer/src/components/document/DocumentPanel.style.ts:44 |
| DOC-076 | 浅深/焦点/hover不抖动 | layout | packages/renderer/src/components/document/DocumentPanel.style.ts:16 |
| DOC-077 | 长正文/大纲/摘要/双链滚动 | layout | packages/renderer/src/components/document/DocumentPanel.style.ts:391 |
| DOC-078 | 弹层层级/焦点恢复整体 | accessibility | packages/renderer/src/components/document/DocumentHeader.tsx:161 |
