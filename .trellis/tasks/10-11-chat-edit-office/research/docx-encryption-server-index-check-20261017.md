# E1S：加密 Office 原件与索引隔离正式独立检查

## 当前权威结论：来源快照修复正式独立复查 PASS（2026-10-17）

**E1S 限定服务端/索引合同检查通过；首次来源绑定 P1 及两个独立红例已修复。** 下方首次 FAIL、日志和建议保留为历史。本结论不代替 E0/E1U 浏览器整合、最新构建、Desktop、真实 provider 或整体编辑器工具矩阵验收。

### Findings (fixed)

修复由原 owner 完成，本次 checker 未改生产实现：

- `readUploadSnapshot` 对 storage 返回的 raw meta 立即复制，再解析所指 source；source 同样复制，`meta/source/compound` 身份使用这些自有字节计算。snapshot 的 data 和 source SHA 来自同一次 source read，meta 中 filename/mime 与被哈希的 raw meta 一致。不是对任意 caller 可变 buffer 的延后哈希。
- `vault-index` 的 parser 只接 snapshot.data，使用 snapshot.meta 的 filename/mime；没有再另读一份原件。snapshot 不可得时只尝试恢复 meta，不重试另一份 parser 输入；提交前实际 source/meta CAS 和队列/DB 事务保留。因此原 A→B→A 两个独立案例都在发表前安全拒绝，中间无明文发表。
- `chunks` 与 `documents` 的 compound 分类也改用同一捕获 snapshot.data；保留后续实际 source 比较和 DB CAS，避免在后续独立 read 读到临时 plain 时丢掉 cipher marker。普通 note/plain-file 路径、向量 late-result/source/chunk content guard、失败队列恢复均保留。
- 原 7 独立用例完整保留。checker 在同文件只追加第 8 项：storage 交出 raw meta 的借用 buffer，随后在等待 source read 时真实清零该 buffer；snapshot 仍保留正确解析 meta、原 raw meta SHA、source data 与 source SHA。该项通过，补足 owner 对 source backing buffer 的测试。移除本次新增 import/用例后文件 SHA 仍精确为 `59f83d9ecb5c0fa2b746be4f01b05aa88955a5ea8d3c158ea06510a07ed9573f`，证明原 7 项未删改/弱化。

### Findings (not fixed)

本次限定复查未发现新增需修复的 E1S 问题，没有遗留 E1S 红项。没有再扩大缺陷枚举或修改其他 owner 文件。

- 待 root 统一规范：提取/分类字节必须绑定同次 snapshot 身份；发表队列/最终 CAS/双后端事务和 cipher 空正文零 chunks 的合同归唯一 server spec。checker 未改共享规范。
- 最后实际存储 CAS 之后的任意外部进程改写没有分布式锁承诺；持续双故障导致回滚本身也失败、历史备份/DB 日志/JS 堆的既有明文边界保持原报告，未虚称已解决。
- 未验 Web/Server build、浏览器密码打开/保存/标题检索整合、Desktop、真实供应商/Agent 或全仓 check；根会话须按整体任务继续，不以本片绿宣布全工具完成。

### Verification

