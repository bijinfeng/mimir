# E1U 候选字节完整性返工

2026-10-17，原 implement owner 按主会话退回的正式独立检查修复。生产与本轮测试已冻结，交原 checker 复查。原检查报告 `docx-encryption-editor-check-20261017.md` 保留，未改写其两项失败证据或其他独立回归。

## 最小修复

- `packages/office/src/docx-encrypted-session.ts`：共同私有 `own` 路径在 native 最终 guard 前，将实际公开候选与其已有私有 `cache.bytes` 全长度、全字节比较；任一字节变化都拒绝发布校验和 ACK。比对由未暴露的私有快照发起，公开输出及共享 buffer view 不影响快照。
- ACK 成功后从该私有快照复制 `persistedBytes`。没有增加 digest、额外候选快照、全局容器或历史；仍沿用当前/已持久化两项缓存和 WeakMap 候选生命周期。单次校验 O(候选字节数)，不分配新的比较缓冲。
- 不增加当前文档/当前 key 必须一致的 ACK 条件；native P/W/T guard、真实 native 候选 ACK 与 scrub floor 推进顺序保留。已成功旧 IO 仍确认其真实 cipher/key/native 候选，较新的意图仍 dirty；导出与失败 IO 不 ACK。
- `packages/office/src/docx-encrypted-session.test.ts`：保留 checker 的两个原始变异回归及全部其他新回归；补充 plain、generated cache、persisted cache 三条路径，通过共享 buffer view 改中段/末字节，分别验证 assert/ACK 拒绝、持久化身份不变、后续生成的私有缓存不被污染，以及恢复原字节后该真实候选可正常 ACK。

未改 Editor UI、E0 算法、native writer、Server/E1S、package exports、vendor 或共享规范；未暂存、提交、归档、上传或删除文件。共享规范继续由 root 持有。

## 最终验证

- session 专项：1 文件 **17/17 PASS**，exit0，`/tmp/mimir-e1u-integrity-session-20261017.log`。
- 与正式 checker 同一限定 9 文件：**244/244 PASS**，exit0，29.14s，`/tmp/mimir-e1u-integrity-focused-20261017.log`。含 session17、actual Editor11、P UI18，以及 native privacy/protection/protection-settings/forced-tracking 与 Editor protection/protection-settings；两个正式红项已转绿。真实 Worker 发布前换 key、generation+IO 全程互斥、旧 IO/new intent 和隐私 floor 回归保留并通过。
- Office `tsc --noEmit`：exit0，`/tmp/mimir-e1u-integrity-types-20261017.log`。
- 本轮两文件 oxlint：exit0，`/tmp/mimir-e1u-integrity-lint-20261017.log`；两文件 oxfmt check：PASS，`/tmp/mimir-e1u-integrity-format-20261017.log`；scoped `git diff --check`：exit0，`/tmp/mimir-e1u-integrity-diff-20261017.log`。
- 使用最终专项 suite 新产生的 native 与 actual Editor 两份产物，再次用已缓存官方 `msoffcrypto-tool==5.4.2` 验证密码与 HMAC，解密完整字节与对应 plain 相同：exit0，`/tmp/mimir-e1u-integrity-interop-20261017.log`。脚本 `/tmp/mimir-e1u-integrity-interop-20261017.py`，没有安装依赖。产物仍是原先 `/tmp/mimir-docx-e1u-{edited,editor}-20261017.docx` 及对应 plain 合成资料，未上传。

## 待主会话

由原 checker 独立复查本修复；当前没有独立放行结论。没有运行 Server/full Office/全仓 check/Web build/browser/Desktop；先前 root build 不覆盖本次返工，需 root 统一新 build 后再浏览器验收。E1S 索引清除、浏览器样式交互与实际供应商模型运行仍不属于本次已验证范围。

本轮是既有契约缺陷修复，未新增竞品研究；沿用已读 E1U plan/implementation 与正式 checker 记录的固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`，以及同日缓存 WeKnora v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24` 的适用边界，不声称新的 HTTP 调研或 WeKnora 提供浏览器 DOCX 加密。
