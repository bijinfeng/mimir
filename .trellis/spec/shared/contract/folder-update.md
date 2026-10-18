# Folder update contract

## 1. Scope / Trigger

知识库统一创建/编辑表单通过现有目录 PATCH 更新名称与描述。共享 schema 位于
`packages/shared/src/structure.ts`，服务实现在 `apps/server/src/services/folders.ts`。

## 2. Signatures

- `PATCH /api/folders`：`{ from: string, to: string, description?: string }`。
- Renderer：`api.folders.move(from, to, { description }?)`。
- 成功响应：`{ moved: number, path?: string, description?: string | null }`；新增字段可选以兼容旧服务端。
- 失败恢复：`folderUpdateRecoverySchema` 校验 `{ code: string | null, path: string | null, description: string | null, retrySafe: boolean }`。

## 3. Contracts

- 路径沿用 `folderPathSchema`：trim、非空、最多 200 字符、无空路径段和 `..`。
- description 省略保留旧值；请求字符串最多 2000 字符，服务层再 trim，`''` 清空，返回空值为 null。UI 新描述上限 500，但历史长描述未修改时无损保留。
- `from === to` 仍校验存在性并允许描述保存。改名不改变目录 code/icon，后代路径和文档归档指派随之更新。
- 文件与数据库采用补偿协调：先保存原文件内容和元数据快照，更新文件及索引后再修改根目录路径/描述。禁止跨文件 I/O 使用异步 `db.transaction`。
- 失败尝试恢复笔记原始字节（含自定义 YAML）、上传元数据、文档索引与目录记录。此行为不承诺崩溃时原子性或并发多写隔离。
- 失败响应 `details.recovery` 通过稳定 code 读取实际路径。任一补偿失败或无法确认身份即 `retrySafe: false`。客户端按 code 重读目录树后才能更新重试目标；服务端明确 false 时，重读成功也不得解除阻断。
- 未增加环境变量或数据库迁移。

## 4. Validation & Error Matrix

| 条件 | 结果 |
| --- | --- |
| 未登录 | 401 |
| 非法路径、null 或超过 2000 字的描述 | 400 INVALID_INPUT |
| 来源不存在，包括同路径更新 | 404 |
| 目标冲突或非法子树移动 | 沿用既有冲突/移动校验错误，不变更草稿 |
| 文件、上传元数据或索引更新失败 | 500 FOLDER_UPDATE_FAILED，携带可验证的 recovery（若身份可读） |
| recovery 不可信/缺失、补偿不完整 | 保留草稿，阻止使用旧路径盲目重试 |

## 5. Good / Base / Bad Cases

- Good：`{from:'技术',to:'研发',description:'工程笔记'}` 一起更新根名称和描述，文档 ID 与 code 不变。
- Base：`{from:'技术',to:'技术',description:''}` 清空描述；旧调用不传 description 时保留。
- Bad：改名已部分生效后按旧 `from` 重试；必须先核对 code 对应的实际状态。

## 6. Tests Required

`apps/server/src/test/folder-update.test.ts` 覆盖旧调用/响应兼容、仅描述/清空/未改、历史长描述、改名与子树、权限/冲突/不存在、文件/SQL/上传元数据故障及补偿不完整。改动 SQL 时按 SQLite 与 PostgreSQL 两种方言验证。
Renderer 的共享 Modal 与 `FolderSection` 测试覆盖草稿保留、两字段预填、重复提交与 IME、失败重取和禁止不安全重试；`NavSidebar` 集成覆盖改名后保留打开文档与目录后缀。

## 7. Wrong vs Correct

```ts
// Wrong: 将未传描述当作清空，并用原路径自动重试。
await api.folders.move(from, to, { description: description ?? '' })

// Correct: 只有用户编辑描述才传入；失败时先按 stable code 核对服务端状态。
await api.folders.move(from, to, descriptionChanged ? { description } : undefined)
```
