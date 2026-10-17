# PPTX 动画数量全套失败独立复核

2026-10-17。root 在统一全 Office 结果 `178 files / 1868 pass / 1 fail` 中发现 `PptxEditor.test.tsx` 的“讲稿、换页时间和动画顺序有当前状态并保存重开”期望2动画、实际1。原日志：`/tmp/mimir-office-full-c1-pivot-source-20261017.log`。本片仅改该测试和包级坑表；没有修改 PPTX 生产、C1、XLSX、vendor、server 或 shared。

## Findings (fixed)

- File: `packages/office/src/editors/PptxEditor.test.tsx`
- Issue: 本例使用的旧 `settle` 最多轮询60次、每次2ms，耗尽后静默返回。等待动画数量或按钮解锁不成功时，测试仍会继续选效果、点击可能仍禁用的按钮并切时间线，随后在即时断言报告1/2差异。原失败在重排及保存之前，不能据此判断保存丢失动画。
- Fix: 本例的动画步骤改为必须断言成功的条件等待，要求动画数已发布、面板 `aria-busy=false` 且保存已解锁，超时直接报告对应未满足条件。没有增加固定 sleep、修改全局 testTimeout、删除数量或原生断言。
- Regression: 第二次真实 `upstreamHostApply` 已生成字节后，用可控 Promise gate 暂停接受；独立 `openPptxForEdit` 读取该宿主结果，确认包含2动画。接受前验证面板仍显示1、添加及保存禁用；此时切时间线，再释放 gate，验证界面接受2动画。继续实际上移、原生保存重开得到 spin/fade，删除后再次保存重开只剩 fade，讲稿及8000ms换页时间仍保留。
- Spec: `.trellis/spec/office/frontend/editors/pitfalls.md` 补充连续动画测试的完成屏障和可控宿主证据，避免把静默轮询耗尽当成成功。

## 原因证据

1. 原例单独执行通过：`/tmp/mimir-pptx-animation-count-repro-20261017.log`；原文件与动画控件一起执行91/91通过：`/tmp/mimir-pptx-animation-count-baseline-20261017.log`。这些通过本身不能排除生产问题。
2. 保留旧等待逻辑，只挂起第二次真实宿主返回，并在挂起前独立读出2动画，稳定在同一时间线断言复现 expected2/got1。此时 UI 明确“正在应用修改”、有取消按钮：`/tmp/mimir-pptx-animation-count-held-before-20261017.log`。说明旧等待确实能在未满足条件时继续运行，不能充当事务完成屏障。
3. 最终测试保留同一 gate，改为明确检查 pending 与释放后的已接受状态，整路径通过。没有确认生产动画写入/保存回退缺陷，因此不改生产。

## Findings (not fixed)

- 其他历史测试仍使用旧 `settle`。本片没有批量替换共享等待策略；没有其他具体失败证据，避免把单例检查扩成全测试迁移。需要处理时应逐例确定成功条件，不能统一放大等待数字。
- 本片不运行重型全 Office/Web build，不做真实模型、Desktop 或浏览器声明。root 统一重跑全套并继续浏览器验收。

## Verification

- Tests: 修复后该真实宿主 gate 路径1/1通过：`/tmp/mimir-pptx-animation-count-held-after-20261017.log`。最终完整 `PptxEditor.test.tsx` + `PptxAnimationControls.test.tsx` **91/91 pass, exit0**：`/tmp/mimir-pptx-animation-count-check-final-20261017.log`。
- TypeCheck: Office `tsc --noEmit` **pass, exit0**：`/tmp/mimir-pptx-animation-count-check-types-20261017.log`。
- Lint: 目标 oxlint **pass, exit0**：`/tmp/mimir-pptx-animation-count-check-lint-20261017.log`。新增条件内 expect 已改为捕获原生数量后在主流程无条件断言；等待 helper 放到测试模块私有函数。
- Format: 目标 oxfmt **pass**：`/tmp/mimir-pptx-animation-count-check-format-20261017.log`。
- Diff: 目标 `git diff --check` **pass, exit0**：`/tmp/mimir-pptx-animation-count-check-diff-20261017.log`。

测试与生产冻结交 root。无暂存、提交、归档或测试文件删除。
