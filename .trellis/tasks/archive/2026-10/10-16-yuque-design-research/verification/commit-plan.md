# 已批准提交方案

最终完整质量门已通过（4231通过 / 2既有跳过，1714源码/配置摘要不变）；用户已回复“提交”，确认按下列两批执行；第一批检查工程提交为`7500b69`，第二批与归档结果见Git日志和会话记录。不触碰现有index，不包含其他Office功能，不推送。

1. `fix(check): bound repository scanning and await editor submissions`
   - `.oxlintrc.json`、`.oxfmtrc.json`：只排除三份第三方发布脚本和本地依赖缓存。
   - `packages/office/src/editors/PptxTableControls.test.tsx`、`PptxEditor.test.tsx`：真实提交完成/条件等待。
   - `packages/office/src/editors/XlsxEditor.pivot.test.tsx`：**仅等待helper独立hunk**；并行透视布局功能测试新增内容不整份提交。
   - `apps/server/src/test/pdf-preserving-forms.test.ts`：仅重型保真单例20秒预算（以最终修复diff为准）。
   - `.trellis/spec/project/quality.md`：检查输入边界与异步等待契约。
2. `fix(ui): fit compact commands and sync browser theme color`
   - `packages/office/src/editors/CompactToolbar.tsx`、`CompactToolbar.test.tsx`、`compact-toolbar.css`：44–72px实际预算，标签折行，六组可达。
   - `apps/web/index.html`、`packages/renderer/src/theme/appearance.ts`、`appearance.test.ts`：首帧/运行时浏览器主题色同步。
   - `.trellis/spec/office/frontend/editors/conventions.md`：**只提交第一段工具栏44–72px合同的独立hunk**；其他Office规范修改保持原状。
   - 本任务implement/PRD及verification新增、校正报告和截图；文件清单以`commit-review-manifest.json`中本任务目录为准。

## 混合/并行文件，排除整文件提交

- `packages/office/src/editors/DocxEditor.protection.test.tsx`：我方仅补trackedChanges行真实密码门及期望说明；文件另含大量并行能力测试，应随对应Office功能由其owner提交，不能整份纳入此任务。
- `packages/office/src/docx-protection-settings.test.ts`：我方仅补100000-spin单例120秒预算；整个文件为其他会话新增保护功能，应随该功能提交。
- `.impeccable/config.json`：含已有豁免与我方中性blockquote边框豁免，未识别部分不自动提交。
- 其余技能安装、Office/API/共享协议、二进制夹具和其他任务文件全部排除，完整快照见`commit-review-manifest.json`。快照可能随并行会话继续变化，执行提交前重新核对，不以路径前缀替代hunk所有权。

按`.trellis/workflow.md`阶段3.4要求的一次确认已收到。授权仅覆盖上述批次及独立hunk，不会使用`git add .`，不夹带其他会话改动。
