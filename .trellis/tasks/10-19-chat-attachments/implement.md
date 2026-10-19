# 聊天临时附件执行计划（v6规划）

## 本轮规划交付

- 将用户纳入附件规划的决定及A1–A10/AA1–AA8收敛为PRD，补齐设计与真实spec/research上下文。
- 父任务v6共用TanStack useChat、本地流及自有附件准备状态；独立新增附件场景，不计入原71组379来源状态。
- 审阅格式/限额/默认提问/寿命与错误恢复，明确本地模拟和真实API/模型/原生边界；父子任务不start。
- 父任务冻结version/hash和独立复核/GUI记录，本子任务引用同一具体版本。限定提交与日志，无推送。认可最新具体方案后才实施。

## 认可后的执行顺序

1. 加载Chat/Server/Shared/Parser/Storage及Agent规范；重查工作树和批准版本。先验证TanStack/AG-UI入队和异步准备前同步冻结、唯一Agent bridge与自有Thread/Composer接线。
2. Shared定义附件资源/状态/错误、允许格式/预算及历史metadata；PG/SQLite同步迁移和类型，旧数据无附件兼容。
3. Server实现独立会话附件路由、鉴权/归属、bounded multipart、格式/容器/预算、activeStorage隔离key和纯解析；状态恢复/取消revision/TTL/孤儿清理先有测试。
4. 接通ensureConversation与自有附件状态/发送适配：真实选择/准备/发送/移除、Abort、错误移除重选、受控同源文件；使用Mimir tokens并保持v4交互，宿主承接业务说明与守卫。
5. 修正普通chat多模态/仅附件输入、无KB命中分流、系统上下文、真实模型视觉门控、服务端附件核验/绑定、usage记账与历史多轮。专用Agent路由/截图校验不旁路。
6. 队列冻结/lease、派发再验、停止/失败/取回保稿、缓存resume去重；历史刷新、附件来源/保存笔记、缺失原件与删会话存储清理。
7. 真实HTTP/存储/数据库/模型stub、可控异步与时钟测试；自有UI与v4交互parity浏览器抽验及父任务主/侧栏联调。相关包门与全仓门、独立检查、规范/日志和限定提交。

## 验证清单与风险文件

重点测试AA2–AA7的真实合同，不能只测试状态渲染。统一登录admin@example.com/12345678，不创建其他账号。multipart伪报、OOXML膨胀、扫描PDF、跨会话ID、移除迟到、GC与queue lease、服务重启、纯附件/无KB回答、实际reasoning模型无视觉、停止失败后保稿、删会话对象回收都需有回归证据。

高风险位置：assistant-stream.ts、retrieval-preparation.ts、conversations service/schema双数据库、runtime AG-UI/queue/agent/历史及现有中断补丁。parser cancellation不等于CPU已终止；原型file URL不等于产品AG-UI/provider全链通过。具体命令按实施时受影响包scripts执行，最终pnpm check与真实GUI。产品与旧稿本轮不动。
