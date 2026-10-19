# 附件后端实施验证

2026-10-19。产品文件已实现；无提交/推送，主会话继续主侧栏集成与独立检查。

## 已实现

- Shared ChatAttachment/Ref、预算/默认问题、历史附件、真实 protocolEvents 与当轮 modelSelection/retrievalScope 快照。
- 受保护临时资源上传、状态、原件、草稿移除、队列 lease/release；绑定真实会话/owner/hash，不调用 KB 上传。
- Worker 内纯 parser 复用；UTF-8、Office/PDF、PNG/JPEG/WebP 实际解码/容器/尺寸/解压/文字预算、最多两并行、含排队 30 秒、实际 terminate 终止。
- 存储先写再 DB、双数据库表/迁移、历史和选定消息前缀附件上下文、已发关联、失败回答仍保留、原件篡改 tombstone、删会话撤销/重试回收、重启/TTL/孤儿清理。
- 修复已知旧 miniapp 迁移 journal 非递增及已部署库兼容。按实际旧 SQL hash 区分已应用/跳过，补跑缺失事务，避免重复 CREATE/ALTER。
- 保存笔记仅附该回答实际 prepared context 的精确附件名称及存续说明，不导入原件；旧记录不推断此前附件。

## 实际验证

1. Server `tsc --noEmit` 通过（最终模型/范围字段已加入）。新增源码 scoped oxlint 通过；`git diff --check` 通过。
2. `vitest run src/test/chat-attachments.test.ts src/db/schema-parity.test.ts src/db/migrations.test.ts src/db/migration-journal-upgrade.test.ts`：4 文件 46 测试通过。覆盖实际 HTTP/数据库/存储、有效/损坏/扫描/动画/UTF-8/解压、预算、原件缺失、lease/过期/取消迟到、存笔记、协议历史、selected history prefix、GC 重试。
3. 真实无限 CPU Worker 先通知已启动循环，父线程仍响应，超时后 threadId=-1；不是 Promise.race 模拟终止。
4. SQLite 升级测试用正式旧迁移造出三种旧数据库：已应用旧非递增迁移、被跳过、被跳过且更晚迁移已安装；各独立进程调用两次 runMigrations，正式表齐全、journal 唯一，无重复 DDL。
5. `vite build` 通过。产物的真正 Node Worker 分别准备 UTF-8 文本、PDF 文字与静态 WebP 成功，无 tsx/全应用图依赖。
6. Vite dev 真 HTTP :3007 验证：启动、统一 admin@example.com 账号登录、创建会话、WebP 准备 ready、受保护原件 200、删除会话成功。新增 optimizeDeps.exclude/ssr.external 排除 canvas 原生二进制，避免浏览器优化器误读 `.node`。已停止 smoke server，临时数据由脚本清理。

## 验证边界

- 本所有者未运行 live PostgreSQL。主会话末轮使用隔离 PostgreSQL 16.15 / vector 0.8.1 / pg_trgm 1.6 测试库，附件、模型、流、Agent 与 schema parity 6 文件84/84通过；数量断言对 PostgreSQL bigint 字符串显式转 Number。未触及真实数据库。
- 不将本结果当真实模型供应商调用、全产品 GUI 或全仓检查证明。模型窗口/视觉、无 KB 附件问答、AG-UI stream/history、队列 UI 与 Agent 守卫分别由其他拥有者和主会话验收。
- V8 heap 限制不等于 native canvas 内存硬限制；输入大小和图像尺寸先验、解压实际计数、最多两 worker 和终止共同约束。无 OCR/音视频/Office 版式还原。
- Server Vitest 的 globalSetup 共享 `data/.test`，并行运行多个进程会删除彼此文件。一次出现过此类中途原件丢失；串行最终 46/46 通过。

## 独立检查修复

- assistant-stream/非流式 ask 在回答持久化时记录实际 prepared refs（现有 message_attachments），保存笔记仅读回答自身关联。公开历史仍只恢复 user 上传卡，避免 assistant 重复卡；不新增分支 schema。
- GC 与续租/绑定在同一会话串行，候选行锁内重新校验状态/期限。真实查询结果边界插入续租并释放，证明过期候选不会删除已延长寿命的资源。
- .ts 文件的原生 video/mp2t MIME 歧义仅对 TypeScript 扩展放行，仍执行全字节严格 UTF-8/控制字符验证；真实传输流与伪 JS MIME 拒绝。
- 真实 SSE/model HTTP 回归验证原附件问答保存具有正确来源，historyMessageIds=[] 的新分支既不向模型发送旧附件，也不在保存笔记时列出旧附件。
- 本次最终：`vitest run src/test/chat-attachments.test.ts src/test/chat-model-selection.test.ts src/test/chat-stream.test.ts --maxWorkers=1` 三文件 33/33 通过，server `tsc --noEmit`、7 文件 oxlint/oxfmt check、`git diff --check` 通过。
