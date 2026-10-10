---
name: mimir-project-index
description: mimir 的 Trellis 规范与项目知识入口
paths:
  - apps/**
  - packages/**
  - plugins/**
  - scripts/**
---

# mimir 项目入口

mimir 是单用户自托管知识库。设计已定稿；按现行契约实现，不重新评估已作出的产品取舍。
项目长期知识只在 `.trellis/spec/` 维护；一次性方案与过程放在 `.trellis/tasks/`。

## 唯一归属

| 内容 | 维护处 |
| --- | --- |
| 产品边界、非目标、交互与范围 | [产品契约](./product.md) |
| 当前架构、接口、数据与部署约束 | [技术契约](./architecture.md) |
| 当前视觉和交互数值 | [设计契约](./design.md) |
| 必须遵守的跨包规则 | [项目规则](./rules.md) |
| 验证门槛与常用命令 | [完成定义](./quality.md) |
| 跨包静默坑 | [项目坑表](./pitfalls.md) |
| 历史取舍的理由、被否决的方案 | [决策记录](./decisions.md) |
| 调研与实测证据 | [调研记录](./research.md) |
| 包与层的实施约定 | 下方的包规范索引 |

决策记录和调研记录提供历史理由与证据；发生冲突时，以当前产品、技术、设计契约及代码为准。
同一事实只维护一个现行归属，其余位置链接过去。

## 按问题找

| 问题 | 入口 |
| --- | --- |
| 能做什么、明确不做什么 | [产品契约 §1、§4](./product.md) |
| 页面与交互如何工作 | [产品契约 §5](./product.md)、[设计契约 §8](./design.md) |
| 数据、检索、插件与部署 | [技术契约 §4、§7、§8](./architecture.md) |
| 颜色、字号、间距、动效 | [设计契约 §3–§6](./design.md) |
| 某项取舍为何作出 | [决策记录](./decisions.md)、[调研记录](./research.md) |
| 当前范围和后续任务 | [技术契约 §11](./architecture.md)、`.trellis/tasks/` |
| 区域编码规则与坑 | 下方包规范索引及[项目坑表](./pitfalls.md) |

## Pre-Development Checklist

1. 读[项目规则](./rules.md)与[完成定义](./quality.md)。
2. 读[产品契约 §1](./product.md)非目标，再读任务涉及的技术、设计章节。
3. 按改动路径读对应包的 `index.md` 与具体规则；跨包任务还要读[跨层检查](../guides/index.md)。
4. 写新规范前在当前代码、测试或配置里找到实例，不填通用模板。

## 包规范

| 区域 | 入口 |
| --- | --- |
| 服务端 | [server/backend](../server/backend/index.md) |
| 共享 UI | [renderer/frontend](../renderer/frontend/index.md) |
| 浏览器壳 | [web/frontend](../web/frontend/index.md) |
| 桌面端 | [desktop/runtime](../desktop/runtime/index.md) |
| 对话包 | [chat/frontend](../chat/frontend/index.md) |
| Office 引擎与界面 | [office/engine](../office/engine/index.md)、[office/frontend](../office/frontend/index.md) |
| 共享契约与核心骨架 | [shared/contract](../shared/contract/index.md)、[core/backend](../core/backend/index.md) |
| 中文分词 | [tokenizer/backend](../tokenizer/backend/index.md) |
| 插件接缝 | [capturer](../plugin-capturer/backend/index.md)、[parser](../plugin-parser/backend/index.md)、[leg](../plugin-leg/backend/index.md)、[provider](../plugin-provider/backend/index.md)、[storage](../plugin-storage/backend/index.md) |

## Quality Check

`pnpm check` 必须通过。检索与解析要验证用户可见效果；界面改动要说明实际看到的结果。没有运行的验证不得声称已运行。详情见 [`quality.md`](./quality.md)。
