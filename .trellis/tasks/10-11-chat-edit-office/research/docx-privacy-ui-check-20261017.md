# DOCX P UI 与 persisted scrub floor：正式独立检查

2026-10-17 `/root/docx_privacy_ui_check`，已直接执行 trellis-check，未再次派发子 agent。按 UI followup/implementation、P native 前次独立检查、PRD/design/implement 与适用 engine/editor/shell/project 规范核对。本报告仅覆盖本片，不代表全工具完成。

## Findings (fixed)

**没有发现新的生产代码缺陷，未修改生产代码。** 保留现有全部回归，并在两个既有测试文件追加 8 个独立用例：

- `packages/office/src/editors/DocxEditor.privacy.test.tsx`：隐私应用与其前后真实正文输入具有独立 Undo/Redo 边界；true 候选生成跨 source 切换不得调用库 IO；旧 source 已发出 IO 成功后不得推进新 source 的清理基线、改变文档/版本或清除新编辑 dirty，随后新 source 的 false 保存仍保留未清理作者。
- `packages/office/src/docx-privacy.test.ts`：四类保护分别验证合法根 boolean 不得豁免正文节点上的同名属性，畸形根值必须拒绝，合法 false no-op 保留整件原字节；成功清理再关闭设置后的原件重新打开，虽无旧 session floor，仍精确保留已清理结果及全部非目标 ZIP 条目。

新增测试首次静态检查指出一个无消息 `toThrow()`；已按实际四模式错误收紧为明确消息（trackedChanges 为“强制修订”，其余为“原件”），最终 native 76/76 和 scoped lint 通过。未降低断言、扩大超时或跳过测试。

## 已核实的实际路径

1. `docx.ts` 从私有原件读取 native flag；PM 仅保存 boolean/null 意图。root 意图与 SaveOptions 冲突拒绝。canonical 仅排除自有根 boolean，正文/未知属性与畸形值继续受完整保护比较约束；dirty fingerprint 包含隐私意图。
2. Native 所有保存出口进入最终 privacy pass，vendor 提前清理被关闭。四类保护既在 PM transaction 拦截，又在最终包实际变化处拒绝；干净 no-op 保留原字节。前次 XML namespace/lexical 及公开原字节变更的回归继续通过。
3. 候选按 session 私有 WeakMap 绑定返回的 Uint8Array 身份；跨 session、复制 bytes、重复 ACK 拒绝。floor 只由 own candidate 的成功库 IO 路径 ACK 推进；失败、普通导出和生成本身不推进。floor 单调，false 保存仍保持 off/native flag 语义但不恢复原姓名。
4. Editor 的 saveRequest 从 native 生成开始占有，贯穿 IO 与 ACK，finally 释放；既有真实 Editor 延迟 finalizer/IO 测试证明第二次保存不并发。旧同文档 IO 成功后仍 ACK 自己已写入的快照；若已有新版本，保留新意图与 dirty，不错误 markSaved。
5. 生成中的旧 false 副本跨 true 成功 IO 时因 scrub epoch 变化拒绝；导出发布前另验 own candidate。source/session/handle 变化前后的迟到结果不发布到新文档。
6. 实际 Editor 入口为审阅→保护组“个人信息”，受保护仍可发现并解释。Switch 草稿不写 PM；应用一个隔离历史事务，同值 no-op；body/options 版本变化要求重新读取，异步 native 读取绑定 source/session。CSS 为现有 320px Inspector 的内部滚动和固定单主动作。这里只核对代码/DOM测试，未以 happy-dom 推断真实像素、滚动和焦点效果。

## Findings (not fixed)

- **共享 spec 同步待 root**：engine/editor conventions 尚无 P 的唯一现行条目；本次共享规范由 root 持有，checker 未越权修改。建议在 engine 记录私有原件/native 最终包关系定位、严格 namespace/lexical 校验、保护实际差量拒绝、只清已知 metadata、own candidate 成功库 IO ACK 的单调 floor 与旧候选拒绝；在 editor 记录 boolean/null 的单 PM history 意图、草稿/相同值 no-op、source/version 失效、整段生成+IO互斥及旧保存不清新 dirty、导出不 ACK、关闭开关不恢复已保存清理的姓名。
- **最新构建浏览器验收待 root**：1280×800 与 420×500，具名折叠菜单关闭、真实 Switch、内部滚动、固定 primary、Escape/关闭回 live 入口及 native save/Undo/Redo 尚需统一实测。未修改这项边界，也未声明已通过。
- 未做 full Office/server/build/Desktop/真实模型验收；没有本片未修复的算法、类型或 lint 故障。E0/PDF/server/vendor 未修改；不将其状态合并为本片结果。

## Verification

- 基线：9 files / **230 tests PASS**，14:19:55，28.32s，`/tmp/mimir-p-ui-independent-baseline-20261017.log`。
- 新增 actual Editor 三项后：**18/18 PASS**，14:20:29，5.61s，`/tmp/mimir-p-ui-independent-boundaries-20261017.log`。
- 包含新增 8 项的相同 scoped suite：9 files / **238 tests PASS**，14:21:22，29.35s，`/tmp/mimir-p-ui-independent-final-20261017.log`。明确文件为 privacy native/actual Editor、protection、protection-settings、forced-tracking、docx、actual Editor protection-settings、protected-comments、protected-forms，`--maxWorkers=1`。
- 最终收紧新增断言后 native：**76/76 PASS**，14:22:05，2.05s，`/tmp/mimir-p-ui-independent-native-final-20261017.log`。
- **TypeCheck PASS**：Office `tsc --noEmit` 两次，最后 `/tmp/mimir-p-ui-independent-types-final-20261017.log`。
- **Lint PASS**：10 TS/TSX scoped oxlint，最后 `/tmp/mimir-p-ui-independent-lint-final-20261017.log`（重新覆盖先前新增测试的单项消息诊断）。Antd lint `DocxPrivacyControls.tsx` 0 issues；style-backticks PASS。
- **Format PASS**：11 文件 oxfmt，`/tmp/mimir-p-ui-independent-format-final-20261017.log`，最终两测试格式复跑 PASS；scoped `git diff --check` PASS。
- 未重复已知 480 skill lint 基线的全仓 `pnpm check`，不把 scoped green 写成全仓 green。未上传、删除、暂存、提交或归档。

## 参考与冻结

主参考沿固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`；实际复读本地 `packages/docx-engine/src/patch.ts:1743` 起的 flag/native metadata 代码。WeKnora 沿同日已固定官网/源码证据 v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24`，SHA256 `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe` / `3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0`，没有宣称重新联网。WeKnora 仅用于真实能力/知识库边界；Office native 设置来自固定 GenOffice，布局沿项目现行 Inspector。

本 checker 的两个测试文件及本报告已冻结；生产文件保持 implementer 冻结版本。限定代码检查通过，可由 root 统一构建/浏览器并接续 E1，整体任务继续 in_progress。
