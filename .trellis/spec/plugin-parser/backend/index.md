---
name: plugin-parser-backend-index
description: plugin-parser/backend 项目规范
paths:
  - plugins/parser/**
---

# plugin-parser/backend

parser 把原始内容转成 Markdown，不抓取、不写库、不分块；文本输入已经由宿主解码。

## Pre-Development Checklist

- 先读[项目入口](../../project/index.md)和任务涉及的 `.trellis/spec/project/architecture.md §7.2 与 §13.6` 章节。
- 在 `plugins/parser/src/index.ts`、`html.ts`、`text.ts` 核对当前接口与调用方向。

## Quality Check

- 按[项目完成定义](../../project/quality.md)运行 `pnpm check`；涉及检索或解析时再核对真实结果。
- 检查新增实现是否仍遵守上述边界与 `@mimir/shared` 中的接口。
