# 跨层检查

这份清单只提示该查哪里；具体实现约束以对应 spec 和现行文档为准。

- 新增请求字段：核对 `packages/shared/src/` 的 Zod 契约、`apps/server/src/routes/` 的校验、`packages/renderer/src/lib/api.ts` 的调用和行为测试。参见 [API 路由](../server/backend/api-routes.md)。
- 新内容来源：核对统一 `documents` Markdown 正文、解析器声明、分块与检索、导出；参见 [项目规则](../project/rules.md)、[服务端规范](../server/backend/index.md)、[`.trellis/spec/project/architecture.md` §7 与 §13](../../../.trellis/spec/project/architecture.md)。
- 文件类写入：核对文件先于数据库，以及重建索引能恢复；参见 [服务端规范](../server/backend/index.md)。
- 界面同时用于浏览器和桌面端：核对 `packages/renderer` 的平台 Context 与两端入口；参见 [渲染层规范](../renderer/frontend/index.md)。
- 改动方言相关查询：核对 SQLite 与 Postgres 两条测试路径；参见 [测试规范](../server/backend/tests.md)。