- **SQLite PASS：同 9 文件 115/115，exit0，23.63s。** `/tmp/mimir-e1s-snapshot-recheck-sqlite-20261017.log`。包含 owner 26 项、checker 8 项、原另 7 文件 81 项。
- **真实 PostgreSQL PASS：同 9 文件 115/115，exit0，28.89s。** `/tmp/mimir-e1s-snapshot-recheck-postgres-20261017.log`。目标仅 `postgres://admin@localhost:5432/mimir_test_office_encryption`，正式 global setup/生产迁移、实际 pgvector，不由类型或 mock 证明 PG。
- 两端同范围：`docx-encryption-index.test.ts`、`docx-encryption-index.check.test.ts`、`upload.test.ts`、`chunks.test.ts`、`embed.test.ts`、`vault-roundtrip.test.ts`、`search.test.ts`、`api.test.ts`、`note-lookup.test.ts`。原存储/后写 meta/实际 DB DELETE trigger 失败回滚、重建/恢复、native bytes 与 API 鉴权/标题语义均重跑通过。
- **Server TypeCheck PASS，exit0。** `/tmp/mimir-e1s-snapshot-recheck-server-types-20261017.log`。
- **Office TypeCheck 最终 PASS，exit0。** `/tmp/mimir-e1s-snapshot-recheck-office-types-final-20261017.log`。初跑遭其他在途 `XlsxEditor.tsx:484` 缺 formatAddress import 诊断，已由该 owner 补齐，checker 未改其文件；初失败日志保留为 `...-office-types-20261017.log`，不以初失败代替最终状态。
- **Lint / Format / scoped diff PASS**：12 TS oxlint、13 文件 oxfmt、git diff --check，均 exit0。`/tmp/mimir-e1s-snapshot-recheck-{lint,format}-20261017.log`。
- 修复冻结清单 `/tmp/mimir-e1s-source-binding-freeze-20261017.sha256` 的 12 文件在复查前后全匹配。只新增独立第 8 用例和更新本报告，未改生产、DB helper、vendor/E0/E1U/共享规范或他人 dirty 文件。
- 所有 Server runner 严格串行，全部启动进程已消费 exit0，无新增常驻进程；Server 独占锁已归还 root 并告知 R2 owner。未 full/build/browser、stage/commit/archive/删夹具。

参考沿下方已记录的固定 GenOffice 和 WeKnora 缓存证据；本次为已复现来源绑定缺陷修复，不新增 HTTP/真实模型执行声明。

---

## 首次检查历史（以下 FAIL 已由上方最终复查解决）

2026-10-17，正式 `trellis-check`，直接执行，未派子代理。已读 active task/check context、PRD/design/相关 implement、E1S plan/implementation、E0/E1U 最终检查与适用 server/project/engine 规范。

**首次检查结论：暂不放行 E1S。发现 1 项实际来源绑定算法缺陷，两个独立回归在 SQLite 和真实 PostgreSQL 均失败，须交原 owner 修复后复查。** 原 owner 的 22 项及另外 7 文件回归通过，不能用它们覆盖新增红项。本结论不代替整体编辑器工具完成验收。

## Findings (fixed)

没有修改生产实现。新增 `apps/server/src/test/docx-encryption-index.check.test.ts`，7 项独立测试，原有断言全部保留：

- 两项来源读快照绑定回归，当前失败，见下方；测试通过真实 storage.write/read 制造确定性交错，不 stub parser 返回文本或伪造 source hash。
- source、document body/hash/key 均不变，仅真实 chunk content 变化，迟到 provider 返回不能写向量；通过。避免既有 combined 测试只因 source mismatch 通过，未真正验证 chunk guard。
- meta 写入失败后，已排队的下一次合法 cipher replacement 能完成，不遗留发布队列死锁；通过。
- `%`、`_`、反斜线三项真实 API 标题查询，按 literal 匹配、不制造正文片段；同路径无 cookie 为 401；通过。

新增测试最初保存异步 expect 到变量触发 `vitest/valid-expect`，已改为对 rejection outcome 的直接 await/同步断言，未抑制规则。回归不约束安全实现必须读取固定次数，cipher 测试先断言最终正文为空，再断言整个观测过程中从未出现明文；不会将末尾清理当作原子隔离成功。

## Findings (not fixed)

### P1：reindex 验证的来源 SHA 未绑定到 parser 实际读取的字节

