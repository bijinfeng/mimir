# E1S：加密DOCX原件发布与派生正文失效

2026-10-17 root。E0未最终冻结/独立通过，本片先做精确集成计划；沿已批准全工具加密范围，不新建服务或公开密码接口。

## 实际接缝与风险

- `services/upload.ts::replaceUpload`先extractText、writeUpload(唯一新key+meta)，再只更新documents，成功后移除旧key。**实际没有同步清chunks**；旧body虽然被空结果替代，chunks/向量仍可能命中旧明文。不能把“解析失败”当作加密发布已安全完成。
- `extract.ts::extractText`是上传/重建共享入口；当前将docx交parser，无可靠encrypted envelope分类。支持的加密应保留原件并返回明确“不索引加密正文”；损坏/不支持的CFB也不能送正文提取器或返回虚构可编辑状态。
- `chunks.ts::syncChunks`先await读取设置/title/旧分块，再删除/插入，参数body可来自旧快照。仅在replace事务里delete一次，不能阻止旧sync/rebuild晚回填。`embedDocument`也先取旧chunk再await provider，之后写向量；必须绑定当前chunk身份/内容/所属文档状态。
- `vault-index.ts`从uploads实际meta/source读取再upsert并syncChunks；异步提取期间source替换，会使旧明文重写新cipher索引。必须在实际提交处比较源身份（并读取当前meta/source，不能只比较旧DB字段）。
- `db/client.ts`把SQLite客户端类型断言为PG；**不能直接写await db.transaction(async...)假设双端支持**，better-sqlite3 transaction回调必须同步。方言差异集中DB层，需实际SQLite同步/PG异步两实现和同形合同，service不分支驱动。
- chunks→chunk_embeddings是foreign-key cascade；SQLite FTS由trigger维护，需实际测试删除后两层检索都无旧token。

## 参考

GenOffice固定480548fd55f1be3593ee0d8e316a734751d58309主进程docx-encryption只在native原子成功后推进密码身份，不能直接复用到浏览器或KB索引。WeKnora本日固定缓存v0.8.3/3e22822c1d2397be730c458c7539d0eb8c113a24，官网SHA6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe / definitionsSHA3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0；复用已查证据，不宣称新联网。其KB派生分块/真实能力门控可借鉴，Office加密语义以标准/GenOffice为主。

## 最小生产合同与所有权

server upload/extract/vault-index/chunks最小必要接缝、新私有envelope adapter、DB层原子发布helper及其tests；仅必要office E0容器只读导出入口，不能引浏览器worker/crypto写入到server bundle。shared公开tool DSL不改、不要新表/持久化密码/plain副本。变更前核E0 frozen读取器API，不能仅魔数/文件中搜索stream名称。

1. 只从实际cipher字节识别CFB目录/EncryptionInfo/EncryptedPackage及有界参数，不信客户端声明“已加密”。envelope公开header不可证明明文是DOCX，UI只承诺支持的Office加密包，解密本地再验证DOCX；服务端不索要密码、不解密。
2. 先写新cipher与meta，再同一DB事务更新原件指针及空body/excerpt/searchText正文部分/contentHash/parseError，并删除chunks级联embedding；title仍可检索。删除旧文件在提交后。storage/meta/DB中途失败按现有规则回滚，不能发布新cipher却留旧plaintext索引，也不能失败后删旧原件。CAS源身份/同document操作串行防止旧replace覆盖新replace。
3. 数据发布/分块重建/晚到embedding需同一真实版本检查。preferred是在DB层提供窄原子能力，SQLite同步transaction、PG异步transaction；每次分块发布在事务内比较当前body/contentHash/source身份，再改rows。旧snapshot不符合则跳过/明确过期；不能先check后await再写。embed落地用当前chunk内容+document来源条件的INSERT SELECT或同一原子验证，不能回填被删旧chunk，也不能命中后来同id但不同内容。
4. reindex真正读取当前uploads的source/meta，提交时确认未变化；加密上传/替换/完整重建/从文件删库恢复均为空正文和零chunks。旧缓存/parse job不得恢复旧明文。代码应局限于这条真实缺口；不借机改所有document业务。
5. 历史明文备份保留历史状态；不会回溯擦除已有备份、DB日志或JS堆。不删历史备份。当前cipher备份/恢复后重建不产生旧明文；恢复历史未加密备份则如实恢复旧状态。
6. 取消加密后保存真正plain才重新提取/重建其正文；无需provider也能完成纯正文/分块测试。provider测试用deferred stub证明迟到返回，不能声称真实模型执行。

## 验证门槛

统一账号，API实际upload/replace/download返回cipher整字节；先plain可全文/分块命中，cipher替换后documents/chunks/embeddings与两检索通道无旧token且title可见；再rebuild/reindex/删库恢复与恢复当前cipher备份保持。真实注入storage/meta/DB失败及旧sync/reindex/embed延迟，必须无混合状态。SQLite门禁必需；PG涉及事务差异需实际TEST_DATABASE_URL安全测试数据库，若本机不可用明确记录阻断，不伪造“类型通过等于PG通过”。server测试进程全局串行，其他片冻结后再跑。正式independent checker必需。
