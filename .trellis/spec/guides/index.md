# 跨层检查

这份清单只提示该查哪里；具体实现约束以对应 spec 和现行文档为准。

- 新增请求字段：核对 `packages/shared/src/` 的 Zod 契约、`apps/server/src/routes/` 的校验、`packages/renderer/src/lib/api.ts` 的调用和行为测试。参见 [API 路由](../server/backend/api-routes.md)。
- 新内容来源：核对统一 `documents` Markdown 正文、解析器声明、分块与检索、导出；参见 [项目规则](../project/rules.md)、[服务端规范](../server/backend/index.md)、[`.trellis/spec/project/architecture.md` §7 与 §13](../../../.trellis/spec/project/architecture.md)。
- 文件类写入：核对文件先于数据库，以及重建索引能恢复；参见 [服务端规范](../server/backend/index.md)。
- 界面同时用于浏览器和桌面端：核对 `packages/renderer` 的平台 Context 与两端入口；参见 [渲染层规范](../renderer/frontend/index.md)。
- 跨层资源关闭：分别确认窗口、Chromium Session、HTTP 和实际数据库 client 的生命周期；某一层 Promise 成功不能证明后续资源已关闭。参见 [桌面更新](../desktop/runtime/releases-updates.md) 与 [服务端连接生命周期](../server/backend/conventions.md#数据库连接生命周期)。局部原生探针解锁一个阶段后，仍需跑完整跨版本验收。
- 改动方言相关查询：核对 SQLite 与 Postgres 两条测试路径；参见 [测试规范](../server/backend/tests.md)。
- 任何调研任务都核对 [WeKnora](https://weknora.weixin.qq.com/) 及其[公开源码](https://github.com/Tencent/WeKnora)，记录版本、具体证据和适用性；不相关时说明原因。按领域选主要参考：知识库与 Agent 看 WeKnora，页面布局与风格看 Obsidian，文件编辑看 Office 网页版、Google Docs、GenOffice。Office 工具栏不以 WeKnora 的 Markdown 编辑器为主要依据，也不能只凭印象转述竞品功能。
