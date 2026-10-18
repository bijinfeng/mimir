---
name: mimir-miniapp-frontend-index
description: 微信小程序的原生组件、依赖及构建规范入口
paths:
  - apps/miniapp/**
---

# miniapp / frontend

适用 `apps/miniapp`，独立 Taro 微信客户端。浏览器交互原型只作设计参照，不属于本包运行时。

## Pre-Development Checklist

1. 读[项目规则](../../project/rules.md)、[完成定义](../../project/quality.md)及当前任务的批准范围。
2. 读[工程与构建合同](./build.md)，再读要改的 `config`、`src` 和验证脚本。
3. 新增接口前读 [shared](../../shared/contract/index.md) 与 [server](../../server/backend/index.md)；当前基础包尚未实现登录、请求或持久化。

## 当前实现与边界

- `src/app.config.ts` 注册问答、知识库、我的三个原生 tab；页面使用 `@tarojs/components`。
- `src/app.scss` 维护小程序主题。沿用项目绿色主动作、灰色导航选中态和紧凑间距；不要复制浏览器设备壳、DOM 元素或桌面三栏。
- NutUI 使用具体组件及其样式入口，避免根入口拉入整库。先确认包中真实导出，不凭其他版本的文档编造路径。
- `config/server.mjs` 校验构建时固定服务地址。显示“已配置”只说明配置存在，不能表示网络或账号连接成功。
- 当前三个页面展示尚未接入状态；真实数据接入后按用户可见行为替换，不能塞入原型模拟答案或账号状态。

## Quality Check

- `pnpm --filter @mimir/miniapp test`
- `pnpm --filter @mimir/miniapp typecheck`
- `pnpm --filter @mimir/miniapp build`（含产物校验）
- 全仓 `pnpm check`；不降低既有检查来容纳新端。
- 检查最终 React 依赖归属和微信产物大小。涉及页面交互时在微信开发工具或真机查看；只有产物验证时，明确标注未验证的视觉及设备行为。
