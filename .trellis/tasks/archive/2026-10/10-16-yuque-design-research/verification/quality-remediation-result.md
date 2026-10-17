# 授权范围内的检查工程修复

日期：2026-10-17。用户已明确批准“一并处理，完成全仓检查”。本报告仅记录本子任务实际修改与运行结果；完整质量门由主会话继续核验。

## 最小修改边界

- `.oxlintrc.json`、`.oxfmtrc.json`：仅排除三份已安装 Impeccable 的 `scripts/**` 发布目录（`.agents` / `.claude` / `.github`）和根 `.pnpm-store/**` 缓存。保留产品源码检查与全部原规则，不修改第三方发布内容。原 formatter 已有更广的 `.agents/**`；本次未扩大它。
- `packages/office/src/editors/PptxTableControls.test.tsx`：`submit` 从固定35ms与最多40次5ms轮询改为等待本次真实 apply promise，在 React act 结算后确认 busy 已解除。迟到提交用例保留当前已有 canvas 发布信号，放行后等待包装 apply promise，而非只等待其内部 pending gate。原先的新草稿、原生 XML、保存重开和按钮断言保持，并额外确认没有 busy 残留。
- 未改 Office 产品实现，未格式化或覆盖并行 DOCX/PDF/XLSX 工作，未提交。

## 时序根因与受控正反例

当前基线 HEAD 为 `4b5b862`，并行 Office 提交中已经包含迟到用例的 `await published` 改进，因此不能把旧摘要中的35ms写成当前同一行源码。当前 setup 的普通 submit 仍有时间轮询，且迟到用例只等待内部 gate；本次补齐真实完成屏障。

在测试临时实验中给 originalApply 前增加100ms受控延迟：

1. 恢复旧35ms等待时，canvas 尚未发布便开始编辑“从左到右”草稿，随后发布的新版本会按既有生命周期重置旧版本草稿；原有保留新草稿断言确定失败，实际为“从右到左”。日志 `/tmp/mimir-yuque-remediation-pptx-negative.log`（1失败、12未选中）。
2. 同样100ms延迟，使用明确的 published 信号与完整 apply 完成屏障，原断言通过。日志 `/tmp/mimir-yuque-remediation-pptx-controlled.log`（1通过、12未选中）。
3. 实验延迟已移除，最终源码不含 setTimeout。最终单文件13项全部通过，日志 `/tmp/mimir-yuque-remediation-pptx.log`。

这证明固定时长不代表 canvas 版本推进；内部 gate resolve 也不是包装请求及组件 finally 的完成信号。未通过放宽行为断言消除失败。

## 已完成检查

| 命令 | 结果 | 日志 |
| --- | --- | --- |
| 修复前 PPTX 单文件 | 13项通过，确认当前基线 | `/tmp/mimir-yuque-remediation-pptx-before.log` |
| 最终 PPTX 单文件 | 13项通过 | `/tmp/mimir-yuque-remediation-pptx.log` |
| `pnpm exec oxlint packages/office/src/editors/PptxTableControls.test.tsx` | 退出0 | `/tmp/mimir-yuque-remediation-scoped-lint.log` |
| `pnpm lint` | 退出0；保留现有 warnings | `/tmp/mimir-yuque-remediation-lint.log` |
| `pnpm format:check` | 退出0，1520文件格式正确 | `/tmp/mimir-yuque-remediation-format.log` |
| 限定 `git diff --check` | 退出0 | 当前三文件 diff |

## Office 全套

`pnpm --filter @mimir/office test` 已真实退出1，198.29秒：219文件中213通过、6失败；2492项中2480通过、12失败。日志 `/tmp/mimir-yuque-remediation-office.log`。本次PptxTableControls没有失败，之前的未卸载root异常未重现；但其他失败仍阻止Office与全仓质量门通过。

失败分布：

- `src/docx-encryption-check.test.ts`：7项，6个非法XML预拒绝断言与合法 `__proto__` namespace解析。
- `src/docx-protection-settings.test.ts`：1项，100000-spin原生密码用例20000ms超时。
- `src/editors/DocxEditor.protection.test.tsx`：1项，trackedChanges当前editor.isEditable预期false而为true。
- `src/editors/DocxEditor.compare-split.test.tsx`：1项，来源A→B→A后旧比较面板未消失。
- `src/editors/PdfEditor.content.test.tsx`：1项，真实宿主替换原文字后的settle条件未满足。
- `src/editors/PptxEditor.test.tsx`：1项，本地GIF插入后预期picture节点未出现。

全套运行期间并行源码继续推进到 `3fc7e2d`，因此这不是稳定单一提交的验收证据；主会话已协调对应DOCX工作，后续须对稳定当前源码跑原样完整 `pnpm check`。本子任务未修改这些6个文件或相关生产实现，未重启该测试进程掩盖失败。
