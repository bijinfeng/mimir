---
name: shared-contract-index
description: shared/contract 项目规范
paths:
  - packages/shared/**
---

# shared/contract

API 请求/响应 schema 与插件接缝接口的唯一契约包；前后端都从这里取类型。

## Pre-Development Checklist

- 先读[项目入口](../../project/index.md)和任务涉及的 `.trellis/spec/project/architecture.md §3 与 §7.4` 章节。
- 在 `packages/shared/src/index.ts`、`documents.ts`、`seams.ts` 核对当前接口与调用方向。

## Quality Check

- 按[项目完成定义](../../project/quality.md)运行 `pnpm check`；涉及检索或解析时再核对真实结果。
- 检查新增实现是否仍遵守上述边界与 `@mimir/shared` 中的接口。
