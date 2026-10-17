# PDF 原子批次独立检查

日期：2026-10-17。按 trellis-check / trellis-before-dev 对已冻结实施片检查并局部自修。任务整体继续 in_progress；本文只覆盖三个 apply_ops 操作及其原子发布接缝。

## Findings (fixed)

### 1. 无页树变化时无条件重建原生书签

- File：`apps/server/src/services/pdf-local.ts`。
- Issue：native apply_ops 在只改便笺、文字标注、metadata、表单或旋转时仍无条件调用 setOutline。原生 GoTo/XYZ 目的地被简化成 Fit，颜色和字形等未建模属性也丢失；新批注操作进入此路径会改坏非目标结构。
- Evidence：新增原生测试先失败，原 Outlines 引用 `25 0 R` 被替换成 `31 0 R`。夹具包含 GoTo/XYZ、坐标、缩放、C/F 及 PageMode。
- Fix：仅删除页或调序时沿既有目录映射重建；其它批次保留原 Outlines 对象图。最终测试逐项比较根、原生节点和引用，确认非目标结构精确保留。没有改变现有页面迁移策略或放宽 guard。
- Regression：`apps/server/src/test/pdf-atomic-batch.test.ts`，并同步唯一合同 `.trellis/spec/shared/contract/pdf-agent.md` §14。

### 2. 表单预检失败丢失原批次序号

- Files：`apps/server/src/services/pdf-forms.ts`、`pdf-local.ts`。
- Issue：preparePdfFormValues 在逐项 native try/catch 之前运行；非法字段等预检失败没有批次序号，客户端 nativeIndexes 无法映射回移除 T 之前的原始序号。
- Fix：保留 helper 签名和类型，只为逐项表单预检错误标明表单局部序号；apply_ops 调用侧按同一个操作对象恢复 native 原索引，并使用既有 `PDF 批次第 n 项` 前缀。Office 既有映射再恢复含 T 的原索引。全局结构/字体资源错误继续使用实际原因，不猜测字段身份。
- Regression：HTTP 在三项 native 操作后加非法表单，返回第4项、400、无字节；真实 Editor 在 T 删除+metadata 后加非法表单，返回第3项，字节、pending、dirty 和版本精确不变。

## Findings (not fixed)

本次检查没有剩余待修代码问题。批准方案中的边界保留：legacy R 与 pending T 无可靠账本时拒绝；有页面操作的成功批次物化幸存 T；原文与普通批注默认严格 guard 不放宽。页面删除/调序继续使用既有建模目录映射，本文不扩大到任意原生书签结构迁移。

## Review evidence

- 候选从 raw pending.base 重放，不把已烘焙 snapshot 当基底；无页操作保留幸存 T 的原 ID、坐标与修改后 raw base。真实 PDFium/PDF.js 回归含 Rotate0/90/180/270 和 offset CropBox，后续移动/编辑/删除仍保留新便笺。
- native 操作使用单个 detached 图和声明顺序；当前页归属沿 Catalog.Pages 遍历，删除页后再编辑其批注拒绝，反向顺序可完成。
- Editor 在所有异步校验后一次同步发布；dry_run、末项失败、取消、外部改稿、换文档及保存中拒绝无部分发布。一次版本/dirty/history、整轮回退、保存后撤销重做字节已有真实组件契约覆盖。
- HTTP 使用仓库测试账号与隔离测试库，验证鉴权、严格 schema、版本、无工作字节持久化和库存原件逐字节保留。

## Verification

- Office：最终7文件 **62/62**，`/tmp/mimir-pdf-atomic-check-office-final.log`。范围：pdf-agent、pdf-batch、PdfEditor batch/content/forms/pending-forms/local。
- Server：最终7文件 **39/39**，`/tmp/mimir-pdf-atomic-check-server-final.log`。范围：atomic-batch、annotations、forms、preserving-forms、local、local-route、catalog。
- TypeCheck：Office / server最终exit0，日志 `/tmp/mimir-pdf-atomic-check-office-types-final.log`、`/tmp/mimir-pdf-atomic-check-server-types-final.log`；shared exit0，`/tmp/mimir-pdf-atomic-check-shared-types.log`。
- Lint：14源/测试文件目标oxlint exit0，`/tmp/mimir-pdf-atomic-check-lint-final.log`。
- Format：同14文件oxfmt check exit0，`/tmp/mimir-pdf-atomic-check-format-final.log`。
- Diff：目标git diff --check exit0，`/tmp/mimir-pdf-atomic-check-diff-final.log`。
- 无新 CSS，无需额外样式数值验收；没有本轮 Web build、fullOffice/fullserver 或全仓check。已知全仓技能lint基线不在此片修改。

## Evidence boundary / handoff

实际 Editor 测试使用真实宿主/字节/画布句柄；Canvas renderer只记录发布字节，不能冒充浏览器画面或模型端到端。当前无模型配置，本片没有模型调用、浏览器隐藏handle驱动、上传运行实例或删除测试件。root继续真实手动UI/统一构建验收。生产改动已冻结；无提交、暂存、归档或vendor修改。

参考沿批准研究：GenOffice固定`480548fd55f1be3593ee0d8e316a734751d58309`为PDF操作语义；WeKnora官网及v0.8.3/`3e22822c1d2397be730c458c7539d0eb8c113a24`的证据、SHA和适用性见实施计划，仅采用真实能力注册原则，不作为PDF原子编辑或Office外观依据。本次为已有实现检查，没有新增竞品调研结论。
