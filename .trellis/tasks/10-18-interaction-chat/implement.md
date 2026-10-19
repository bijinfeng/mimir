# 对话交互精修执行计划（v5规划）

## 当前阶段：研究和两个HTML

1. 固化最新自有UI+TanStack方向，保留v1–v4和产品基线；重写PRD，研究真实版本/协议/业务所有权，未解决用户决策前不实施。
2. 固定与server ai0.68兼容的React/client exact版本、AGUI两版本全事件和v4交互parity；研究请求体/历史/状态侧车/Agent interrupt/resume/队列/附件，用官方源码与隔离探针留证。检查WeKnora官网与公开源码作为知识库/Agent业务参考，主视觉仍项目DESIGN，交互基准为v4。
3. 仅prototype/v5出完整review及独立interactions HTML，运行路径使用真实TanStack useChat+本地可控流，自有组件消费项目视觉；不携带assistant-ui执行依赖。两页使用同一组件/connection；场景/协议映射逐项可定位。
4. 构建/类型/lint/格式/产物和覆盖核对；独立源码及事件/交互parity复核；主会话一次批量浏览器检查桌面/窄屏、事件回放、发送准备/取消、队列独立快照、菜单焦点及错误恢复，发现问题统一修复后有限确认。
5. 冻结两份HTML、catalog/parity、来源/许可/hash、代表截图及边界，父子task context validate、限定提交和日志；交付具体v5等用户认可，不task.py start、不改产品。

## 具体v5认可后的产品顺序

1. 读取trellis-before-dev与chat/renderer/server/shared/附件规范，重查产品差异，确认最新HTML范围和未验风险；需要实质业务变更先更新HTML。
2. exact依赖并最小接线TanStack，去除assistant-ui状态/渲染所有权，保留React单实例与真实AGUI RunAgentInput/forwardedProps、model/role、安全metadata和业务CUSTOM；禁止双runtime/双queue。
3. 先完成统一发送意图/异步前冻结、Abort、Mimir队列、history及ID建立，做真实HTTP/probe；保留stop/error取回首项、余项留队列，不沿用SDK默认丢弃行为。
4. 迁移Agent bridge，真实interrupt/resume/缓存结果续传、guard invalidation回归。UI tool approval不替换既有文档执行边界；已执行结果不重放；适配document-Agent wire parentRunId拒绝，检查resume返回false并保留缓存，禁止放宽服务端重放守卫。sidecar状态/activity/raw与reasoning生命周期按版本归约，旧THINKING明确legacy兼容边界。
5. 逐组件按v4交互parity实现自有消息/Markdown/代码/思考/工具/媒体/附件/输入/动作/错误，应用现有token和主侧栏布局；全部键盘/焦点/滚动/失败保留，不以不可用标记跳过原有能力。
6. 附件子任务真实服务接通：安全上传/提取、canonical IDs、受保护file/image、限额/寿命、历史/队列、Agent/只检索/视觉与专用截图排斥。不能直接复用KB永久导入。
7. 保留引用定位/存笔记/未保存/历史宿主，停止自定义mimir.trace生产/消费，旧数据无损兼容；shared/服务端与流式/非流式入口联动核验。
8. 真实主/侧栏和全来源状态逐项验收，受影响包及全仓质量门、独立check、GUI和原生边界测试；规范只按重要合同变化更新，按功能限定提交。不把HTML或隔离probe当产品通过。

## 验证与回滚

原型：自己的build、strict tsc、direct lint/format、artifact/协议枚举/parity/dependency closure/单React检查、两页浏览器抽验、产品和旧稿hash、父子task validate。冻结后不重建。

产品：chat/renderer/server/shared及附件层单测/类型、真实SSE和RunAgentInput协议往返、取消/中断/历史/队列可控异步与附件HTTP、pnpm check，以及模型/Office/原生功能实测。不会破坏性迁移历史；保持分层回滚和服务数据兼容，未验原生能力明确留档。

## 发布依赖

父任务与10-19-chat-attachments继续planning。父任务产品切换必须等待附件真实链和Agent/队列接缝验证；附件子任务依赖父任务新UI/发送合同。两个HTML均为本模块同一版交付，具体认可前两任务都不start。v4旧实现计划为历史，当前以上述v5为准。


### v5 续传与准备期补充合同

RUN_ERROR 可能清空 SDK lastResume；必须同时冻结原始 {threadId, runId} 与工具答复，失败后调用 resumeInterruptsUnsafe(responses, originalTarget)，检查布尔返回值，成功/明确取消/新轮次才清理；用第三次实际连接证明恢复，不以按钮反馈代替。附件准备完成只能清理本次捕获的附件 ID；若准备期间出现新草稿或新附件，必须保留，宿主状态同步也不能覆盖。REASONING_END 结束可见思考状态，不等待正文 RUN_FINISHED。
