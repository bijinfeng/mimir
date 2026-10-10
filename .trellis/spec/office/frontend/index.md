---
name: office-frontend-index
description: Office 编辑器外壳与各格式 UI 的入口
paths:
  - packages/office/src/shell/**
  - packages/office/src/editors/**
---

# Office 界面

## Pre-Development Checklist

- 先读[项目入口](../../project/index.md)、[Office 引擎规则](../engine/index.md)，再读 [shell](./shell/index.md) 或 [editors](./editors/index.md)。
- 当前产品能力与限制以 [`.trellis/spec/project/architecture.md` §15](../../../../.trellis/spec/project/architecture.md) 和 [`.trellis/spec/project/design.md`](../../../../.trellis/spec/project/design.md) 为准。

## Quality Check

- `pnpm check` 通过，补丁保存与原件保真用对应格式测试验证；界面改动须实际查看。
