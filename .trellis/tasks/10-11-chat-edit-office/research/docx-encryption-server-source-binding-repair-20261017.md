# E1S 来源快照绑定修复

2026-10-17，`trellis-implement`，由 root 指派修复正式 checker 发现的两个真实来源竞态。**本轮 owner 验证通过并冻结，仍需正式独立复查；不代表 E1S 正式放行或所有编辑器工具完成。**

## 缺陷与最小边界

原 `vault-index` 用 `uploadIdentity` 读取 A 并计算 SHA，随后独立读取 parser 输入。来源在第二次读取临时变成 B，再恢复 A，最终 CAS 会比较 A 与 A，却发表从 B 提取的正文。密文 A → 明文 B → 密文 A 时，后续分块清理虽能恢复空正文，错误正文已短暂提交，不能把末尾清理算作安全发表。

只修改原 E1S 四个生产文件及 owner 原专项测试。没有更改 checker 的独立测试、DB 事务实现、schema、API、provider、vendor、密码接口或 UI。

- `apps/server/src/lib/document-publication.ts`：新增 `readUploadSnapshot`，一次读取 meta 和当前原件，返回已解析 meta、独立拥有的原件字节及基于这些字节的 SHA/compound 身份。meta 和 source 都复制至独立缓冲区，避免存储适配器复用 backing buffer。原 `uploadIdentity` 委托该读取器，只取 identity，现有比较合同保持。
- `apps/server/src/services/vault-index.ts`：parser 使用快照中的原件字节，filename/mime 也来自快照 meta；不再重新读取另一份 parser 输入。缺失来源不单独重试成另一份可解析正文。原提交前真实 source/meta CAS、旧 LIST 防护、同文档队列、同事务清理和后续分块合同保持。
- `apps/server/src/services/chunks.ts`：cipher 清理的 envelope 提取使用已捕获快照字节，保留队列内前后实际 source 比较和 DB CAS。不能在独立读到临时 plain 后用 null error 覆盖 cipher 标记。
- `apps/server/src/services/documents.ts`：cipher 元数据修改使用相同快照字节分类；保留正文 PATCH 拒绝、后续 source 比较及 DB CAS。普通笔记和普通文件行为由既有回归覆盖。
- `apps/server/src/test/docx-encryption-index.test.ts`：新增 4 项 owner 回归：存储共享缓冲区、身份读取失败不得独立重试解析、chunk 清理中的临时 plaintext、metadata 更新中的临时 plaintext。原专项 22 项及独立 7 项均保留。

静态审计了 E1S 的 upload/replace、reindex、chunk、embedding 和 metadata 接缝。此次发现的同类“identity 后另读用于分类的 bytes”均改为快照消费；upload/replace 提取的是调用方提供、随后写入唯一候选 key 的字节，不存在此次从实际存储两次读取的接缝。embedding 不重新解析来源，现有 document/source/chunk content CAS 保持。

## 实际验证

两种数据库测试严格串行，均使用正式 global setup/生产迁移，未绕迁移。账号沿统一 `admin@example.com` / `12345678`；PG 仅隔离测试库 `postgres://admin@localhost:5432/mimir_test_office_encryption`。旧全仓测试自然结束后才取得 runner，先让 R2b 单文件窗口结束，再执行本轮。

| 验证 | 结果 | 日志 |
| --- | --- | --- |
| SQLite，同 9 文件 | 114/114，exit0 | `/tmp/mimir-e1s-source-binding-sqlite-20261017.log` |
| 真实 PostgreSQL，同 9 文件 | 114/114，exit0 | `/tmp/mimir-e1s-source-binding-postgres-20261017.log` |
| Server `tsc --noEmit` | PASS，exit0 | `/tmp/mimir-e1s-source-binding-types-20261017.log` |
| 5 TS 文件 oxlint | PASS，exit0 | `/tmp/mimir-e1s-source-binding-lint-20261017.log` |
| 5 TS 文件 oxfmt check | PASS，exit0 | `/tmp/mimir-e1s-source-binding-format-20261017.log` |
| 同 scope `git diff --check` | PASS | 命令实际执行 |

9 个测试文件为 `docx-encryption-index.test.ts`（26 项）、`docx-encryption-index.check.test.ts`（7 项）、`upload.test.ts`、`chunks.test.ts`、`embed.test.ts`、`vault-roundtrip.test.ts`、`search.test.ts`、`api.test.ts`、`note-lookup.test.ts`。原独立两个红例现在均通过，未改断言，也没有允许中间明文发表。

### 保留的调试失败

- 首轮 SQLite 113 PASS / 1 FAIL：新增同标题测试文件超过搜索默认 20 条，旧 `assertHidden` 的标题搜索分页漏掉目标。仅将测试查询显式设置为允许的 `limit=50`；未更改生产查询或独立测试。首轮日志 `/tmp/mimir-e1s-source-binding-sqlite-title-limit-red-20261017.log`。
- 中间一轮误把该测试 limit 写成 100，接口真实上限为 50，13 项标题断言收到 400；已纠正，未放宽 API schema。日志 `/tmp/mimir-e1s-source-binding-sqlite-invalid-test-limit-red-20261017.log`。不能把这轮计作来源修复通过。
- 中间 Server types 遇到并行 R2b 静态接线的 `xlsx-rule-footprint.ts` references 改名诊断，已通知该 owner 原位修复；之后最终全 Server types exit0。本片未改 XLSX 文件。

## 冻结与交接

新的 E1S 原 12 文件冻结清单：`/tmp/mimir-e1s-source-binding-freeze-20261017.sha256`。原独立测试保持 SHA256 `59f83d9ecb5c0fa2b746be4f01b05aa88955a5ea8d3c158ea06510a07ed9573f`。独立检查报告仍归 checker 更新，本报告不替代其结论。

待 root 安排正式 checker 对原两个来源回归及同 scope 双端再查；共享 spec 归 root，建议将“用于提取/分类的字节必须与来源身份出自同一快照”补至 server 文件发表合同唯一归属处。

边界沿原 E1S 计划：进程内队列与最后实际存储检查不提供任意外部进程在最后 CAS 之后直接换源的分布式锁；不追溯清除历史备份、DB 日志或 JS 堆的既有明文。本轮没有浏览器、Desktop、真实供应商或完整全仓 check 的成功声明。未 stage、commit、archive、删除夹具。

参考复用批准计划中固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 与 WeKnora v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24` 缓存证据；此次是本地已复现缺陷修复，没有声称重新联网调研。
