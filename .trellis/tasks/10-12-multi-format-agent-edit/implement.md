# 实施计划：五格式 Agent 与手动编辑

本父任务管理范围、固定上游基线、跨格式合同和总体验收；六个子任务分别执行并独立检查。任何子任务开始前，须完成其 `design.md`、`implement.md` 和 `implement.jsonl`/`check.jsonl`，并按 Trellis 审阅门槛进入 `in_progress`。不因部分格式完成而宣称五格式交付。

## 顺序清单

1. [ ] 冻结上游 commit 与逐项能力矩阵：对 13/17/8/6/45 个顶层工具，以及 XLSX 55、PPTX 71（模型可调用 61）、Markdown 15、HTML 13、PDF 26（`apply_ops` 可调用 8）种操作，记录上游手动命令、Mimir 执行路径、依赖、是否可用和验证。矩阵按代码与上游源码核对，不用工具名称数量替代完成证据。
2. [ ] 完成 `10-13-format-agent-core`：格式中立的工具目录、鉴权能力、画布句柄、AG-UI 续轮、历史和 DOCX 兼容；浏览器与桌面使用相同接口。跑 chat/server/renderer 回归。
3. [ ] 完成 `10-13-markdown-agent-manual` 与 `10-13-html-agent-manual`：先把已能在浏览器执行的上游编辑操作接入同一画布，再补手动命令与保存保真，逐项验收。
4. [ ] 完成 `10-13-pptx-agent-manual`：引入操作注册、元素/媒体/表格/图表/动画及生成链路，保持补丁保存与人工/Agent 同状态。对象与多 run 夹具独立重开。
5. [ ] 完成 `10-13-xlsx-agent-manual`：先打通两端可用的工作簿会话与公式执行，再接上游 DSL、手动网格、可视对象与完整保存；用 Excel/openpyxl 或等价独立解析器读回。
6. [ ] 完成 `10-13-pdf-agent-manual`：先解决 PDFium/字体/OCR 等共享宿主构建与会话，再逐类接文字、批注、图片、表单、页面和新文件工具；用 pdf.js、pdf-lib 与独立阅读器交叉检查。
7. [ ] 逐格式在真实浏览器文档页和桌面本地模式执行代表性手动与 Agent 交替编辑；核对问 AI 中栏、窄屏、未保存提示、回退、保存重开、真实模型续轮。桌面远端模式使用同一自部署服务合同验证。没有第三方测试凭据时将对应真实服务验证保留未通过，不用 mock 结果代替。
8. [ ] 汇总五个子任务矩阵，逐项标注通过/受限/失败；只有全部要求的可执行能力在两端通过，才勾选父任务 A1–A9。做全仓检查、构建、SQLite/PostgreSQL 迁移核对、Office 原件保真和跨格式回归。
9. [ ] R9 工具栏：替换 `CompactToolbar` 的宽度阈值“更多”为可见分类和可滚动命令组，更新 DOCX/PPTX/PDF 的大菜单布局；六格式及文档“问 AI”空态清理常驻教程，保留可点击快捷提问和上下文风险提示。验证 826px 编辑列、问 AI 打开、键盘切换分类、桌面窗口与实际命令执行。记录尚未接通的 GenOffice 命令，不用按钮占位冒充完成。

## 验证命令与实际效果

- `pnpm --filter @mimir/office test`、`pnpm --filter @mimir/renderer test`、`pnpm --filter @mimir/chat test`、`pnpm --filter @mimir/server test`：格式执行、UI 与工具续轮。
- `pnpm check`、`pnpm build`、`git diff --check`：仓库门槛及两端构建；涉及桌面打包/原生二进制时运行 `pnpm desktop:build`，涉及 fnOS 包时运行 `pnpm fnos:build`。
- 浏览器实际操作：五格式各至少一个复杂原件，先人工改动但不保存，再让 Agent 读取/修改，人工继续修改，尝试回退、保存、重开并核对检索。
- 桌面本地和远端宿主：使用与浏览器相同的文件和操作序列，核对能力清单及失败文案一致；服务端引擎在部署目标 OS/arch 可启动。
- 独立读回：XLSX 公式/格式/图表、PPTX 元素关系与多 run、HTML 源码 envelope、PDF 内容/批注/表单/页面和 Markdown vault 文件均不以本编辑器自读结果作为唯一证据。

## 风险与回退点

- `packages/office/vendor/` 只由同步脚本维护；新增闭包不能把 Node-only 代码拉进浏览器。`src/xlsx-edit.ts`、`pptx-save.ts`、`pdf-pages.ts` 的旧轻量路径迁移时要防止未改条目损坏或第二次保存回滚。
- `apps/server` 宿主编辑会话只存未保存工作状态，须限制内存、文件大小、会话 TTL、并发、原件版本与所有者；服务重启或编辑会话丢失不能清除客户端 dirty。
- `packages/chat`、`apps/server/src/services/docx-agent-stream.ts` 的续轮改造要保留 DOCX 历史和重复调用保护；任何格式失败可单独关闭该格式工具，而旧问答与其他格式继续正常。
- Rust/PDFium/字体资源的构建和发布必须在浏览器服务端、桌面本地宿主及远端宿主可用；不以桌面 IPC 专用路径交付。

## 启动前核对

- 父任务规划摘要经用户在摘要之后明确批准；先启动共用通道子任务，再按上述依赖顺序启动格式子任务。
- 每个实施子任务的三个规划文件和两个非空上下文 manifest 经检查；旧 `.trellis/spec` 的轻量格式边界在能力真正落地时同步更新，不能在规划阶段改成“已经支持”。
