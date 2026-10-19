# HTML 编辑器独立检查

日期：2026-10-20（Asia/Shanghai）
任务：`10-20-interaction-html`；产品基线：`0c44cde`。

## Findings (fixed)

- 未发现需要 checker 修复的产品问题。本次独立检查未修改产品、测试、gallery 或归档产物，保持截图源冻结。

## Findings (not fixed)

- 未发现新增且未修复的产品缺陷。
- 既有 vendor 边界保持原状：裁切手柄仅支持鼠标；图片模态在短视口下的裁切限制；inspect 脚本发出的 askAi 快捷指令尚未由宿主接通。它们已在来源盘点中列明，本轮不修改 vendor 或扩展业务能力，不计为本轮已修复。
- 源码编辑导致预览重载/滚动复位属于现有行为，本轮不改变增量渲染语义。
- 检查时 coverage-map 的 92 项仍全部标记 `browser-pending; source-entry-mapped-only`，不能将此清单当作逐项浏览器通过记录。真实图像配对、浏览器交互、离线归档及最终全仓门由主会话完成，checker 不替代这些验收。

## 代码与合同复核

- 对照 PRD、design、implement、check.jsonl 及其 Office engine/editor/shell 与项目规范，检查全部 7 个产品/测试文件差异。
- 本地 CSS 使用既有 `--me-*` token，CodeMirror 变量桥接限于 `.mimir-html-cm`，作者页面的背景与原样式保持独立。分栏按自身容器宽度适配，新增 wrapper 未卸载 SourceEditor 或预览 iframe，hidden 与缩放补偿路径保留。
- 查找关闭回焦通过真实 SourceEditor handle；新增回归涵盖查找/替换 Escape、关闭按钮、再次点击查找、预览单栏关闭五条路径，同时断言源与 iframe 实例、源码和版本不变。
- 插入表单复用现有属性表单，保留 URL、行列整数和范围验证；反馈区分 status/alert，不改变插入语义。
- 生成状态分组只调整呈现。独立 AbortController、字符上限、过期拒绝、外部取消与显式保留部分稿合同保留。特别核对 `HtmlEditor.previewHtml`：匹配文档版本时，现有 iframe 已显示 `writingDraft.html` 临时草稿；`HtmlWritingPreview` 自身仅承载状态/计数/动作。不能因组件名称或局部 JSX 误判为没有草稿预览，也不能把临时预览当作原文已写入。
- BOM/EOL/末尾换行序列化、原件来源、保存开始版本与迟到保存不清 dirty、Agent 版本校验/原子补丁、共享撤销路径均未被本轮改动改变。
- iframe 的 opaque sandbox（无 allow-same-origin）、no-referrer、消息 event.source 和文档版本验证均保持。演示/导出没有改为写出带 inspect 映射的副本。
- fixture 直接导入真实 HtmlEditor、MimirProvider 和主题桥接；手动可控 IO/Agent 响应明确属于模拟，不代表写盘、后端模型或离开守卫已验收。使用公开 handle 驱动，不伪造预览消息冒充用户操作。
- `inventory.md` 与 `coverage-map.json` 均为 HTML-001–HTML-092，共 92 项，无重复、缺失、额外编号，基线记录一致。
- 本轮是恢复既有焦点、响应式和标签约定的局部修复，没有新增现行协议或持久化契约；无需为过程记录新增 `.trellis/spec/` 约束。

## Verification

- Lint：PASS。`pnpm exec oxlint` 检查 HtmlEditor、HtmlInsertMenu、HtmlWritingPreview 与 HtmlEditor.complete-tools.test 四个 TSX。
- Format：PASS。`pnpm exec oxfmt --check` 检查上述四个 TSX 及 editors.css、html-inspector.css、html-presentation.css，共 7 文件。
- TypeCheck：PASS。`pnpm --filter @mimir/office typecheck`。
- Tests：PASS。定向共 7 文件、97 项：HtmlEditor、HtmlEditor.complete-tools、HtmlEditor.picture、HtmlAgentPrompt、html-agent（5 文件 85 项）；html-brief 与 html-picture-ops（2 文件 12 项）。输出隔离断言位于 complete-tools，未将不存在的 html-output.test.ts 计入测试文件数。
- Diff whitespace：PASS。`git diff --check -- packages/office/src/editors`。
- 最终全仓 `pnpm check`：由主会话执行，本独立检查未执行，也不声称已通过。
- 浏览器/原生能力：由主会话记录。离线真实原图配对与 fixture 不等同真实后端、原生文件、全屏、弹窗及下载字节验收。

结论：当前冻结产品差异未发现需要修复的问题；局部 lint、format、类型及定向测试通过。最终完成仍以主会话的真实浏览器证据、归档与全仓质量门为准。
