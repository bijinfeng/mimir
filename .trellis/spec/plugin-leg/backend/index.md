---
name: plugin-leg-backend-index
description: plugin-leg/backend 项目规范
paths:
  - plugins/leg/**
---

# plugin-leg/backend

检索通道只返回已排序的检索单元 id；融合在 core，方言实现按 PG/SQLite 分开。

## Pre-Development Checklist

- 先读[项目入口](../../project/index.md)和任务涉及的 `.trellis/spec/project/architecture.md §4 与 §7.4` 章节。
- 在 `plugins/leg/src/index.ts`、`keyword.pg.ts`、`keyword.sqlite.ts` 核对当前接口与调用方向。

## Quality Check

- 按[项目完成定义](../../project/quality.md)运行 `pnpm check`；涉及检索或解析时再核对真实结果。
- 检查新增实现是否仍遵守上述边界与 `@mimir/shared` 中的接口。
