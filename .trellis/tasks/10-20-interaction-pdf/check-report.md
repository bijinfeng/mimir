# PDF 精修独立检查

检查日期：2026-10-20。检查基线：`53285bbdeaa17475e04aae517f07c957776cb6b6`。按本任务 PRD、design、implement、check.jsonl 及其中规范/研究核验；未修改产品、测试或其他工作者文件，未提交。

## Findings (fixed)

无。未发现需要机械自修的问题。

## Findings (not fixed)

无本次改动引入的阻断项或需要产品决策的缺陷。

审阅确认：

- `PdfEditor.tsx` 的 8 个组、10 个 Inspector 入口沿既有 `collapsedContent(close)` 模式补齐。以 Babel TSX AST 比较基线和当前每个 `onClick`，移除当前首条 `close?.()` 后，10 个处理器的 AST 均完全一致；各自条件、目标、refs、状态清理及 OCR stop 分支均保留，未变成全局重置。
- 批注选择、草稿/坐标及线程保持原面板归属；动作移到滚动 body 的同级 footer。root/reply/markup 的选择与回复、编辑、删除判据及原 `ToolbarConfirm` 保留，新增真实 `contentBusy || source.saving` 禁用；Select 显式禁用，原生字段由 fieldset/显式 props 禁用，关闭仍可用。
- `PdfLocalPanel` 的 tabs 原键盘处理和 roving tabIndex 原样移入 scroll body，没有置于 disabled fieldset；真实 host busy 时工具导航和关闭仍可用。写字段使用既有 busy，Select 显式传递；精确数字格式/边界保持，busy 时不接受提交。
- 字节发布、原件/source identity、页面几何、pending insert、保存成功实际字节基线、版本/dirty/history、Agent/IO 协议均未改。OCR、表单、图片、签名、画布绘图成熟实现未被重新布局或重写。CSS 限定于批注、本地工具；既有表单 footer 规则保持。
- 本次落实已有 Inspector 滚动/固定动作与复合 Select 禁用合同，没有新增需要同步的持久设计取舍或公开接口合同，故未为登记过程扩写 `.trellis/spec/`。

## Verification

- Lint：**pass**。`pnpm exec oxlint` 限定 `PdfEditor.tsx`、`PdfLocalPanel.tsx`、`PdfInspectorInteractions.test.tsx`。
- TypeCheck：**pass**。`pnpm --filter @mimir/office typecheck`，退出 0。
- Format：**pass**。`pnpm exec oxfmt --check` 限定上述 3 个 TSX 和 `editors.css`、`pptx-pdf-toolbar.css`，5 文件通过。
- Diff whitespace：**pass**。`git diff --check --` 限定本次 4 个产品文件。
- Tests：**pass**。`pnpm --filter @mimir/office exec vitest run` 下列 **12 个文件、135 项测试**，退出 0；JSON reporter 的 `success=true`、`numPassedTests=135`、`numFailedTests=0`。下表为实际文件/用例数，未把嵌套 describe suite 数当作文件数。

| 测试文件（`packages/office/src/editors/`） | 通过数 |
| --- | ---: |
| `PdfInspectorInteractions.test.tsx` | 15 |
| `PdfEditor.local.test.tsx` | 18 |
| `PdfEditor.content.test.tsx` | 15 |
| `PdfEditor.pending-forms.test.tsx` | 2 |
| `PdfEditor.forms.test.tsx` | 14 |
| `PdfEditor.blocks.test.tsx` | 8 |
| `PdfEditor.signature.test.tsx` | 7 |
| `PdfEditor.ocr.test.tsx` | 4 |
| `PdfEditor.redaction-copy.test.tsx` | 18 |
| `PdfEditor.image-export.test.tsx` | 4 |
| `PdfEditor.drawing-canvas.test.tsx` | 11 |
| `pdf-toolbar-render.test.tsx` | 19 |

新增回归实际挂载控件，覆盖 10 个折叠组入口打开/关闭与 Escape 回焦、4 类本地工具的 deferred busy/拒绝保稿/不重复提交/导航和关闭，以及批注同级 footer 与 deferred 字段锁/拒绝保稿。既有回归同时验证真实批注线程两次保存、取消/迟到结果拒绝、pending 页面与表单、两种保存期间插字基线、精确原生几何、undo/redo、OCR 临时性、涂黑副本不改原件及绘图自有 busy 不取消自身。

## 未验边界

独立检查未操作浏览器/系统文件选择、下载或打印，未验证真实 PDF.js 可见像素、短高布局/浅深配色及本地 OCR WASM 资产；happy-dom 的 mock rendering 不能证明这些。真实组件前后图、原生 helper/保存重开与全仓 `pnpm check` 由主会话另行完成并归档；本报告不将来源索引条数或代表测试扩展为所有动态选项/环境均通过。
