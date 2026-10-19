---
name: plugin-provider-backend-index
description: plugin-provider/backend 项目规范
paths:
  - plugins/provider/**
---

# plugin-provider/backend

模型角色的适配器只在 provider 包构造；具体供应商实例是配置数据。

## Pre-Development Checklist

- 先读[项目入口](../../project/index.md)和任务涉及的 `.trellis/spec/project/architecture.md §5.7 与 §7.4` 章节。
- 在 `plugins/provider/src/index.ts`、`provider.ts`、`instances.ts` 核对当前接口与调用方向。

## Quality Check

- 按[项目完成定义](../../project/quality.md)运行 `pnpm check`；涉及检索或解析时再核对真实结果。
- 检查新增实现是否仍遵守上述边界与 `@mimir/shared` 中的接口。

对话按轮次选择与能力合同见 [conventions](./conventions.md)。
