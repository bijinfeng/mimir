# DOCX P 原生隐私清理独立复核

2026-10-17，formal `trellis-check`。**首次检查的 6 项真实回归已由原 implementer 修复；下方第二次独立复检通过 P 原生模块与保存接缝的限定范围。** 首次失败证据保留在前半部分。两次 checker 均仅追加原生/真实 session 测试，没有重写解析或保存算法，没有更改 vendor、UI、共享 spec 或其他 owner 文件。可见隐私设置、专属历史、全量集成与浏览器仍未验收，不代表整项 P 或全工具完成。

## 已确认且未修复

### 1. XMLValidator 不保证 XML 实体和字符合法（3 个红用例）

`packages/office/src/docx-privacy.ts::tree` 使用 `XMLValidator.validate` 后，没有进一步校验普通文字/属性里的实体与 XML 字符。实际 validator 对 `&privacyLeak;`、`&#0;`、`&#xD800;` 都返回 `true`。

将实际关联 header 替换为含上述文字的 Word header，`finalizeDocxPrivacy` 均成功返回输出，而非约定的原子拒绝。测试位于 `docx-privacy.test.ts` 新增的 `refuses malformed XML that the upstream validator accepts`；前 3 项失败。需实现者补足有界 XML well-formedness，不将注释、CDATA 或 PI 中的普通文字误当实体。

### 2. Namespace bindings 使用普通对象继承原型（2 个红用例）

`namespace()` 直接读取普通 `Record`，未声明 `toString:author="Secret"` 会取得 `Object.prototype.toString`，并通过 `ns !== undefined` 检查；非法未绑定 prefix 因而未被拒绝。

合法 `xmlns:__proto__="实际 Word namespace"` 则触发原型 setter，未形成该 prefix 的绑定，使 `__proto__:hdr` 与 `__proto__:author` 被误拒绝。新增反例和正常合法绑定用例各一项，均失败。需要实现者修绑定存储/查找，保证 namespace 只来自显式声明或合法内建 xml binding。

### 3. 公开 parsed 原始字节可绕过原件隐私标记（1 个红用例）

真实 `openDocx` session 原件的 native privacy flag 已开启。仅将公开 `session.footnotes.parsed.internal.originalBytes` 换为同件但 flag 为 `off` 的字节，再执行 `session.save(session.content)`，输出保留 `Alice/Bob` 与 core creator。没有显式 `removePersonalInfo:false` 意图。

`docx.ts` 私有原件真值只控制是否调用 finalizer，最终 finalizer 又依候选文件的 false flag 退出。新增 `session native privacy policy cannot be disabled through public parsed original bytes` 确认失败。需要实现者固定私有基底/最终意图；同时保留正常原始 true/on 拼写和干净 no-op，不能用每次强写 true 破坏精确保留。

以上涉及解析及原件策略算法，按本次 checker 授权交回实现者，不在复核中静默重写。

## 已核查主路径

实际读取私有 module、`docx.ts` 全部 final-save 分支、Editor export/library-save 测试和保护最终守卫。所有正常出口汇入 `finish`，vendor parsed flag 被 clone false，privacy option 在 vendor 前单独剥离；保护 epoch 与最终权限继续检查。已有测试覆盖真实关系/custom main/settings/core/app/people、namespace rebind、false/off/显式意图、story 递归、未知/正文/日期/custom/binary 精确、保护实际差量拒绝与干净 no-op、预算与原子失败。上述通过不抵消本轮 6 项失败。

