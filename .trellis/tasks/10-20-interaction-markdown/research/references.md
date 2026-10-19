# Research: Markdown 编辑器参考与适用性

- Query: 固定 GenOffice Markdown Ribbon、Office 网页版/Google Docs 官方文档与 WeKnora 当前公开源能为本轮 Mimir 打磨提供哪些可核实依据？
- Scope: mixed
- Date: 2026-10-20

## Findings

### 实际取证与版本

本日6个HTTP请求均200，随后WeKnora tag ref请求也200。完整URL、HTTP状态、下载原始字节数与SHA-256见 `external-evidence.json`。为避免巨型官方HTML/第三方代码混入源码检查，仅保留相关短片段与JSON元数据；SHA/bytes指**完整HTTP响应**，不是裁剪后的文件。没有新增lint排除。

| 来源 | 固定版本/具体证据 | Mimir适用性 |
| --- | --- | --- |
| [GenOffice Markdown Ribbon](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/markdown/src/renderer/components/Ribbon.tsx) | commit **480548fd55f1be3593ee0d8e316a734751d58309**，与 `packages/office/vendor/UPSTREAM.json`固定值相同。原L57–69九种块样式；L260明确save/undo/redo/autosave quick-access row；L368–391当前样式与加粗状态；L446–470三类列表；L477–505表格/图片/分隔均实际回调或uiOp。对应 `genoffice-ribbon.tsx.excerpts.txt` | 文件编辑主参照：保留可执行命令、当前状态、快捷操作与任务分组，沿现有Mimir CompactToolbar适配中栏。不是把上游整条多行Ribbon、autsave开关、save-as功能全加进产品；这些不是本轮需求。未运行上游GUI，不声称尺寸和浏览器效果。 |
| [Office Show or hide the ribbon](https://support.microsoft.com/en-us/office/foundations-experiences/show-or-hide-the-ribbon-in-office) | 在线官方帮助无应用版本号；本日HTTP200。原文：“Classic Ribbon…full ribbon”；“Single Line Ribbon…a more compact version that takes up less space”；“Show tabs only…Hides the ribbon”。`office-ribbon-excerpts.json` | 证明紧凑显示与功能可达可以共存。沿当前具名分组/逐组压缩，不扩大成功标准到Office所有命令，也不按文档文字宣称已测Word Web。 |
| [Google Docs keyboard shortcuts](https://support.google.com/docs/answer/179738?hl=en) | 在线官方帮助无应用版本号；HTTP200。Tool finder/search the menus使用Alt+/或Option+/；compact mode Ctrl+Shift+F。`google-docs-shortcuts-excerpts.json` | 主菜单/常用快捷键/紧凑模式是可核实的命令组织参考；Mimir当前没有menu search与compact mode，**不为参考补新功能**。本轮要兑现现有Ctrl/Cmd+F及正文/菜单键盘，不套用不支持的快捷键。 |
| [WeKnora官网](https://weknora.weixin.qq.com/)与[固定源码](https://github.com/Tencent/WeKnora/blob/3e22822c1d2397be730c458c7539d0eb8c113a24/frontend/src/components/manual-knowledge-editor.vue) | 官网可见v0.8.3；latest release为 **v0.8.3**，published2026-10-14。tag ref明确是commit **3e22822c1d2397be730c458c7539d0eb8c113a24**（不是猜main）。源码原L92–118以editorAreaWidth控制820 split和620窄模式，L375–431分format/heading/list/insert，L1013–1028图标带aria-label。`weknora-*-excerpts.json`、`weknora-tag.json`、`weknora-manual-editor.vue.excerpts.txt` | 依项目要求每次研究核对。可参考知识编辑状态组织、按实际编辑区宽度门控、可访问名称；其textarea/preview视图不同于Mimir真实Tiptap。**不是文件工具栏主要样板**，不能据此把Mimir变成双栏源码编辑、删表格/代码/属性能力。 |

### 风格与领域边界

本轮保留现有主题与宿主token。Obsidian是项目页面布局/视觉风格的领域参考，现有语雀主题来自用户后续认可；没有新做Obsidian GUI调研，也不以其名字覆盖现有主题。已有对比见 `.trellis/tasks/archive/2026-10/10-16-yuque-design-research/research/yuque-design-study.md`（记录Workspace官方页与限制）。文件命令与交互以本日固定GenOffice源码和实际Mimir实现为准；WeKnora知识库/Agent组织只作相关性核对。

### Files found

- `packages/office/vendor/UPSTREAM.json`：固定GenOffice commit、license、同步闭包；只读，未运行git命令。
- `packages/office/src/editors/MarkdownEditor.tsx:285–312`：九种样式与方言可用性，已明示GenOffice来源。
- `packages/office/src/editors/markdown-slash.ts:1–5`：相同固定源的Slash来源声明。
- `.trellis/tasks/10-12-multi-format-agent-edit/research/genoffice-manual-entrypoints.md`：过往固定源入口索引；本轮重新下载Ribbon，不仅沿用旧描述。
- `.trellis/tasks/10-11-chat-edit-office/research/toolbar-competitors.md`：既有Office/Docs参考，日期2026-10-12；本轮重新取回两官方页，不把旧WeKnora v0.8.2写成当前版本。
- `inventory.md`：74个现有交互组、共享边界、真实IO与模拟限制、静态风险。

### Related specs

`.trellis/spec/guides/index.md`与项目AGENTS要求按领域分配主参照、每次研究核对WeKnora官网和公开源码；`.trellis/spec/office/frontend/editors/conventions.md`要求窄列逐组具名压缩及真实命令；renderer editor spec要求同方言往返与真实行为测试。

## Caveats / Not Found

- 没有在本研究登录WeKnora/Word/Google Docs或运行GenOffice；参考属于官网文字与固定源码证据，非真实GUI截图与精确像素结论。
- 官网/官方帮助在线页没有可对应本地应用构建号，只记录抓取日期与哈希；WeKnora公开源码与实际部署可能有差别。
- 当前Mimir视觉问题与最终效果必须由主任务真实组件同尺寸前后渲染验证。研究未改产品代码、规范或git状态。