- 实际路径：`apps/server/src/services/vault-index.ts:285` 的 `uploadIdentity` 读并哈希来源 A；`:293` 再次独立 `readUpload` 得到 data B；`:327–331` 最终仅比较来源 A 与当前 A，再发布从 B 提取的正文，没有核对 `data` 的 hash。
- **普通来源确定性复现**（独立测试约 `:46`）：原文件为 A=`original-index-snapshot`，第二次 source read 前通过真实 storage 写入 B=`TransientAmberE1S must never describe the restored original`，实际读取 B 后恢复 A，再完成 reindex。最后原件字节仍精确为 A，DB body 却是 B，并按 B 创建 chunks。SQLite 与 PG 都在正文断言失败。
- **实际密文确定性复现**（约 `:74`）：A 为官方 Agile cipher fixture，初始 DB body 为空；reindex 在第二次来源 read 临时读到官方 plain ZIP B，实际存储随后恢复同一 cipher A。最终 `sameUpload(A,A)` 放行，`publishFileReindex` 将 B 的 plaintext body/excerpt/search/hash 提交到 documents；后续 `syncChunks` 读取 source 时，测试从真实 DB 观测到该非空正文。该后续 compound 分支最终重新清空，但已经存在跨 await 的明文发表窗口。测试保留最终 body 空的断言，且仍以中间观测非空失败。
- 这是已批准“实际 source/meta/SHA 身份与原子清正文”合同中的本地读取/发表缺口；不需要要求跨存储/DB 的分布式事务，也不是在最终 CAS **之后**任意外部写入的不可控边界。B 早于最终检查已恢复为 A，生产代码有足够的实际 data 字节可以发现不一致。
- **建议原 owner**：把实际提取字节与捕获的来源身份绑定（例如对实际 data 做 SHA 与 source.source 比较，或一次有界来源快照同时返回 bytes+identity），不一致时在任何 DB 发表前拒绝/跳过。保留最终 meta/source CAS、队列、事务和两个独立红项；不能仅依赖后续 sync 清理，也不能修改测试使临时明文可接受。按 dispatch，此处为来源所有权/算法问题，checker 未悄改生产。

### 其他范围与待 root 的工作

- Server typecheck 首轮被其他 owner 在途 `xlsx-range-rules.ts` 四项诊断阻塞（495 `string|null`，700 group，873/874 sourceData/targetData）；未修改这些文件，已通知 root。最终复验结果见 Verification。
- 共享 spec 由 root 持有，待本片修复/复查通过后，统一补“提取 bytes 与真实来源身份绑定、cipher 提交同事务清派生文本、各 publisher 队列与 late-result CAS、双后端事务边界”。不将本报告的测试数或历史失败写成现行规范。
- 本片不验证 Web build、浏览器真实 Worker/密码交互、Desktop、provider 或最终全工具矩阵；E0/E1U 的限定通过与其浏览器边界保持。历史备份、DB 日志或 JS 堆的曾有明文不在本片追溯清除范围。

## 已核实的限定生产合同

- E1S 冻结 12 文件 SHA 在审查前后均匹配 `/tmp/mimir-e1s-source-freeze-20261017.sha256`。checker 仅新增独立测试/本报告。
- envelope 复用实际有界 CFB 目录/两流、EncryptionInfo 与真实 EncryptedPackage 长度、预算检查，没有以文件中搜 stream 名代替读取；server 没有密码参数、KDF/解密调用。CFB signature 只用于保守阻止重新分块，支持判定仍走实际 envelope。
- replacement 唯一 source key → meta → DB 原子 source/body/hash/error 更新与 chunks 删除，既有 FK cascade 带走 embeddings，SQLite FTS trigger 同步；旧原件在成功提交后删除。owner 的真实存储前/后写失败及 DB trigger 在 chunk DELETE 抛错的回归，本次独立双后端重跑均通过。
- DB 同步 generator 在 SQLite 的同步 transaction 内 `.all()` 执行，在 PG 真正 async transaction 内 await，锁文档行 `FOR UPDATE`；没有把 async callback 传给 better-sqlite3。此结论有真实 PG 正式迁移与相同断言的执行证据，不由 types 代替。
- 当前进程同文档 replacement、file metadata、chunk、embedding 发表共用队列；provider 工作不持发布锁。publishChunks 和 publishEmbedding 在事务内比较当前 body/hash/key/deleted，embedding 另比真实 chunk id/document/content。独立队列失败恢复和 isolated chunk mismatch 通过。
- UI-only cipher 标题 fallback 不造 chunks/citations，kind/tag/limit、literal 查询与 auth API 通过；semantic-only 不伪造标题语义匹配。当前模型是单库共享数据空间，documents 没有虚构 user/vault 字段，鉴权仍在已有 API middleware。
- 旧解析后的 reindex 最终 CAS 能拒绝一般不同 key / 同 key **持续改变**的结果，但上述 A→B→A 提取快照缺陷尚未解决，不能笼统声称 late reindex 已安全。

