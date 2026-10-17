# E1S：加密 Office 原件发布与正文索引隔离实施

2026-10-17，`trellis-implement`。基于已批准 `docx-encryption-server-index-plan-20261017.md` 和最终独立通过的 E0 读取器。**本片已实施并冻结，待 root 正式独立检查；不能据此宣布完整密码编辑工具或全工具范围完成。**

## 文件与接缝

生产 11 文件、专项测试 1 文件；另本报告。不修改 schema、迁移、vendor、Agent DSL、模型服务或密码存储。

- `packages/office/src/docx-encryption-envelope.ts`、`packages/office/package.json`：有界只读子路径入口，复用 E0 真实 CFB 目录/流和 EncryptionInfo 参数读取，核对 EncryptedPackage 声明长度与实际块长度、50 MiB 明文预算。没有密码参数、KDF、解密、ZIP 展开或 Worker。
- `apps/server/src/lib/document-publication.ts`：同文档发布队列、实际 meta 原始字节和 source 原始字节 SHA256 身份；来源不仅是 DB 的 sourceKey。相同 key 的外部覆盖也会改变身份。CFB 八字节只用于保守阻止旧正文发布，受支持加密的判断仍走完整 E0 envelope。
- `apps/server/src/db/document-index.ts`：窄原子发布能力，文档/source/body 发表与 chunks 删除在同一数据库事务中；级联带走 embeddings，既有 FTS trigger 同步处理。分块与向量发表再次核对当前 body/contentHash/sourceKey/deletedAt；向量额外比较真实 chunk id/documentId/content。
- `apps/server/src/services/extract.ts`：上传/替换/重建共用的提取入口在 DOCX CFB 时先读实际 envelope；支持的 Office 加密包保留原件、空正文、明确说明不进入正文索引。坏/不支持/超预算 CFB 返回对应实际错误，不送普通正文 parser。
- `apps/server/src/services/upload.ts`：replace 全部来源生成/存储发表串行；唯一新 key → meta → DB/source+空正文+删 chunks 原子事务，成功后才删旧原件。source、meta（含写后才抛错）、DB 失败恢复旧 meta 原始字节并保留旧原件。分块/embedding 在释放发布队列后运行，并有自己的版本检查。
- `apps/server/src/services/vault-index.ts`：提取前捕获真实来源，在发表处重新检查 meta/source；旧 LIST keys 不能把新 meta 指向的新原件误判为丢失。空正文/变源的文档发表与旧分块失效同事务；不变普通正文仍保留健康分块/向量。
- `apps/server/src/services/chunks.ts`：设置读取、重建、向量 provider 返回后的迟到结果均受来源和 DB 身份约束。当前文件已是 CFB 而 DB 仍是恢复前旧明文时，分块重建会原子清正文/excerpt/searchText 正文部分/hash/error/chunks，不能只跳过插入而留下旧索引。provider 工作不占发布锁。
- `apps/server/src/services/documents.ts`、`routes/documents.ts`：已证实普通标题/标签编辑会持旧 body 跨 await 全行写回，因此纳入相同发布队列；保留原 noteUpdateLocks/precondition，分块处理移到释放发布队列后。cipher 普通 body PATCH 明确 409/说明本地解锁后保存，标题/标签仍可更新。普通笔记与普通文件元数据回归保持。
- `apps/server/src/search/index.ts`：现有 UI 检索只从 chunks 组装，cipher 零 chunks 会让保留的标题也不可见。因此仅 UI search 为真实 file+空 body+受支持加密标记+零 chunks 补标题匹配，保留 kind/tag/limit、普通结果顺序，无重复；不生成正文片段或伪 Agent chunk/citation，semantic-only 不伪造语义命中。
- `apps/server/src/test/docx-encryption-index.test.ts`：22 项真实 API/native/DB/延迟回归。

### 双方言事务实现

不把 async 回调塞给 better-sqlite3。DB 层内部的同步 generator 描述同一顺序语句：SQLite 在同步 transaction callback 中逐条 `.all()` 完成；PG 在真实 async transaction 内等待同一程序，并锁当前文档行 `FOR UPDATE`。服务层没有新方言分支。真实 DB 触发器在文档行已经更新、删除 chunks 时抛错，验证整个事务回滚，而不是只模拟事务开始前的失败。

### 读取器依赖边界

server 沿仓库既有 Office engine 接缝使用相对源码导入，避免新增服务端 Office UI 包依赖；只读子路径同时可供包使用者选择。源码 import 图为 envelope → container/info/types；info 使用 fast-xml-parser，container 模块因 E0 原有可信 CFB writer **仍静态 import `cfb`**。本片没有复制读取算法或修改 E0 文件，也不声称 bundle 中完全没有 CFB writer 代码；没有调用该 writer 的生产服务器路径，更没有导入 core 的 Noble KDF/加解密、controller 或 Worker。header 无法证明加密明文一定是 DOCX，服务端只承诺可识别的 Office 加密 envelope；本地解密后仍需验证实际 DOCX/完整性。

## 验证

### SQLite

**8 文件 103/103 PASS**，其中 E1S 新专项 **22/22**。日志：`/tmp/mimir-e1s-sqlite-final-20261017.log`。

运行文件：

- `src/test/docx-encryption-index.test.ts`
- `src/test/upload.test.ts`
- `src/test/chunks.test.ts`
- `src/test/embed.test.ts`
- `src/test/vault-roundtrip.test.ts`
- `src/test/search.test.ts`
- `src/test/api.test.ts`
- `src/test/note-lookup.test.ts`

