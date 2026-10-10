---
name: tokenizer-backend-index
description: tokenizer/backend 项目规范
paths:
  - packages/tokenizer/**
---

# tokenizer/backend

写入与查询使用同一套中文预分词规则；不要另起一份切词实现。

## Pre-Development Checklist

- 先读[项目入口](../../project/index.md)和任务涉及的 `.trellis/spec/project/architecture.md §4.4` 章节。
- 在 `packages/tokenizer/src/tokenizer.ts`、`apps/server/src/services/chunks.ts` 核对当前接口与调用方向。

## Quality Check

- 按[项目完成定义](../../project/quality.md)运行 `pnpm check`；涉及检索或解析时再核对真实结果。
- 检查新增实现是否仍遵守上述边界与 `@mimir/shared` 中的接口。
