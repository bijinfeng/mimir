---
name: core-retrieval-scope
description: 固定范围在检索通道、片段与会话中的传递规则
paths:
  - packages/core/src/pipeline.ts
  - plugins/leg/src/**
  - apps/server/src/search/**
  - apps/server/src/services/retrieval-scope.ts
  - apps/server/src/services/assistant*.ts
---

# 检索范围与长文问答

## 1. Scope / Trigger

当检索范围是目录子树或单篇文档时，必须贯穿 shared → core → 每个 leg → 宿主片段 / 引用装配。范围和仅检索 / 模型问答是两个维度。共享形状见 [小程序合同](../../shared/contract/miniapp.md)。

## 2. Signatures

- `SearchParams.retrievalScope?: RetrievalScope`，core / leg 查询使用同名字段。
- `normalizeRetrievalScope(scope): Promise<RetrievalScope>` 校验现存目标。
- `retrievalScopeCondition(scope?)` 为宿主 ORM 条件；`plugins/leg/src/scope.ts` 的 `scopePredicate(scope?)` 为通道条件。
- `createConversation(title = '', scope?)`、`ensureConversationScope(conversationId, scope)` 保存并固定会话范围。
- `saveMessageAsNote(messageId, options?: { folder?: string })` 复用回答与笔记关系。

## 3. Contracts

- PG / SQLite 的 keyword、substring、vector 均在排序 / LIMIT 前过滤。先全库取前 N 再过滤，会把范围内真实命中挤掉。
- folder 按自身或 `path + '/'` 子树比较，LIKE 的 `%`、`_`、反斜杠必须转义；值参数化，不能拼接 SQL 片段。
- snippets、文件标题兜底、引用正文装配重复施加范围和未删除条件，避免候选装配期间目标变化时越界。
- 单篇问答使用该文相关 chunks，不能取正文开头固定字符数；流式与非流式共用问答检索准备逻辑。
- 显式范围需要检查当前源文与索引一致；GET 不自动修改原文或重建索引。文件索引尚无原件字节 hash，使用现有本地解析结果比较，不能只比较名称和长度。
- 新会话持久化 scope；已有 scope 不可更改。无 scope 的旧会话兼容读取，含历史消息的旧会话不能绑定成新的受限范围。
- 引用编号绑定回答保存的来源快照；原文按当前 documentId 打开。存笔记保留引用链接，并按 messageId 串行避免重复创建。

## 4. Validation & Error Matrix

| 条件 | 结果 |
| --- | --- |
| 无 scope 的旧调用 | 保留现有默认检索路径 |
| 目录 / 文档不存在 | 拒绝，不回退全库 |
| 源文件缺失、变化或索引过期 | `SOURCE_CHANGED`，要求同步后再检索 |
| 会话已有不同范围 | `CONVERSATION_SCOPE_MISMATCH` |
| 未完成、失败、空白或用户消息存笔记 | `MESSAGE_NOT_SAVEABLE` |
| 回答已有 savedNoteId | 返回已保存笔记关系 |

## 5. Good / Base / Bad Cases

- Good：在目录 `资料/100%` 检索，仅召回它和它的子目录，通配字符按字面解释。
- Base：旧 web 请求未传 retrievalScope，继续原有默认行为。
- Bad：对长文提问只读开头 1200 字，或把 `资料/设计二` 当作 `资料/设计` 的子目录。

## 6. Tests Required

待统一验证：两种数据库下六通道过滤先于 LIMIT；目录同前缀 / 通配符 / 子树；单篇尾部唯一事实与邻文冲突事实；源文外部变化后拒绝旧引用；流式和非流式命中一致；会话跨范围拒绝；并发存回答只有一个笔记。此处规定断言点，不表示本轮已执行。

## 7. Wrong vs Correct

```ts
// Wrong：全库前 20 条可能不含目标文档。
const hits = (await globalSearch(q, 20)).filter(hit => hit.documentId === documentId)
// Correct：先限制候选集合，再排序、限量与装配。
const params = { q, limit: 20, retrievalScope: { type: 'document', documentId } }
```
