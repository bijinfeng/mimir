---
name: server-backend-index
description: server/backend 项目规范入口
paths:
  - apps/server/**
---

# server/backend 规范入口

适用：`apps/server/**`。具体规则只在下列文件维护。产品、技术和设计的现行契约从 [项目文档入口](../../project/index.md) 查找。

## Pre-Development Checklist

- 先读 [项目级规则](../../project/rules.md) 与本目录对应主题。
- 沿实际代码目录读嵌套 spec；不要从其他包的同名模板推断。

## 本目录

- [conventions](./conventions.md)
- [pitfalls](./pitfalls.md)

- [API 路由](./api-routes.md)
- [鉴权](./auth.md)
- [日志和错误](./logging.md)
- [测试](./tests.md)

## Quality Check

- 依项目级 [完成定义](../../project/quality.md) 跑 `pnpm check`。
- 涉及界面、检索或解析时，按该规则补实际效果验证。
