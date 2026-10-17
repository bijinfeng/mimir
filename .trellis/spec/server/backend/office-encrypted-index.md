# Office 加密原件与派生索引

## 1. Scope / Trigger

适用上传/替换、重建索引、正文分块、延迟向量与文件元数据更新。Office 打开密码仅在客户端处理；server通过有界只读envelope识别支持的加密包，不接收密码或解密后的正文。CFB magic只可作保守阻写，不能据八字节宣称支持某种加密。

## 2. Signatures

`lib/document-publication.ts`：

```ts
withDocumentPublication<T>(id: string, work: () => Promise<T>): Promise<T>
readUploadSnapshot(id: string): Promise<UploadSnapshot | null>
// UploadSnapshot = { identity: {meta,key,source,compound}, data: Uint8Array, meta: UploadMeta }
sameUpload(a: UploadIdentity | null, b: UploadIdentity | null): boolean
```

`meta`/`source`身份为实际原始字节SHA256，不能仅比较DB sourceKey。DB原子接口位于 `db/document-index.ts`，`IndexIdentity={body,contentHash,sourceKey}`；分块与向量另核真实chunk id/documentId/content。

## 3. Contracts

- 一次读取快照必须拥有meta原始字节及source独立拷贝；parser、filename/mime与加密分类使用**同次快照**。storage可能回收backing buffer，必须在后续await前复制。禁止先读取SHA，再另读parser数据；A→B→A能使末次SHA比较通过却发表B。
- 同文档的source/meta/body/index发表共用进程内队列，provider工作在锁外；最终重新读取实际身份并核DB CAS。缺失来源不得悄悄重试另一份parser输入。此队列不提供外部存储进程的分布式锁保证。
- 替换顺序：新唯一原件key → meta → 同DB事务发表source/body并失效chunks → 成功后移除旧原件。失败恢复旧meta**原始字节**并保留旧原件。跨storage/DB无分布式事务，回滚自身再失败只记录故障并保留可恢复原件，不保证双故障回滚。
- 支持加密包保留原件，body/excerpt/contentHash为空，searchText不含正文，parseError为明确加密说明，chunks及其级联embeddings在同一事务清除。当前源已是cipher、DB仍旧plain时，sync也必须原子清正文与旧索引。
- SQLite事务回调必须同步，不能塞async；当前同步generator语句程序分别由SQLite同步`.all()`和PG真实async transaction/FOR UPDATE执行。不能以两次独立写入代替原子失效。
- cipher普通body PATCH返回409；标题/标签允许并沿相同队列，不能把旧body全行写回。UI搜索仅对真实file+支持cipher标记+空body+零chunks补标题结果，保留kind/tag/limit，不造正文snippet、语义命中或Agent引用。
- 不追溯擦除历史备份、DB日志或JS堆中曾有明文；envelope也不能证明加密payload一定为DOCX，客户端解密后另验ZIP/完整性。

## 4. Validation & Error Matrix

| 情况 | 行为 |
| --- | --- |
| 支持的Standard/Agile envelope | 原件精确保留、空正文、明确不索引说明 |
| 坏/不支持/超预算CFB | 返回实际错误，不送普通正文parser |
| parser/provider期间source或meta变化 | 拒绝迟到发表；A→B→A不能使错误输入通过 |
| 缺失source/非法meta | 不解析独立重试字节，保留当前权威状态 |
| source/meta/DB事务中段失败 | 恢复旧原始meta/source/body/chunks/embeddings |
| 同chunk id但content变化 | 拒绝旧向量，即使sourceKey相同 |

## 5. Good / Base / Bad

- Good：普通文档已有正文/向量，替换真实加密原件后，原件可下载且旧关键字、FTS、chunks和embeddings同时消失，标题仍可搜索。
- Base：普通文件仅改标题，健康正文/分块不被无故清空。
- Bad：reindex先为A捕获SHA、又读取B解析，恢复A后允许发表B；后续sync才清空仍有正文短暂可见窗口。

## 6. Tests Required

`docx-encryption-index.test.ts` 与独立 `docx-encryption-index.check.test.ts`：真实Standard/Agile/坏envelope、下载整字节、替换与重建、真实中段事务失败回滚、metadata竞态、同key与A→B→A、meta/source复用buffer、缺失来源、迟到chunk/provider/CAS、UI标题过滤。必须对SQLite和实际PG以正式迁移跑相同scope，不用内存替代PG或跳过扩展迁移。配合upload/chunks/embed/vault/search/API回归。浏览器/模型执行另记，不以stub向量称实际provider。

## 7. Wrong vs Correct

Wrong：`identity=await uploadIdentity(id); data=await storage.read(key); parse(data); if(sameUpload(identity,current)) publish()`。

Correct：`snapshot=await readUploadSnapshot(id); parse(snapshot.data, snapshot.meta);`，发表前在同队列重新核`snapshot.identity`与当前来源及DB条件；错误正文**不能先发表再清理**。
