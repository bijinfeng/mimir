---
name: server-miniapp-boundary
description: 独立设备鉴权、文档版本和持久化操作的服务端边界
paths:
  - apps/server/src/**/miniapp*.ts
  - apps/server/src/db/schema*.ts
  - apps/server/src/services/documents.ts
---

# 小程序服务边界

## 1. Scope / Trigger

`/api/miniapp` 是自用客户端的有限入口，采用独立设备 bearer 凭证。普通 `/api` 保持 Better Auth / 本地桌面鉴权。跨层形状以 [miniapp 合同](../../shared/contract/miniapp.md) 为准，不在路由定义另一份。

## 2. Signatures

- `loginMiniapp(input)`、`authenticateMiniapp(authorization)`、`logoutMiniapp(principal)`。
- `beginMiniappOperation(principal, requestId, kind, payload)` 返回 `{ operation, fresh }`；只在 fresh 时执行副作用。
- `runMiniappOperation(..., action, background?)`、`getMiniappOperation(principal, id)`、`recoverMiniappOperations()`。
- `updateNote(id, input, { expectedRevision, appendText?, preserveSource?, requireDurableMetadata? })` 在已有 publication 锁内检查并写入；`readDocumentVersion(id)` 自己取得该锁，不能从锁内 precondition 再调用它。
- `miniapp_devices` 存设备、owner、Better Auth backing session、token hash、credential hash 和有效期 / 撤销时间。
- `miniapp_operations` 存 owner / requestId 唯一键、发起 device、请求指纹、状态、processId、会话与结果；`conversations.retrieval_scope` 可空，兼容旧行。
- PG 与 SQLite schema、SQL 迁移和 snapshot / journal 必须同批维护。

## 3. Contracts

- `MIMIR_MINIAPP_ENABLED=1` 才开启入口，默认关闭。入口在普通受保护 `/api` 之前独立挂载，未知子路径不能落入普通权限组。
- 账号解析复用已有用户名 / 邮箱规则，密码验证调用 Better Auth API；不自写密码 hash。Backing session cookie / token 不交付给小程序。
- 随机设备 token 只在登录响应交付明文，DB 只存 SHA-256；每次鉴权同时检查设备、backing session 与密码摘要。删除 session、退出或密码变化均使设备失效。设备最长 30 天，且不超过 backing session。
- 专用组只提供账号、目录 / 标签 / 文档、有限笔记写入、捕获、检索 / 问答 / 历史及回执。原件仅复用已有鉴权下载 GET handler，不开放旧文件写入、Agent、配置或维护入口。
- revision 以当前源文和元信息为真相；expectedRevision 在既有文档 publication 锁内检查。追加正文也在同一锁内读取并计算，不能锁外拼接旧内容。
- Markdown 保留源正文和未知 frontmatter；仅元信息更新不能覆写旧正文。非 note 拒绝 body；写入顺序保持文件先于数据库和索引。
- 同账号 / requestId 以稳定请求指纹去重，重新登录换设备凭证后仍能查询旧回执；相同内容返回已有回执，不重复执行。不同内容冲突。进程重启时遗留 pending 转 interrupted；结果不确定时不自动再执行。
- 捕获可脱离 HTTP 等待继续执行，页面查询真实 capture 结果；不编造百分比或完成状态。受保护资源 URL 不包含 token，不引入任意 URL 代理。

## 4. Validation & Error Matrix

| 条件 | 行为 |
| --- | --- |
| 未开启入口 | 404 |
| 无 / 无效 / 撤销设备凭证 | 401 |
| 错误账号或密码 | 相同通用登录失败信息 |
| 登录次数过多 | 有界限流，不记录账号、密码和 token |
| 旧版本写入 | `DOCUMENT_CONFLICT` failed 回执，副作用之前终止 |
| 目标目录缺失 | 拒绝，不能默认移到其他库 |
| 已有 requestId 不同指纹 | 409 `REQUEST_ID_CONFLICT` |
| 可确定业务失败 | failed 回执，HTTP 200 也不表示副作用成功 |
| 副作用是否成功无法确定 | interrupted 回执，用户先刷新资料确认 |

## 5. Good / Base / Bad Cases

- Good：同一个保存请求响应丢失，客户端用原 requestId 读取成功回执和原文档。
- Base：小程序入口关闭，已有 web / desktop 登录按原规则运行。
- Bad：把设备 token 接到普通 requireAuth，或锁外检查版本后再调用 updateNote。

## 6. Tests Required

待验证：双数据库 schema parity / 迁移；设备 token 不可访问普通 API；过期、密码变化、撤销和无凭证下载；冲突不改文件、DB、索引；原文 / frontmatter 往返；追加并发；请求去重、指纹冲突、重启恢复与写后响应丢失；捕获部分失败真实回执。不得在生产库验证或用删除表 / 文件回滚；本轮按用户指示未运行检查。

## 7. Wrong vs Correct

```ts
// Wrong：读取版本后在另一次锁中写入，中间允许电脑更新。
await checkRevision(expectedRevision)
await updateNote(id, input)
// Correct：由 updateNote 自己在既有锁内读取版本和比较。
await updateNote(id, input, {
  expectedRevision,
  preserveSource: true,
  requireDurableMetadata: true,
})
```
