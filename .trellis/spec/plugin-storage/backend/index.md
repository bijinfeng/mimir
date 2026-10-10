---
name: plugin-storage-backend-index
description: plugin-storage/backend 项目规范
paths:
  - plugins/storage/**
---

# plugin-storage/backend

storage 以 DATA_DIR 相对 POSIX key 读写；本地与 S3 同一时刻只选一个后端。

## Pre-Development Checklist

- 先读[项目入口](../../project/index.md)和任务涉及的 `.trellis/spec/project/architecture.md §7.2 与 §13` 章节。
- 在 `plugins/storage/src/index.ts`、`local.ts`、`s3.ts` 核对当前接口与调用方向。

## Quality Check

- 按[项目完成定义](../../project/quality.md)运行 `pnpm check`；涉及检索或解析时再核对真实结果。
- 检查新增实现是否仍遵守上述边界与 `@mimir/shared` 中的接口。
