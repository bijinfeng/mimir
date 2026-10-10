---
name: plugin-capturer-backend-index
description: plugin-capturer/backend 项目规范
paths:
  - plugins/capturer/**
---

# plugin-capturer/backend

capturer 只取得 URL 原始内容与元数据；转换 Markdown、落库和快照不在此包。`web` 兜底匹配排最后。

## Pre-Development Checklist

- 先读[项目入口](../../project/index.md)和任务涉及的 `.trellis/spec/project/architecture.md §7.2–7.4` 章节。
- 在 `plugins/capturer/src/index.ts`、`web.ts`、`http.ts` 核对当前接口与调用方向。

## Quality Check

- 按[项目完成定义](../../project/quality.md)运行 `pnpm check`；涉及检索或解析时再核对真实结果。
- 检查新增实现是否仍遵守上述边界与 `@mimir/shared` 中的接口。