固定主参考 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 的 `packages/docx-engine/src/patch.ts:1743–1960` 已复读。按 AGENTS 复用同日 WeKnora 官网/源码缓存 v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24`，SHA 为 `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe` / `3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0`，不是新 HTTP 访问证据。WeKnora 仅适用知识库边界，Office 元数据语义沿固定 GenOffice/OPC。

## 验证

- 修改前基线：Office targeted 6 files / **125 tests PASS**，13:52:26 开始，13.51s。日志 `/tmp/mimir-docx-privacy-check-20261017.log`。
- 新增前 5 个边界用例后：native 1 file，**41 PASS / 5 FAIL**。日志 `/tmp/mimir-docx-privacy-check-boundaries-20261017.log`。
- 新增第 6 个真实 session 用例，单独运行：**1 FAIL / 46 skipped**（按名称过滤，并非忽略已知失败）。日志 `/tmp/mimir-docx-privacy-check-private-source-20261017.log`。
- Office `pnpm --filter @mimir/office typecheck`：**PASS**，此前并行 XLSX transient types 已解除。日志 `/tmp/mimir-docx-privacy-check-types-20261017.log`。
- 四个 P 源码/测试文件 targeted oxlint、oxfmt、`git diff --check`：**PASS**。`node scripts/check-style-backticks.mjs`：**PASS**。
- 没有运行全量 suite/build/server/browser，也没有新增上传、删除、stage、commit 或 archive。

当前没有隐私可见设置与专属历史是父任务已明确分开的剩余范围，不能称完整 P 工具完成。共享规范由 root 负责，建议同步实际 final-package、namespace-aware、精确保留和 UI/历史合同，待算法修复复检后再登记通过。

## 第二次独立复检：限定范围通过

原 implementer 再次冻结后，独立复读 `docx-privacy.ts` 全部原生 scanner/关系/finalizer、`docx.ts` 所有 save 出口与私有基底接缝，并复查真实 Editor export/library-save 测试。原 6 项失败测试原封保留并全部通过；没有删除、skip 或降低断言。Map scope、仅普通文字/属性的单次实体解码、XML1.0 字符范围校验与私有原件 policy 已修复先前问题。

checker 另外新增 6 个回归（`docx-privacy.test.ts`）：

- raw `]]>`、属性 raw `<`、通过实体转义命名空间 URI 形成的重复 expanded attribute 均原子拒绝，输入字节完整。
- 合法 XML 数字字符边界（tab/newline/CR、D7FF/E000/FFFD/10000/10FFFF）和仅解码一次的 metadata 保留；语义已是 Author/A 的实体拼写不被重写。清理后的第二次 finalizer 返回同一 Uint8Array。
- namespace URI 中合法数字引用可解析；`__proto__` 前缀在嵌套 foreign scope 重绑定后，仅实际 Word namespace 的 author 被清理，foreign 值及原 URI 拼写精确保留。
- 真实 `openDocx` 后将 `session.originalBytes` 与 `session.footnotes.parsed.internal.originalBytes` 两个公开面原地 `fill(0)`，session.save 仍使用私有原件，输出与正确原件清理结果所有非目录 ZIP 条目逐项字节相同。

没有新增 production 修复。实际关系定位、custom-main/settings、core/app/people、recursive stories、foreign/unqualified attrs、正文/日期/custom/binary 精确保留、干净 no-op、受保护实际清理拒绝与保护 epoch 迟到拒绝均继续通过。T 邻接回归包含在同次 scoped suite，不将该结果扩大为复杂强制修订或 UI 验收结论。

### 最终验证

- 修改前独立重跑 7 files / **175 tests PASS**，13:59:42 开始，18.44s；日志 `/tmp/mimir-docx-privacy-recheck-20261017.log`。
- 新增 6 个独立边界回归后 native **68/68 PASS**；日志 `/tmp/mimir-docx-privacy-recheck-boundaries-20261017.log`。
- 最终同一 scoped suite：`pnpm --filter @mimir/office exec vitest run src/docx-privacy.test.ts src/editors/DocxEditor.privacy.test.tsx src/docx-protection.test.ts src/docx-protection-settings.test.ts src/docx.test.ts src/editors/DocxEditor.export.test.tsx src/docx-forced-tracking.test.ts`，**7 files / 181 tests PASS**；日志 `/tmp/mimir-docx-privacy-recheck-final-20261017.log`。
- 4 文件 targeted oxlint / oxfmt、`git diff --check` 与样式 backtick 守卫均 **PASS**；日志 `/tmp/mimir-docx-privacy-recheck-{lint-final,format}-20261017.log`。
- Office `typecheck` 首次独立运行 **PASS**（`/tmp/mimir-docx-privacy-recheck-types-20261017.log`）；最终重复运行被并发 E0 新文件阻断：`src/docx-encryption-native.test-helper.ts(14,7)` TS2322，`"transform"` 不能赋给 `"strip"`。日志 `/tmp/mimir-docx-privacy-recheck-types-final-20261017.log`。已交 root / E0 owner，未修改该文件；不能称最新统一 types 通过。
- 未跑 full Office/server/build/browser；未上传、删除、stage、commit 或 archive。已知全仓技能 lint 基线故障不以 scoped green 掩盖，未重复全量 `pnpm check`。

### 未修复 / 剩余范围

- 可见“移除个人信息”工具入口与专属 settings/Undo/Redo 历史尚未实现，属于 root 已明确分开的 UI 后续；当前原件已启用但内容未改时，库保存按钮仍禁用，导出副本执行清理。必须在后续 UI 将显式意图纳入工作副本、dirty 与历史，并说明只清约定原生 metadata，不扫描正文 PII。
- full suite/build 与最新真实浏览器 1280 / 420×500 验收由 root 执行。本复检不报告界面或整体 P 工具完成。
- 并发 E0 helper 的 typecheck 错误属于另一个 owner，需其修复后由 root 复跑统一 types；P 此前 types green 与 scoped suite green 不抵消当前全包失败。
- 共享规范由 root 维护，建议同步私有原件/final-package policy、XML lexical + expanded namespace 校验、clean no-op 精确、保护不因隐私 flag 放宽及可见工具/历史合同；checker 没有越界改写 spec。

本次限定范围无新增未修复算法缺陷。固定 GenOffice / 同日 WeKnora 缓存证据沿用上文，不声称新联网调研。
