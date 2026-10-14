# 实施计划：文档 Agent 共用接缝

1. [ ] 固定现有 DOCX 端到端和历史测试作为回归基线；列出工具合同、请求字段、客户端桥、运行记录和能力查询的重命名/兼容点。
2. [ ] 在 `@mimir/shared` 增加格式判别合同和统一句柄结果；SQLite/PostgreSQL 同步迁移运行记录。
3. [ ] 改造服务端工具目录选择、鉴权、能力查询、续轮消费和历史展示；保留 DOCX 旧记录与入口。
4. [ ] 改造 `@mimir/chat` 通用画布桥及 `@mimir/renderer` 当前文档句柄路由；笔记页和文件页均可交出句柄，尚未接入的格式保持只读问答。
5. [ ] 用一个受控假格式执行器验证从用户指令到模型工具、画布结果和续轮的完整生命周期；再跑 DOCX 真实执行器回归，不把假格式注册成产品功能。
6. [ ] 运行 `pnpm --filter @mimir/chat test`、`pnpm --filter @mimir/server test`、`pnpm --filter @mimir/renderer test`、`pnpm check`、`git diff --check`；实际浏览器复核 DOCX 和普通单篇问答。

风险：`docx-agent-stream.ts`、`DocxInterruptBridge.tsx`、数据库迁移与历史反序列化；同一工具名跨格式时必须由服务端格式判别，而非名字猜测。
