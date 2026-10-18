---
name: core-backend-index
description: core/backend 项目规范
paths:
  - packages/core/**
---

# core/backend

注册表、设置解析与检索编排只在 core；具体插件不进入此包。

范围检索、长文问答及固定会话边界见 [retrieval-scope](./retrieval-scope.md)。

## Pre-Development Checklist

- 先读[项目入口](../../project/index.md)和任务涉及的 `.trellis/spec/project/architecture.md §7.4–7.5` 章节。
- 在 `packages/core/src/index.ts`、`registry.ts`、`settings/store.ts`、`pipeline.ts` 核对当前接口与调用方向。

## Quality Check

- 按[项目完成定义](../../project/quality.md)运行 `pnpm check`；涉及检索或解析时再核对真实结果。
- 检查新增实现是否仍遵守上述边界与 `@mimir/shared` 中的接口。
