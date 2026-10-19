# 文档宿主视觉实现记录

批准稿：document-review-v1，SHA256 `2a3aafb4277c37bd06e38ae94ecec085e0f31a062b88e25a000042e5cbdb220d`。本记录由 visual implementer 提供；真实 GUI 由主会话统一核验。以下数值来自冻结 `review.css` 累计规则，数值声明不等于运行时测量或所有状态已实测。

## 所有权与修改

- `document/DocumentPanel.style.ts`：共享宿主、阅读正文局部覆盖、标题编辑数据属性、菜单、助手、反馈、大纲、页脚。
- `DocumentHeader.tsx`：`menuBusy` 锁定、标签/目录子菜单在异步整理中保留、AI 入口焦点目标、保存状态可达反馈。
- `DocumentFooter.tsx`：内部来源和反链按钮、独立原网页新标签入口（仅 http/https；无 URL 不渲染）、无关联时不留空行。
- `FilePreview.tsx`：媒体/原件宿主分派保留；非编辑器预览留白、原样文本、失败卡、无原件不下载、原生播放器名称及 metadata preload、提取文案复用 excerptText。
- `DocChatSidebar.tsx` / `DocxCapabilityStatus.tsx`：文档助手标题和独立范围行、空会话引导、实际能力检测/失败/模型/画布/修订状态。ChatPanel 流式、队列、发送仍复用既有实现。
- 既有 Header / DocxCapabilityStatus 测试同步；新增 Footer / FilePreview / DocChatGuide 回归测试。

未修改全局主题、共享 ContentTypography、Office 工具实现或 Chat 消息实现。正文局部覆盖仅在当前文档宿主中生效。NoteEditor / MarkdownEditor footer 插槽由 core 实现者负责。

## 逐组产品落点

| DOC 组 | 视觉/交互落点与覆盖边界 |
|---|---|
| 007–008 | 48px 头部、安静返回入口、可收缩路径/标题、窄屏仅图标。返回守卫沿原业务委托。 |
| 009–012 | 标题28px、窄屏25px；meta11px；显式动作/错误排版。标题状态机及请求恢复由 core 实现和测试。 |
| 013 | 真实 idle/pending/saving/error 状态；错误可达播报，spinner 尊重减少动效。 |
| 016–018 | 大纲196px、上36px/侧12px；项目12px/1.5、6×11内距、深层23px；active绿色1px inset+柔和填充。标题提取/锚点由 core。 |
| 023–031 | 菜单238px、6px外填充、10px圆角、38px项目、低高度滚动；读取/失败/容量/等待项来自 core buildDocMenu；metadata 等待阻止关闭，保留子菜单。 |
| 032–037 | AI块14×16、底24间隔、正文14px/1.8；保留主题语义。模型/摘要/候选/错误/迟到结果由 core。 |
| 038–039 | 宿主内正文15px/1.9；H2 22px/1.5/600、上30下12；段落底16；quote 22外距/6×16内距/2px中性线；列表22缩进；table14px/9×12；pre13px/1.75、16px内距；图片8圆角。内链回调由 core。 |
| 040–042 | Sources行内“查看原网页”+外链图标，内部来源Link图标和反链按钮；页脚上40/内20/1px分隔、label42宽、links可换行和键盘聚焦。内部跳转守卫由 core。 |
| 043–044 | viewerFor 分派保留，提取原因使用既有 helper；parseError 优先，正文和原件真实条件决定分支。 |
| 045–048 | 图片不放大且可打开原大小；媒体原生controls/可达名称；error按文档隔离为下载卡，换文档恢复；不声称原生解码/播放已测。 |
| 049–052 | 原样文本pre保留换行和#，提取Markdown独立；无查看器/无原件用同一降级卡，缺原件明确无下载。旧doc提取说明保留。 |
| 053–056 | Header/卡片仅 sourceKey 有值才下载；五格式继续同一OfficeSourceEditor，编辑器不被24px媒体内距包围。真实编辑和Office不能代存守卫由其他实现者。 |
| 057–058 | 复用现有 preset/snapshot handoff，不复制完整 Chat 或假装发送。 |
| 059–060 | 桌面400px侧栏；真实文档容器≤880覆盖，窄屏留32px；48px助手header+范围行，标题截断，40px窄屏关闭按钮。关闭保留挂载/流式与overlay焦点由 core。 |
| 061–064 | 宿主实际能力状态区分加载、失败重试、缺模型、无执行器、无画布和可执行；DOCX修订开关解释实际更新/待审阅语义。模型设置和笔记跳转继续走现有守卫。 |
| 065–066 | 复用 ChatPanel 状态；“速读本文/提出要点/解释细节”保持完整问题直接发送（与预填不同），胶囊28px、6px gap。 |
| 075–078 | 浅深token、稳定hover/focus、长文本换行/滚动、低高度菜单；未添加全局主题。overlay焦点隔离/命令/离开保护由 core/guard。 |

## 关键几何与集成

- readonly：max856 / padding36px 48px 72px，正文760。
- note：max856 / padding32px 32px 72px；窄阅读容器28px 16px 48px，严格按批准稿实际几何，不将note强制改成824。
- note原外壳给大纲留220px且side right16/top8；宿主局部改为196px和0，消除24px额外间隙；外层scroll在note场景不重复预留gutter。
- 新样式键：`noteTitleActions` / `noteTitleError`（亦覆盖data属性），`aiOverlayBackdrop`，`aiSidebarScope`，`assistantClose`，`assistantGuide`。
- 新局部角色 `DOCUMENT_FONT_SIZE`：control12/path13/meta11/narrowTitle25/readingHeading22；不改其他模块字号。
- `data-document-notice` / `data-title-metadata` / `data-document-empty-body` / `data-document-prose` 由core宿主使用；`data-document-ai-trigger`供关闭后回焦。

## 已执行验证

- 5个相关文件、16项测试通过：DocumentHeader、DocxCapabilityStatus、DocumentFooter、FilePreview、DocChatGuide。
- owned文件 oxlint / oxfmt --check 通过；style backticks 检查通过。
- 四个变更AntD组件 `antd lint --format json` 均0问题。
- Renderer tsc 仅报告已知范围外 `agent-media.check.test.ts:12` Promise.withResolvers / TS2550。
- 额外design.test检查108/109通过，当时失败为并行guard文件中的19处字体字面量，已通知其实现者处理；需最终集成后复跑，不将其记作通过。

## 主会话必须确认

实际产品与批准稿同内容/尺寸浅深、390px、700px、低高度、200%字号；note正文/大纲边界及文章padding运行时尺寸；助手overlay/关闭/重新打开草稿保留/回焦和真实Chat引导gutter；弹层Keyboard/Escape/IME；媒体播放/原件新窗口/下载；真实模型及OS/Electron边界。上述测试没有替代GUI检查，也未声明422个设计状态均已执行。
