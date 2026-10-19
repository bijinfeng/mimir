# 实际产品 GUI 验证

2026-10-19。使用真实 Web 产品与 Mimir 服务端，统一测试账号 `admin@example.com`；未改用户原有知识库。浏览器操作通过 CUA，截图来自实际产品，不是 HTML 原型。

## 环境与基线

- Web `5191` → Mimir server `3004` → 本地 OpenAI-compatible 流式 fixture `3044`。fixture 按真实 HTTP/SSE 链路返回 reasoning、Markdown 和代码，分段间隔约 2.5 秒。没有调用付费模型。
- 数据位于 `/private/tmp/mimir-official-ui-qa-20261019`，从上一轮隔离验收数据用 SQLite backup 复制，再配置独立 fixture 供应商。测试笔记、上传和会话均在隔离目录。
- 迁移前截图 `screenshots/before-main-dark.png`；相同简单历史会话迁移后截图 `screenshots/after-main-dark-parity.png`。正文位置、字体与动作行观感保持；截图视口宽高、输入焦点、会话列表及时间不同，不宣称逐像素比较。
- 同时查阅上一轮归档 v7 的产品截图。冻结 v1–v7 HTML 未修改。

## 本轮实际执行

| 操作 | 观察到的结果 | 证据 |
| --- | --- | --- |
| 供应商分组模型菜单，按当前模型支持的实际等级选择 | 无对话/思考模型分类；测试模型提供默认、关闭、低、中、高；Escape 回焦模型触发器 | 实际 DOM/焦点检查；ChatPanel 回归亦覆盖 |
| 上传真实 TXT，仅附件发送 | 上传 ready 后有受保护原件链接；默认问题实际发往服务端并收到流式回复 | 主对话最终截图、服务端真实链路 |
| 生成时排入第二问，等待正常完成 | 第二问自动发出，保留其独立用户消息和回复 | `screenshots/streaming-second.png` |
| 第一问发送、第二问入队后立即停止 | 第二问回到输入框；DOM 没有第二问用户消息，没有因按钮默认动作误发 | `screenshots/stop-restored-final.png`，原子操作和 DOM 断言 |
| Markdown/代码、复制代码 | 代码框显示，剪贴板内容为 `const selected = { providerId, modelId }` | `screenshots/main-light-final.png` |
| 浅/深主题切换 | 最终样式下代码头与正文接缝间距 0、正文 top border 为 0；修复前等特异性依赖注入顺序的问题 | `screenshots/main-light-final.png`、`main-dark-final.png` |
| 回答存成笔记 | 显示“已存成笔记”与“打开笔记” | 实际 DOM/提示检查；canonical ID 另有回归 |
| 重新载入历史 | 附件、正文、思考、动作恢复 | 实际历史会话 |
| 上传真实 PNG，打开图片预览后按 Escape | 预览关闭，焦点返回“预览 验收图片.png”；移除最后附件后空输入禁用发送 | `screenshots/image-preview.png`，DOM/焦点检查 |
| 文档侧栏打开、关闭重开 | 共用新官方 UI，默认当前文档范围，未发送草稿恢复 | `screenshots/sidebar-light.png` |
| 主对话 600px 与侧栏 390px | scrollWidth 分别为 600/390，无横向溢出；侧栏草稿仍在 | `screenshots/main-light-600.png`、`sidebar-light-390.png` |

600px 和侧栏截图在最终 CSS 接缝修正之前保存，只证明布局宽度；最终接缝以 `*-final.png` 和浅/深主题测量为准。早期停止操作因执行过慢而等到上一问完成，不计作停止保稿证据；最终原子操作截图与 DOM 断言才计通过。

## 验证方式的边界

真实文档工具执行/中断、缓存结果续传、原目标/画布版本与迟到结果、分支编辑后 canonical 保存、连接失败、隐藏思考及未知工具等由本轮重新运行的 HTTP/SSE/DOM 回归覆盖，没有逐一重复成 GUI 操作。完整协议部件、引用跳转、历史错误页、所有菜单和全部滚动状态没有穷举 GUI 认证。

本轮不包含原生 Electron 窗口、完整输入法/读屏、付费供应商认证。Desktop 生产构建通过不等于原生窗口手动验收。浏览器结束时恢复跟随系统主题，重置临时视口。

验收结束后已关闭本轮临时浏览器页并停止 5191/3004/3044 的自建 QA 服务；用户原有服务未操作，隔离数据保留于临时目录。