### PostgreSQL

**真实 PG 同 8 文件 103/103 PASS，专项 22/22**。目标仅 `postgres://admin@localhost:5432/mimir_test_office_encryption`；正式 global setup/生产迁移，未绕迁移、未用替代表型。日志：`/tmp/mimir-e1s-postgres-final-20261017.log`。两个数据库测试进程串行；结束后确认没有 E1S vitest 进程。

首轮确实连接到本机 PostgreSQL 16.15，但正式迁移因缺 vector.control 失败，**当次零测试，不算 PG 通过**；失败日志独立保留 `/tmp/mimir-e1s-postgres-vector-unavailable-20261017.log`。root 随后按官方 pgvector v0.8.1 README 为既有开发 PG16 构建安装扩展文件，未修改任何生产 DB/schema/权限；源码官方 tar SHA256 `a9094dfb85ccdde3cbb295f1086d4c71a20db1d26bf1d6c39f07a7d164033eb4`，root 日志 `/tmp/mimir-pgvector-v0.8.1-build.log` 和 `/tmp/mimir-pgvector-v0.8.1-install.log`。后续测试再走正式迁移才通过。

### 实际断言

- 外部真实 Office Standard/Agile 文件通过实际 API 上传、保留说明、下载整字节相同；不提供密码或调用解密。
- 真实 CFB 重写产生的不支持 EncryptionInfo、无效 package 长度、声明长度超预算准确拒绝；普通 DOCX parser 没有被调用。真实普通 ZIP DOCX仍可提取。
- 先有明文 documents/chunks/embedding 和实际关键词命中，再通过实际 API PUT 保存 cipher。documents 正文、excerpt、searchText 正文部分、hash/error、chunks、级联 embedding 均符合合同；实际 keyword 与 substring 两通道均无旧标记，SQLite 两张 FTS 表也无旧命中，UI 标题仍能命中。
- 当前 cipher 分块重建、重建索引、DB 记录删除后由当前 source/meta 字节恢复重建仍空正文；当前文件已恢复为 cipher、DB 留旧明文的分块重建也清掉旧索引，不调用 provider。此处测试是当前 source/meta 的字节快照恢复，不声称测试了整个应用备份服务或擦除历史备份。
- 保存真正 unencrypted ZIP 后恢复提取/分块。
- source 写失败、meta 写失败、meta 已写后抛错、真实 DB 中段触发器故障，均保留旧正文/原件/索引，原 meta 字节恢复。
- 设置读取中挂起的旧 sync、旧 plaintext parser 上挂起的 reindex、provider 返回挂起的 embedding、同 id 但不同 content 的 chunk、同 key 外部换源，不能迟到恢复旧正文/向量。
- 两个 overlapping replace 的后发 cipher 最终权威；旧 metadata 编辑与 cipher 串行，不回填旧 body；cipher 标题/标签可修改而 body PATCH 准确拒绝；普通笔记和文件元数据保持。
- cipher 标题过滤 kind/tag/limit，无正文 snippet，不重复普通结果，不进入 Agent chunk/citation 入口。

### 静态门

- Server `tsc --noEmit` PASS：`/tmp/mimir-e1s-types-20261017.log`。
- 11 TS scoped oxlint PASS，零 warning：`/tmp/mimir-e1s-lint-20261017.log`。
- 12 文件 oxfmt check PASS：`/tmp/mimir-e1s-format-20261017.log`。
- scoped `git diff --check` PASS。
- 不声称本片跑了全仓 check、全 Server test、Server/Web build 或真实浏览器/Agent/供应商；root 的其他片浏览器和 build 证据独立记录。

## 自检中发现并修复的缺口

保留失败历史，不以旧绿覆盖新红：首轮 fixture 相对路径导致 collect 失败，已修；随后真实测试暴露 cipher 无 chunks 后标题无法搜索，以及测试 DDL 用 SQLite `.all()` 不适用（改测试 `.run()`）。进一步 reindex 竞态测试暴露旧 LIST+新 meta 的 sourceKey 被误判丢失，已在实际发表处拒绝。普通 file 仅改标题的 createdAt 断言暴露了误删健康分块，已让 metadata 不变正文保留分块。新增恢复旧 DB/cipher source 用例证明仅拒绝插入不足，实际改为事务清理。没有删除或弱化这些断言、没有抑制规则。

## 参考与后续

沿批准计划的固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`；主进程 native 成功才推进密码身份的原则用于这里的成功 IO/DB 发表，但没有直接复用 Electron 密码接口。WeKnora 沿本日已核缓存 v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24`，官网 SHA `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`、definitions SHA `3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0`；KB 派生索引隔离适用，Office 加密算法不以其 Markdown 编辑器为参照。本轮未声称重新联网 WeKnora/GenOffice。

后续交 root：正式独立 check、共享唯一归属规范同步、与 E1U 最终整合后的 Server/Web 构建和实际浏览器保存/重开。当前测试账号无 provider，延迟向量仅用 stub，不是真实模型执行。发布队列是当前 server 进程内的同文档串行化，实际原始存储身份在提交前复核；不声称对任意外部进程在最后检查之后直接改存储提供分布式锁。跨存储+DB 无分布式事务：已验证单阶段故障回滚，若回滚本身再遭持续存储故障，只能留日志并保留可恢复原件，不声称双故障可无条件回滚。历史备份/DB日志/JS堆中的曾有明文不会被追溯擦除。

未 stage、commit、archive、删除夹具或改其他 owner 文件。
