# DOCX W2 原生保护设置独立检查

2026-10-17，独立 `trellis-check`。本片生产与测试已冻结，交 root 统一构建及真实浏览器验收；不是整体工具完成声明。

## 范围与证据

依据 `docx-w2-protection-settings-implementation-20261017.md`、`docx-protection-password-next-plan-20261017.md §W2`、当前 engine/frontend 保护契约。直接核对 controller → Worker → PM 保护事务/历史 → session.save → Editor 最终写盘，及有界 namespace-aware settings writer。

文件编辑基准沿既定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`。WeKnora 复用 root 同日已经核对的官方站点和公开源码证据：v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24`，站点与 definitions SHA256 分别 `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe` / `3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0`。本检查未重新联网；其能力门/真实失败原则适用，Word 凭据算法与 Ribbon 视觉不以 WeKnora 为依据。

## Findings (fixed)

### 1. 修改密码验证的鼠标取消仍会丢失焦点

- 文件：`packages/office/src/editors/DocxProtectionControls.tsx`、`DocxEditor.password.test.tsx`。
- 原因：旧测试先显式 focus Cancel，掩盖了 Chromium 将刚禁用的密码输入框焦点移到 BODY 的路径。取消只接受 panel 内的 activeElement，因此真实鼠标取消不恢复输入；共享 ToolbarButton 又有意在 mousedown blur 普通表单输入，不能简单把所有 BODY 都视为来自本面板。
- 复现：新增真实 Editor 回归明确执行输入禁用后的原生 blur，再走 mousedown → click；修前 BODY → password 断言失败，日志 `/tmp/mimir-w2-independent-focus-red-20261017.log`。
- 修复：面板 capture 保存 mousedown 之前的焦点来源。明确取消后接受本面板或 BODY 原点；外部输入被 ToolbarButton 正常 blur 时不把焦点转到密码框。原键盘取消、Escape、source 生命周期仍走既有路径，layout 时再检查当前 live 元素，避免抢外部焦点。
- 回归：新增 BODY 鼠标路径与外部输入反例；密码组件最终 9/9 通过。

### 2. 新限制的受限能力忽略已批准的附加参数

- 文件：`packages/office/src/docx-protection.ts`、`docx-protection-settings.test.ts`；同步既有唯一契约 `office/engine/conventions.md`。
- 原因：新 forms/comments 限制只比较候选正文与原件正文，未比较候选 options。先修改页面背景等附加参数再启用限制，可能仍开放原件受限工具；这些参数并不符合受限 writer 的最终保存合同，继续操作后会被拒绝保存。
- 复现：简单真实原生段落、待保存 `pageColor=ABCDEF`，分别启用 forms/comments；修前两项都错误开放对应受限能力，日志 `/tmp/mimir-w2-independent-options-red-20261017.log`。
- 修复：原件受限能力资格同时比较候选正文及空的原件附加参数基线。存在已批准的附加改动时立即保守只读，并明确提示保存重开；原先已批准的正文/options 仍能通过私有候选保存。此规则与已有正文改动的重开边界一致，不扩大受限 writer。
- 回归：两模式都拒绝提前开放受限能力；保存重开后 restriction 与背景原生值正确。最终 native settings 20/20 通过。

## 独立核对结果

- 停止/变更带密码 documentProtection 使用对应限制凭据，与 writeProtection 修改密码验证分离。未知、旧式、损坏凭据保留并拒绝；保留/替换/清除为明确意图，空 replacement 不作移除。
- 新密码由实际每请求 Worker 随机16字节盐、100000次 SHA512 产生；响应字段/算法/盐/hash/迭代数校验，取消/超时/error/messageerror/来源终止有结算与 terminate。未发现密码进入 PM、Agent、API、日志或存储的路径。
- 私有候选捕获 doc/options，epoch/request/source 守卫覆盖 await；拒绝/抛错发布不留下可重放身份。PM 只记 opaque ID，真正保护事务/Undo/Redo 同步策略，最终 save 重验 epoch 与完整权限。
- settings surgical patch 跟随真实关系，支持 strict/transitional Word namespace、别名前缀/重绑定、单双引号/空白、opaque 节点/CDATA/注释；新增 part/relationship/ContentType 先验证后发布，非目标 ZIP 部件保持。与内容 writer 的 settings 合并仅替换授权保护节点。
- 停止 forms/comments 后已接受的受限改动仍优先原 native preserving writer。相关精确字节回归继续通过。
- 新限制在已有正文或附加改动上不静默回写旧基线：当前副本保守只读，批准内容可保存，受限工具须重开。

## Verification

最终 bounded 目标命令：

`pnpm --filter @mimir/office exec vitest run src/docx-protection-settings.test.ts src/editors/DocxEditor.protection-settings.test.tsx src/editors/DocxEditor.password.test.tsx src/docx-protection-password.test.ts src/docx-protection-password-native.test.ts src/docx-protected-comments.test.ts src/docx-protected-anchors.test.ts src/docx-protected-forms.test.ts src/editors/DocxEditor.protection.test.tsx --maxWorkers=2`

- Tests：**9 files / 127 tests pass**，exit0，`/tmp/mimir-w2-independent-final-tests-20261017.log`。包含20项 native settings、3项 actual Editor settings、9项 actual Editor 密码/焦点及既有 W1/受限 forms/comments/anchors 回归。未把历史轮数累加。
- 真实独立夹具 smoke：**1 file / 1 test pass**，`/tmp/mimir-w2-independent-fixtures-20261017.log`。复跑 `/private/tmp/mimir-w2-fixture-smoke/`，生产 `openDocx` 与未修改的实际 Worker 验证 `/tmp/mimir-docx-w2-20261017/` 三份既有夹具、两种凭据分离、拒绝发布后的 no-op 全件字节相同；未上传或修改这些夹具。临时 harness 只有既有 Vite config native-loader 提示，无运行失败。
- TypeCheck：Office **pass / exit0**，`/tmp/mimir-w2-independent-final-types-20261017.log`。
- Lint：13个目标 TS/TSX **pass / exit0、无诊断**，`/tmp/mimir-w2-independent-final-lint-20261017.log`。
- Format：14个目标 TS/TSX/CSS 最终 **pass / exit0**，`/tmp/mimir-w2-independent-final-format-20261017.log`。过程中新 guard 一行 oxfmt 差异已直接格式化修复。
- Antd：state/settings/Editor 三目标 **issues0、skipped0、partial=false**；日志分别 `/tmp/mimir-w2-independent-final-antd-state-20261017.json`、`/tmp/mimir-w2-independent-antd-settings-20261017.json`、`/tmp/mimir-w2-independent-antd-editor-20261017.json`。
- Style guard、`git diff --check`：**pass / exit0**，`/tmp/mimir-w2-independent-final-styles-20261017.log`、`/tmp/mimir-w2-independent-final-diff-20261017.log`。

## Findings (not fixed) / 交接

本片未留已确认的 W2 代码缺陷。真实浏览器的1280与420×500布局、内部滚动/固定footer、鼠标与键盘焦点、原生保存/reopen/history仍交 root；组件/原生测试不冒称浏览器已通过。

强制修订事务执行 T、整文件加密 E、实际个人元数据清理 P 是已明确分片的后续范围。W2 可原生写入 trackedChanges 设置，但当前仍保守只读；本检查没有把这些能力标为完成。

没有运行全 Office/server suite、Web build、全仓 `pnpm check`（既有480条技能 lint基线保留），这些由 root 统一。未触其他 owner、vendor、浏览器、Desktop 或模型配置；未暂存/提交/归档/上传/删测试件。整体任务继续 `in_progress`。
