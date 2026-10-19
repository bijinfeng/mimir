# v7 产品实施验收

日期：2026-10-19。范围：AI 对话与文档侧栏、TanStack SDK 升级、真实聊天临时附件，以及本轮获准处理的全仓检查阻塞。最终全仓质量门已通过，以下按实际执行结果记录。

## 产品结果

- 用 TanStack AI React 与 Mimir 自有组件替换 assistant-ui；移除自定义 `mimir.trace` 生产和展示，保留真实 AG-UI 推理、工具、运行及中断语义。旧共享类型和历史数据保持兼容。
- 主对话与侧栏输入框保留模型、推理等级及检索范围。模型按供应商分组，用明确的 providerId/modelId 发送；等级来自所选模型实际能力，并在服务端验证。
- 统一不可变发送意图、独立 FIFO 队列、停止/失败取回草稿、Agent 原目标和版本守卫、已执行工具缓存续传；保存笔记使用当前可见回答的 canonical ID 与实际附件来源。
- 接通受保护临时附件上传、可终止解析 worker、历史和原件/图片访问、租约及回收。临时附件不会自动导入知识库，不能旁路 Agent 截图和模型视觉能力限制。
- 新组件使用现有主题字号变量；主消息/输入区域及侧栏边距按冻结稿接线。修复真实浏览器中停止按钮重渲染导致队列草稿被默认提交的问题，并补真实 DOM 点击顺序回归。

## 验证记录

| 项目 | 命令或证据 | 结果 |
| --- | --- | --- |
| 最终全仓 | 根目录 `pnpm check` | **exit 0**；lint（保留 warnings）、样式模板、格式、15 个 workspace 类型检查及全套测试通过；[机器结果](quality-gate.json) |
| 全套核心测试 | 本轮最终 `pnpm check` | Server 122 文件 1365/1365；Office 230 文件 2709/2709；Renderer 75 文件 581/581；Chat 7 文件 84/84 |
| 其他全套测试 | 同一质量门 | Provider 31、Storage 13（另 2 项跳过）、Miniapp 8、Server local 10 / fnOS 4 / backup 2、Desktop 50、根脚本 6 均通过；Web 无测试文件 |
| Chat 独立复核 | Chat Vitest、tsc、oxlint | 7 文件 84/84；类型及 lint 通过 |
| Renderer 字号守卫 | `design.test.ts` | 109/109；没有放宽守卫 |
| PostgreSQL | 六个附件/模型/流式/Agent/schema 测试文件 | 84/84；独立测试数据库，PG 16.15、vector 0.8.1、pg_trgm 1.6 |
| Web / Server / Desktop | 各包生产 build | 均 exit 0；Web/Desktop 已在最后字号变量修改后重建 |
| Miniapp | 类型、工程测试、build、产物校验 | 8/8；7 页、667 模块、455.2 KiB；设备 GUI 未验 |
| 依赖锁 | `pnpm install --frozen-lockfile --offline --registry https://registry.npmjs.org` | exit 0；之后未改 manifest/lock |
| 真实产品浏览器 | [browser-qa.md](browser-qa.md) 与截图 | 主/侧栏浅深及窄屏，真实附件、图片、引用、历史、队列、停止与保存抽验通过 |
| 独立源码复核 | [independent-review.md](independent-review.md) | 发现均已处置；独立源码复核通过；主会话已完成最终全仓检查 |
| 来源覆盖 | [parity.md](parity.md) / [parity.json](parity.json) | 71 组 379 来源状态 + 24 附件状态；这是源码/测试映射，不是 403 次 GUI 操作通过 |

PostgreSQL 命令在 `apps/server` 执行，使用本轮独立数据库：

```sh
TEST_DATABASE_URL=postgres://admin@127.0.0.1:5432/mimir_test_chat_v7_20261019 ./node_modules/.bin/vitest run src/test/chat-attachments.test.ts src/test/chat-model-selection.test.ts src/test/chat-stream.test.ts src/test/docx-agent-stream.test.ts src/test/document-agent-core.test.ts src/db/schema-parity.test.ts
```

