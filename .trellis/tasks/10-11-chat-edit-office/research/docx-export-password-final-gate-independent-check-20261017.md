# DOCX 最终导出生命周期修复：独立复验

2026-10-17，`r3_bullets_independent_check`。依据 active task PRD、check.jsonl、Office/shared/renderer/server/chat 质量入口和 `docx-export-password-final-gate-fix-20261017.md`。只读复验 owner 三文件，不改其生产或测试。

## Findings (fixed)

本轮未另改 DOCX。确认 owner 的最小修复：exportRequest 只锁当前 handle；exportJob busy 只显示当前 session/documentId；旧 finally 用身份比较，不能清掉后继请求状态。独立重跑真实 Editor 延迟导出→切源→新导出→旧先结算→新结算，旧结果不下载，新 busy 保持，最终仅一个当前下载，version=0、无库写入。

手动编辑后迟到导出测试改为当前 encrypted-session 包装器的准确错误消息，没有删“无下载/无入库/重试/native XML”断言。密码 worker 等待改为真实 emit 结果，不缩短 100000 次 SHA-512，不绕过 worker，不新增 timeout；原生 verify/清密码草稿/无明文/worker terminate/零undo 仍在。

## Findings (not fixed)

未发现本次窄修复引入的新问题。没有把旧 save 全局锁另作架构改写：该路径有 source disposal/加密 worker 取消/保存中互斥的既有合同，本次明确授权的是旧 export 阻塞后继 source。整体最终全门与浏览器由 root 执行；用户新建/更改密码稍后自行验收，不能当自动浏览器通过。

## 加密 IO 守卫复核

实际代码仍捕获 binding、handle、version、protectionEpoch，await 后检查；待处理 draft 拦截、assertSaveCandidate 和成功 IO 后 acknowledgeSaved 保持，export 不 ACK。实际 encrypted-session/Editor 回归覆盖：老 IO 与新密码意图交错、失败 IO/export 不 ACK、取消重试、切源迟到零 IO、options-only version 变化拒绝 IO、privacy floor、跨 session/重复 ACK/cache 不绕最终 guard。

## Verification

- DOCX 四文件41项，加 PPTX 四文件32项：**8 files /73 passed，exit0**，`/tmp/mimir-focus-docx-independent-tests-20261017.log`。四个 DOCX 文件是 `DocxEditor.export.test.tsx`、`DocxEditor.protection-settings.test.tsx`、`DocxEditor.encryption.test.tsx`、`docx-encrypted-session.test.ts`。
- Office `tsc --noEmit`：pass，`/tmp/mimir-focus-docx-independent-types-20261017.log`。
- 六个变更文件 scoped oxlint、oxfmt check：pass，`/tmp/mimir-focus-docx-independent-{lint,format}-20261017.log`；git diff check pass。
- owner 三文件 SHA256 对 `/tmp/mimir-docx-export-password-freeze-20261017.sha256` 全部 OK。本人所有 runner 已退出，不将独立专项拼接为新一次原样全仓门禁。