## Verification

- **SQLite：FAIL，9 文件 108 PASS / 2 FAIL（110 项），exit1。** `/tmp/mimir-e1s-independent-sqlite-final-20261017.log`，21.71s。原 8 文件 103 项均通过；新 7 项 5 PASS / 2 FAIL。
- **真实 PostgreSQL：FAIL，同 9 文件 108 PASS / 2 FAIL（110 项），exit1。** `/tmp/mimir-e1s-independent-pg-20261017.log`，28.71s。仅目标 `postgres://admin@localhost:5432/mimir_test_office_encryption`，正式 global setup/生产迁移，使用已安装官方 pgvector；未绕迁移、未用生产 DB。
- 最终测试边界断言整理后的 SQLite/PG 独立 7 项重跑日志：`/tmp/mimir-e1s-independent-{sqlite,pg}-boundaries-20261017.log`；结果补记于下。
- **Office TypeCheck：PASS，exit0。** `/tmp/mimir-e1s-independent-office-types-20261017.log`。
- **Server TypeCheck：首轮 FAIL，仅上述他人在途 4 诊断。** `/tmp/mimir-e1s-independent-server-types-20261017.log`；最终结果补记于下。
- **Lint：PASS，12 TS（含独立测试），exit0。Format：PASS，13 文件，exit0。scoped git diff --check：PASS。** `/tmp/mimir-e1s-independent-{lint,format}-20261017.log`。
- 所有 Server runner 全局串行，获 root 独占锁后执行，未并发 SQLite/PG。未运行 full/check/build/browser，未暂存、提交、归档、删除夹具或修改 vendor/E0/E1U/其他 owner 文件。结束时消费进程结果后释放锁。

## 参考

沿已批准计划的固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 与 E0/E1U 真实代码/外部 Office fixtures。WeKnora 沿同日既有官方站/公开源码缓存 v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24`；官网 SHA `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`、definitions SHA `3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0`。其知识库派生索引身份/能力门控适用，Office 密码算法仍以标准/GenOffice 为主；本次未声称重新联网调研或真实供应商执行。

### 最终收尾补记

- 最终独立 7 项：SQLite **5 PASS / 2 FAIL**（6.28s）；真实 PG **5 PASS / 2 FAIL**（25.43s），均 exit1。只整理测试架构无关的读次数检查并先核对末尾清理结果，两个真实失败不变；原 9 文件整体双端各 108 PASS / 2 FAIL 的证据仍适用。
- **Server TypeCheck 最终 PASS，exit0**：`/tmp/mimir-e1s-independent-server-types-final-20261017.log`；其他 owner 的在途 helper 诊断已消失，checker 未改其文件。
- 最终 scoped 12 TS oxlint、13 文件 oxfmt、diff check 均 PASS：`/tmp/mimir-e1s-independent-{lint,format}-final-20261017.log`。Office typecheck PASS。
- 12 文件原冻结 SHA 在全部生产检查结束前再次全匹配；所有启动命令均已消费完成状态，无遗留 runner。Server 独占锁和生产冻结已归还 root，交来源绑定修复 owner；本报告当前仍为 FAIL，待 owner 新冻结后正式复查。
