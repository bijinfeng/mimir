---
name: shared-contract-index
description: shared/contract 项目规范
paths:
  - packages/shared/**
---

# shared/contract

API 请求/响应 schema 与插件接缝接口的唯一契约包；前后端都从这里取类型。

会话临时附件、受保护原件、寿命/队列 lease 和消息协议历史见 [chat-attachments](./chat-attachments.md)。

微信小程序设备凭证、范围、文档版本及操作回执见 [miniapp](./miniapp.md)。

知识库/文件夹改名、描述更新与失败恢复见 [folder-update](./folder-update.md)。

DOCX 对话编辑的跨层工具与续轮合同见 [docx-agent](./docx-agent.md)。
多格式共用鉴权、能力查询、画布句柄及续轮合同见 [document-agent](./document-agent.md)；各格式真实执行能力须由对应格式任务验证。
PDF 原文与批注 HTTP、NM/IRT 身份和鉴权作者合同见 [pdf-agent](./pdf-agent.md)。
XLSX 范围宿主与显式 WASM 公式缓存重算合同见 [xlsx-agent](./xlsx-agent.md)。

桌面只读更新状态、独立窗口动作与保存 nonce 握手见 [桌面发布与更新](../../desktop/runtime/releases-updates.md)，契约类型唯一存于 `src/desktop.ts`。

## Pre-Development Checklist

- 先读[项目入口](../../project/index.md)和任务涉及的 `.trellis/spec/project/architecture.md §3 与 §7.4` 章节。
- 在 `packages/shared/src/index.ts`、`documents.ts`、`seams.ts` 核对当前接口与调用方向。

## Quality Check

- 按[项目完成定义](../../project/quality.md)运行 `pnpm check`；涉及检索或解析时再核对真实结果。
- 检查新增实现是否仍遵守上述边界与 `@mimir/shared` 中的接口。

## 笔记标题补全契约

### 1. Scope / Trigger

Markdown 内链的 `[[` 建议与链接工具查找现存笔记时使用此接口。标题查找必须在服务端限量，不能由编辑器拉取整个文档列表。

### 2. Signatures

- `GET /api/documents/notes/lookup?q=<text>`
- `api.documents.findNotes(query: string): Promise<{ items: NoteLookupItem[] }>`
- `findNotes(query: string): Promise<NoteLookupItem[]>`，由服务层查询数据库。

### 3. Contracts

- 请求 `q` 是可选、去首尾空白、最多 100 字符的字符串；省略或空字符串返回最近更新的现存笔记。
- 响应 `items` 至多 20 条，每条只有 `{ id: string, title: string }`。只包含 `kind=note` 且 `deletedAt IS NULL` 的记录，按 `updatedAt` 降序。
- `q` 匹配标题中的连续文本，大小写不敏感；`%`、`_`、反斜杠按普通字符处理。接口不查正文，不调用模型。

### 4. Validation & Error Matrix

| 情况 | 结果 |
| --- | --- |
| 未登录 | `401`，沿用业务接口鉴权 |
| `q` 超过 100 字符 | `400 INVALID_INPUT` |
| 无匹配 | `200 { "items": [] }` |
| 已软删除笔记 | 不出现在结果中 |

### 5. Good / Base / Bad Cases

- Good：`q=产品` 返回标题包含“产品”的现存笔记 ID 与标题。
- Base：`q=` 返回至多 20 篇最近更新的现存笔记。
- Bad：`q=100%` 只匹配标题中有字面 `%` 的笔记，不把它当 SQL 通配符。

### 6. Tests Required

`apps/server/src/test/note-lookup.test.ts` 断言标题匹配、正文不参与、通配符按字面匹配，以及软删除后结果消失；共享 schema 与服务端类型检查也必须通过。影响 SQL 方言时按服务端测试规范复测 PostgreSQL。

### 7. Wrong vs Correct

```ts
// Wrong: 编辑器逐页拉取所有文档，再在浏览器里筛标题。
// Correct: 用共享契约向服务端发有界查询。
const { items } = await api.documents.findNotes(query)
```
