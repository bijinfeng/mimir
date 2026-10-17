# DOCX 对比 / 拆分独立检查

日期：2026-10-17。检查范围为 `docx-compare.ts`、`docx-readonly.ts`、三个新控件/视图、局部 CSS 和 DocxEditor / DocxViewControls 最小整合。遵循已批准 `docx-compare-split-next-20261017.md`。生产冻结；本报告不代替根会话真实浏览器验收。

## Findings (fixed)

- File: `packages/office/src/editors/docx-compare-split.css`
  - Issue: 空白保留规则仅覆盖 `p`，标题与列表项仍用浏览器默认折叠连续空格和制表符，副本可能与活正文文字显示不同。
  - Fix: 将 `white-space: pre-wrap` 放到只读正文滚动根，供全部白名单正文节点继承；不改变头部、主编辑器或保存路径。真实浏览器中的标题/列表双空格确认交根会话。
- Files: `docx-compare.test.ts`、`DocxEditor.compare-split.test.tsx`
  - Issue: 原测试未覆盖 ZIP 部件总数/累计解压量/非压缩单部件预算、表格节点预算、读取失败保留所选文件重试，以及重选后旧请求迟到的独立分支。
  - Fix: 增加真实 ZIP 和真实 DocxEditor 回归，验证旧文件不覆盖新结果，重试无需重选，JSON/版本/undo/redo 深度保持。
- File: `.trellis/spec/office/frontend/editors/conventions.md`
  - Fix: 同步本地对比/安全只读拆分的实际边界、唯一编辑器、白名单、安全预算和单调请求失效约定。

## Review evidence

- 左右两侧均调用 `extractCompareBody`。未保存真实表格文字不经过原件 preview；空段/重复段/硬换行/行格段边界有直接测试。
- 连续变化片段先完整收集再逐项配对，过量项独立计新增/删除；LCS 在分配前限制块数乘积。
- 文件选择前大小检查，BoundedZip 预检累计/单部件/部件数后才调用原生 openDocx；提取时节点/字符/块预算另行限制。
- 请求 token、版本、Editor 生存期共同检查；编辑→Undo、关闭、来源 A→B→A 和文件重选均不可复活旧结果。失败保留选择供显式重试。
- AST 仅消费已知 PM 节点和经验证标量样式；无 raw HTML / attrs spread / 原 ID / link URL / event / form / 外部资源。half-point 字号与 twip 段落/格边距换算一致；标题 7–9 保留逻辑级别。
- 主 EditorContent 和原 scroller 始终挂载；副本独立 scroll。真实 Editor 专项覆盖版本/history/selection/dirty 和无操作导出的全部非目录 ZIP 条目逐字节相同。

## Findings (not fixed)

- 未发现需产品决策的代码缺陷。实际浏览器 1280/420、短高度布局、折叠入口/可见回焦、双空格呈现、本地 chooser 与导出读回仍由根会话验收；组件测试无法证明实际尺寸与像素效果。
- 明确边界保留：文字对比不是 Word 合并修订；复杂对象/嵌套表格计为排除；只读连续拆分不承诺完整样式级联或原生分页。
- 全仓 `pnpm check` 的既有 bundled Impeccable lint 阻断已由主会话记录，本片不重复运行；无真实模型/桌面验收声明。

## Verification

- Tests: **5 files / 44 tests passed**, exit 0。`pnpm --filter @mimir/office exec vitest run src/editors/docx-compare.test.ts src/editors/docx-readonly.test.ts src/editors/DocxEditor.compare-split.test.tsx src/editors/DocxEditor.views.test.tsx src/editors/DocxEditor.ink.test.tsx`，日志 `/tmp/mimir-docx-compare-check-tests.log`。
- TypeCheck: **pass**，`pnpm --filter @mimir/office typecheck` exit 0，日志 `/tmp/mimir-docx-compare-check-types.log`。
- Lint: **pass**，目标 10 TS/TSX 文件 oxlint exit 0，无 warning。
- Format: **pass**，目标 11 文件 oxfmt --check exit 0。
- Styles: **pass**，`node scripts/check-style-backticks.mjs` exit 0；CSS 编辑时 Impeccable hook 无确定性告警。
- `git diff --check` 目标已跟踪整合/规范文件 exit 0。
- 未运行 full suite / Web build；未修改 vendor、暂存、提交、归档、上传或删除文件。生产仅 CSS 局部修复，已通知根会话重建。

## 浏览器编号缺陷追加修复

根会话真实 fixture `CW8_iLE7yyU8Zyez` 发现主文档为 `5.` / `b)` / `6.`，原拆分副本却重建成 `1.` / `1.` / `2.`。原因是副本丢弃 numbering.xml 及活列表定义，用独立自增计数加原生 ol 默认标记冒充编号。

修复位于 `docx-readonly.ts`、`DocxSplitView.tsx`、局部 CSS，DocxEditor 仅新增 `numbering={editor?.storage.listNumbering.defs}` 接缝后立即释放给保护实现者。沿同一原生 `computeListMarkerInfos` 收集文档顺序的列表与受保护 stray 引用，包含普通表格；处理起始覆盖、多级编号、共享计数、删除段标记及未保存定义。只渲染有界的原生 marker.text，关闭浏览器默认标记；未知定义、图片标记（含缺失图片）和过长标记明确提示，绝不使用原资源 URL 或生成误导数字。

追加专项：`docx-readonly.test.ts`、真实 `DocxEditor.compare-split.test.tsx`、`docx-toolbar-render.test.tsx`。真实 DOCX 解析后的主文档与副本同为5/b/6；活列表重启为9再Undo恢复5，正文编辑与Undo保持编号，无操作导出全 ZIP 精确。根会话全量基线唯一失败为旧分类测试遗漏已验收「绘图」，已按真实九分类准确同步，未移除原命令断言。

目标三文件43/43通过（`/tmp/mimir-docx-split-numbering-tests.log`），目标lint exit0（已有toolbar测试辅助函数作用域warning一项，非本片新增），format、styles及diff通过。类型首轮只被另一在途 `docx-protection.ts` 的三个string|undefined错误阻挡；最终重跑这些已消失，仅余对方 `docx-protection.test.ts:99` 把Uint8Array传给partBinary的类型错误（日志 `/tmp/mimir-docx-split-numbering-types.log`）。根会话统一稳定检查时重跑。当前生产已再次冻结，实际像素编号由根会话统一构建复验。
