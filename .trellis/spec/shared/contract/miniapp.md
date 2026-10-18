---
name: shared-miniapp-contract
description: 小程序设备、范围、版本和操作回执的唯一跨层合同
paths:
  - packages/shared/src/miniapp.ts
  - packages/shared/src/retrieval.ts
  - apps/miniapp/**
  - apps/server/src/**/miniapp*.ts
---

# 微信小程序合同

## 1. Scope / Trigger

适用于独立微信客户端和 `/api/miniapp`。DTO 与 Zod schema 只在 `packages/shared/src/miniapp.ts` 定义，客户端从 `@mimir/shared/miniapp` 导入；范围在 `retrieval.ts` 定义，旧客户端的默认范围保持兼容。

## 2. Signatures

```ts
type RetrievalScope =
  | { type: 'all' }
  | { type: 'folder'; path: string }
  | { type: 'document'; documentId: string }
interface MiniappPage<T> { items: T[]; nextOffset: number | null }
interface MiniappWriteResponse { operation: MiniappOperation }
```

登录返回 `MiniappSession & { token: string }`；普通会话响应不返回 token。文档详情提供 `revision`、`canEditBody`、`hasOriginal`、`indexState`，去除服务端 `path` 与 `sourceKey`。

## 3. Contracts

- `requestId` 长度 16–100，仅允许字母、数字、下划线和连字符；同一次操作重试沿用编号及原 payload。不同内容不能复用编号。
- 新建必传已有 `folder`；更新与追加必传 `expectedRevision`。正文最多 2,000,000 字符；标题 1–200；标签最多 20 个，每个 1–50 字符。未知写字段由 strict schema 拒绝。
- `GET /search` 的 `scope` 是 JSON 编码的 `RetrievalScope`；聊天体的 `scope` 是对象，`mode: 'ask' | 'search'` 与范围相互独立。
- 会话持久化 `retrievalScope`。继续会话必须保持范围；切范围新建会话。目录包含自身和以 `/` 分段的子树，不能按纯字符串前缀扩大范围。
- 操作状态为 `pending | succeeded | failed | interrupted`；结果类型为 `document | saved-answer | capture | chat`。受理后的业务失败在 `operation.error` 中返回，即使 HTTP 为 200 也不能当作保存成功。失败和结果不确定分别表达，不能自动重执行中断写入。
- SSE 的 `data` 为 JSON，沿用 AG-UI 事件；`CUSTOM / mimir.operation` 携带 `{ operation }`。只有持久化成功后才发 `RUN_FINISHED`；重放成功请求不再生成答案。
- 本合同不接受 Agent 模式、工具参数、任意文件路径或原件编辑。

## 4. Validation & Error Matrix

| 情况 | 行为 |
| --- | --- |
| 无效凭证、过期、撤销或密码变化 | 401，清除客户端登录状态并允许保留隔离草稿 |
| 未知字段、范围格式错误 | 400，不降级成全库 |
| 目录或文档范围消失 | 拒绝并要求重新选范围 |
| 源文与索引不一致 | `SOURCE_CHANGED`，不使用过期片段回答 |
| expectedRevision 过期 | failed 回执的 `DOCUMENT_CONFLICT`，不写入；允许保留、重载或另存草稿 |
| 相同 requestId 携带不同内容 | `REQUEST_ID_CONFLICT` |
| 请求断线或后台切换 | 查询回执及持久化会话，不能仅凭 HTTP 结束推断成功 |

## 5. Good / Base / Bad Cases

- Good：对指定长文提问，返回该文相关尾部分块；引用保留当时片段，打开原文按当前文档 ID。
- Base：没有配置服务地址时显示未配置，不能制造账号或联网成功状态。
- Bad：手机旧正文覆盖电脑新正文，或网络超时后自动以新编号再次抓取 / 保存。

## 6. Tests Required

后续验证须覆盖：双数据库设备撤销和迁移；所有检索通道 LIMIT 前范围过滤；中文 SSE 跨字节 / 半帧；相同请求去重及不同内容冲突；真实文件版本冲突与未知 frontmatter 保留；前后台切换后回执恢复。测试登录只使用项目 AGENTS.md 指定账号。本轮用户要求延后验证，本节是待验要求，不是已通过记录。

## 7. Wrong vs Correct

```ts
// Wrong：更新直接提交读到的旧正文，超时后创建新编号再次写入。
// Correct：原请求保留预期版本和编号，先查询它的回执。
const input = { requestId, expectedRevision: document.revision, body }
// 捕获、Office 文件只允许元信息；能力由 canEditBody 驱动。
```