运行期原始日志位于 `/tmp/mimir-chat-v7-release-check.log`、`/tmp/mimir-chat-v7-pg.log`、`/tmp/mimir-chat-v7-final-{web,server,desktop}-build.log`、`/tmp/mimir-chat-v7-install.log`；该临时路径不是长期归档承诺，长期结果以本记录及提交内的测试、独立复核和截图为准。

## 固定版本与冻结稿

本轮已验证 exact 版本：`@tanstack/ai` 0.69.0、`@tanstack/ai-client` 0.39.3、`@tanstack/ai-react` 0.30.4、`@tanstack/ai-openai` 0.30.0。这是本轮实施时核查的稳定版本，不代表将来的 registry latest。

v1–v7 原型保留。本轮没有重建或修改冻结原型；v7 三份 SHA-256 再次核对一致：

| 文件 | SHA-256 |
| --- | --- |
| `review.html` | `1537bb796575dc47c8cc5b5661034b5bfa80e23d4a5995e9ff2a6ef39d67e3ff` |
| `thread.review.html` | `f5f7195aaf4639c52e327078a1e86224026da0f32d2455ec00806b427a1be827` |
| `interactions.html` | `acbcaf31377a0500ae9402ab07bbd9b495faed30b8c5ddaffe1ba0f804040de6` |

## 全仓工程修复

- DOCX 保存只去除厂商 writer 新建的 ZIP 目录占位，保留原目录和全部文件/新增部件；没有递归删除目录。XLSX 保存等待实际字节及“已保存”终态；DOCX 加密测试等待真实 worker response。测试断言没有弱化，Vitest timeout 没有调整。
- 小程序修复 React render/ref/effect 与 Taro void API 类型问题；产物校验沿真实 `app.wxss` import 图判断 NutUI 可达性，保留包体积和模块边界检查。
- 根 lint 只增加具体第三方原始源码、受保护模板运行时和缓存路径排除；本项目产品和原型自有源码仍参与检查。排除路径兼容任务归档。
- 修复服务端缺失文件 ID 的 400 边界、miniapp setup 断言、Renderer 测试 ES 版本和两处格式问题。旧结构集成测试仍要求非空 trace，已按批准的 product §5.6 改为响应/历史均不生成 trace，同时保留真实文档可访问性并加强本次 source ID 与 canonical 回答重载引用一致性。没有借全仓修复修改其他任务的产品设计。

## 验收边界

真实浏览器使用隔离 SQLite、文件存储和本地 OpenAI-compatible HTTP/SSE 服务，测试账号统一为 admin@example.com。没有认证外部付费供应商、原生 Electron 窗口、系统中文输入法或全平台读屏。源码/HTTP/数据库/worker 测试覆盖的 Agent 接缝不冒充逐项 GUI 复验。构建保留第三方 eval、动态导入和编译器提示，lint 允许的既有 warnings 如实保留。

产品回滚需成组还原 chat/runtime、宿主、shared/provider/server 合同及依赖锁；附件迁移不删除旧历史，回滚 UI 时保留已上传资源及数据库记录，不执行破坏性降级。未推送远端。

## 完成结论

批准范围内的产品迁移、真实临时附件、工程阻塞修复及规范同步已完成。最终完整全仓检查 exit 0；上一轮只剩的旧 trace 断言已按新契约更新，并在最终 1365 项服务端套件中通过。工作提交、归档及日志由本轮收尾记录，不推送。

## 工作提交

- `25f5ca69e6fbbfebcedbcc5804ba9061876bff28`：Office 保存边界与异步测试。
- `57c24e34930ae04d598d9217c4b1935cc9f27989`：全仓检查及小程序产物校验。
- `c4970020b89c79c2bf21cf27570225d758f07840`：TanStack 对话迁移与真实临时附件。

以上为工作提交；后续任务归档和会话日志单独提交。
