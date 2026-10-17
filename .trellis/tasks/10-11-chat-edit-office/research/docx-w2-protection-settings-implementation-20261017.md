# DOCX W2 原生保护设置与停止限制实施

2026-10-17。实现切片完成并冻结，交主会话安排独立 check；本报告不是整体工具完成、真实浏览器验收或统一构建通过声明。

## 范围与参考

按 `docx-protection-password-next-plan-20261017.md §W2`。固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 的 protection/ProtectDialog 语义，以及 root 已记录的同日 WeKnora 官方站点/公开源码证据：v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24`，官网与 definitions 缓存 SHA256 分别 `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`、`3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0`。复用已核对证据，没有声明新联网成功。WeKnora用于能力门及真实失败状态，不用于 Word 凭据算法或工具栏视觉。

只补 W2。强制修订事务执行 T、打开密码加密 E、实际元数据清理 P 继续独立推进；没有用单个 settings 标志冒称它们完成。

## 实现

- 四种原生 `documentProtection` 模式启用/停止、建议只读、限制密码与修改密码显式 preserve/replace/clear。空 replacement 拒绝；未选择 clear 不把空值当移除。
- 已有修改密码须先按 W1 验证。带密码的 enforced documentProtection 另核其原生凭据，正确修改密码不能代替限制密码。未知/旧式/损坏凭据保持拒绝。
- 新凭据沿同一每请求 module Worker 计算，随机16字节盐、SID14/SHA512、默认100000次。生成响应验证实际长度/算法/迭代数及协议字段；30秒、取消、错误、卸载/换源终止并结算。未在主线程做重复 digest。
- 私有 controller 保存有界授权候选（最多100份、XML总计16MiB）；PM只记不透明历史身份。候选捕获原内容与 options 指纹，准备期间冻结输入，await 后复查 epoch/request/原身份。发布前实际验证 settings part/relationship/ContentType；拒绝/抛错发布者删除其候选，不能保留可重放的失败身份。
- 一次真实 PM doc-attribute 事务、一次历史步骤，前后 closeHistory 隔离；Undo/Redo同步策略，保存后仍保留。设置草稿、核验、hash、失败及取消均不产生 PM/history/dirty。设置身份参与当前副本 dirty 与保存基线，保存仍保留 W1 的最终 epoch/assertSave 与 Editor source/session/handle 检查。
- `docx-protection-settings.ts` 用有界 namespace-aware XML span 补丁；单双引号、等号空白、前缀重绑定、注释/opaque CDATA及未知原生设置不全量重序列化。沿实际 settings relationship；缺失时原子建立合法 part、relationship、ContentType，严格文档的新关系使用 strict URI。合并内容 writer 的 settings shell 时只替换实际授权的保护节点，保留其余 settings 改动。
- 停止 forms/comments 后，已接受的受限改动仍优先走原有 native preserving writer；避免因为新策略 writable 而把未知段落属性/讨论结构重新生成。确有后续普通正文编辑才回正常 writer。
- 当前 Inspector 内部滚动/固定页脚，单一主动作“应用保护设置”，标准 Antd 密码显隐、确认输入、Enter、本地处理/取消/错误、Escape沿原 Inspector 关闭回焦契约。设置界面与现有修改密码核验明确分开。
- 应 root 实际浏览器 finding，W1 显式“取消验证”的鼠标/键盘激活在仍属于当前面板时回当前修改密码输入；不会在 source 切换/外部已移焦时抢焦点。Escape仍关闭面板并回真实文档保护入口。

## 修复及回归证据

1. 新身份原先使 canonical root 从无 attrs 变空 attrs，导致保护事务错误拒绝；只在 doc 根忽略本地 opaque 身份，同时保留其他未知属性的验证。规范化真实 schema 的 mark 顺序，避免只因挂载排序把合法原件判断为正文修改。
2. 停止 forms 后普通 writer 会丢原段 `x:keep`；新增停止前后的 document.xml 精确比对，并优先保留原 native forms writer。comments 同样覆盖停止前后的非 settings 条目精确比对。
3. 发布 callback 抛错可能遗留私有候选；新增原生测试保存捕获身份、尝试原始 PM 重放，确认零发布/零历史且身份无效。
4. 新保护设置与正在 await 的旧内容保存并发时，最终 epoch 守卫拒绝旧结果。

## 文件

生产：

- `packages/office/src/docx-protection.ts`
- `packages/office/src/docx-protection-password.ts`
- `packages/office/src/docx-protection-password-crypto.ts`
- `packages/office/src/docx-protection-password.worker.ts`
- 新 `packages/office/src/docx-protection-settings.ts`
- `packages/office/src/docx.ts`
- `packages/office/src/editors/docx-protection.ts`
- `packages/office/src/editors/DocxProtectionControls.tsx`
- 新 `packages/office/src/editors/DocxProtectionSettingsControls.tsx`
- `packages/office/src/editors/docx-protection.css`
- `packages/office/src/editors/DocxEditor.tsx`

测试：新 `docx-protection-settings.test.ts`、新 `editors/DocxEditor.protection-settings.test.tsx`、追加 `editors/DocxEditor.password.test.tsx`。唯一规范归属 `office/engine/conventions.md` 补 W2 契约。

## 自验

- 目标 W1/forms/comments/保护 + W2：**9 files / 122 tests pass**，`/tmp/mimir-w2-final-tests.log`。这轮包含17个新 native settings 用例及3个真实 Editor 用例。
- 随后添加“先改正文再设限制”的最后边界回归，最终 settings/Editor **2 files / 21 tests pass**，`/tmp/mimir-w2-final-settings-tests.log`；没有把两轮拼称9 files123全跑通过。
- W1最终 focus 修订后，真实 Editor 密码/取消/源码生命周期 **7/7 pass**，`/tmp/mimir-w2-final-focus-tests.log`。
- Office `tsc --noEmit` 最终 exit0，`/tmp/mimir-w2-types-final.log`。过程中的自身测试类型错误已修；其他 PPTX owner 过渡类型错误未改。
- 目标13 TS/TSX oxlint最终无诊断；14 TS/TSX/CSS oxfmt check通过。`/tmp/mimir-w2-final-lint.log`、`/tmp/mimir-w2-final-format.log`。
- 三个涉及 UI 的目标 Antd lint issues0、无 skipped/partial；`/tmp/mimir-w2-final-antd-{state,settings,editor}.json`。
- style guard及`git diff --check`通过；`/tmp/mimir-w2-final-styles.log`、`/tmp/mimir-w2-final-diff.log`。
- 没有运行全 Office/server suite、Web build、Desktop 或 provider/model调用；没有重跑480条skill lint基线的全仓 check，交 root统一处理。

## 真实浏览器夹具交接

独立 Python zipfile/hashlib 创建，基底为当前 vendor kitchen-sink。每份12条目，明确包含真实 settings part、settings relationship及ContentType；原 opaque 子节点/注释可用于保存比对。另用生产 openDocx + 未改生产 Worker 对这三个实际路径跑 **1/1 smoke pass**，`/tmp/mimir-w2-browser-fixture-smoke.log`；临时 harness `/private/tmp/mimir-w2-fixture-smoke/`，不加入仓库测试依赖。

| 文件 | SHA256 |
| --- | --- |
| `/tmp/mimir-docx-w2-20261017/password-readonly.docx` | `0a55f8432a5acac589f2a71f973800c82e32d38a1223941a257e49f2de77e727` |
| `/tmp/mimir-docx-w2-20261017/no-password-readonly.docx` | `e4998c4bccdf8aafa7aead53c2872805543338529db801c28cea9448360dc4f4` |
| `/tmp/mimir-docx-w2-20261017/unprotected.docx` | `7d55dc541b0f23168a5fb63979ec1488e80dd0dfba6830306aca56b56d4a62ad` |

`password-readonly.docx` 的测试修改密码 `editor`（spin0），独立限制密码 `restriction`（spin1024）；均用 Python按UTF16LE/SHA512独立产生。smoke确认错误限制密码拒绝、正确限制密码到达发布器而无实际发布、no-op整件字节相同，另两份真实打开状态正确。尚未上传或改变浏览器原件。新设/更改密码的真实 CUA 浏览器动作仍由 root 按工具的用户接手要求处理；native/自动化组件测试没有替用户操作浏览器凭据设置。

## 明确边界与后续

- root需独立 check、统一构建，以及1280和420×500真实浏览器的滚动/固定footer/错误/键盘/焦点/native save/reopen验收。
- 若启用 comments/forms 前当前副本已有普通正文改动（包括同会话已保存后仍持有的原件基线），原有限定适配器不能据旧原件证明新的锚/控件身份。当前副本立即保守只读，明确提示保存重开再用受限工具；授权内容可正常写出，重开按新的原件判断。未把不确定新目标当可写。
- trackedChanges原生设置可写/停止，但强制记录待T，本片仍只读。E/P继续独立，不涉及打开密码/实际metadata scrub。
- 不改 vendor，无 stage、commit、archive或测试文件删除。整体任务/goal继续 in_progress。
