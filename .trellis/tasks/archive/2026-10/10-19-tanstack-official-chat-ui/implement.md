# 执行计划：官方 Headless UI

当前状态：实施与验收完成，准备限定提交并归档。用户于2026-10-19回复“可以”，批准最终规划摘要；已执行 task.py start。

## 1. 实施前基线

- [x] 读取PRD/design/研究、chat与renderer规范和最新工作树；确认前轮commit c497002与冻结v7。
- [x] 核对安装包仍为ai-react0.30.4（含/ui）和ai-client0.39.3；版本有变则先复核本计划API，不顺手升级依赖。
- [x] 记录产品主/侧栏外观基线；原型所有冻结文件不变。出现有意可见调整先做独立HTML对比等用户确认。
- [x] 使用trellis-implement子代理实现，明确chat文件所有权和共享工作树边界；主会话负责宿主协调、GUI与验收。实现与独立trellis-check不可同一代理自证。

## 2. 最小接线

- [x] 新增模块级官方createChatUI/contexts及widgets注册，单向依赖，使用真实官方props类型。
- [x] 同一useChat host接官方Provider/Chat；不把RuntimeView断言为host，不新增useChat实例或第二份messages。
- [x] 官方Messages与稳定Message/Part组合承担消息和内容组织；删除旧NativePart/keyedParts通用分派，保留业务sidecar与动作。
- [x] 官方Input注册原Composer；保留原send/queue/stop/prepare/lease/history实现及固定SSE URL。
- [x] TextPart接原CodeBlock，用户纯文本/思考结束/隐藏内容、媒体和结构化展示保持。
- [x] 连续工具分组基于官方selected parts；共享目录覆盖各格式、旧历史与未知工具；孤立结果显示，关联结果不重复，展开态不因每chunk重置。
- [x] 中断分工经源码澄清：SDK公开列表隐藏client-tool-execution，保留唯一原桥，不新增审批展示；缓存失败只重发结果。依据见design.md与独立复核。

## 3. 必要回归

所有新测试验证真实边界，不写仅镜像内部实现的测试。不mock掉真实TanStack hook/工厂再声称官方接入通过。

- [x] 真实HTTP/SSE：主视图与侧栏共用官方UI的消息/文本/思考/工具流；纯工具双轮保持各自来源/终态。
- [x] 同一消息多次chunk不重挂编辑框/展开工具/思考，正确处理REASONING_END、redacted及未知工具。
- [x] 连续工具单行分组、关联结果和孤立结果，tool ok:false/停止/失败状态及中断不重复执行。
- [x] 发送准备期间切模型/范围、生成中独立排队、正常自动出队、停止DOM默认动作保稿、失败/取消迟到结果。
- [x] 真实附件上传/准备/移除/历史/受保护原件；专用截图去重与目标版本guard。
- [x] 用户编辑/重新生成后当前可见分支canonical保存；Agent来源历史禁止泛化重试。
- [x] Agent缓存续传失败后重试只发缓存，返回false仍失败；目标/轮次/画布版本变化阻止迟到写入。

## 4. 质量门

- [x] `pnpm --filter @mimir/chat typecheck`、`pnpm --filter @mimir/chat test`。
- [x] `pnpm --filter @mimir/renderer typecheck`、相关host/设计守卫测试。
- [x] 目标源oxlint/oxfmt检查；不降低规则、不提高测试timeout、不修改冻结原型来过关。
- [x] `pnpm check`全仓通过；server使用共享data/.test，禁止与另一个server Vitest并发运行。
- [x] `pnpm --filter @mimir/web build`、`pnpm --filter @mimir/desktop build`；若源码范围真的触及server再补其构建/回归。
- [x] 独立trellis-check复核官方组件真实参与程度、重复状态/selector、循环依赖、业务guard与当前spec一致性。

## 5. 实际产品GUI与收尾

- [x] 统一账号admin@example.com/12345678，隔离fixture/数据，不把本地供应商当付费兼容认证。
- [x] GUI抽验：主对话浅深主题、桌面/600px/侧栏390px、模型和推理菜单与Escape焦点、代码复制。历史失败、范围控件及流式思考/工具展开持久性由本轮自动回归验证；没有全量GUI重演，见browser-qa.md。
- [x] GUI抽验：真实附件、图片预览/Escape回焦、原件链接、正常出队/停止保稿、保存、侧栏关闭重开草稿。分支编辑/canonical保存由自动回归验证；引用跳转没有本轮GUI重演，见browser-qa.md。
- [x] 与已批准v7及前轮产品截图核对几何/边框/hover稳定；记录有证据的通过与未验边界，不把来源状态总数当GUI通过数。
- [x] 仅同步官方UI所有权变化的现行规范，按任务限定提交，保留全部冻结HTML，记录commit/验收后归档与日志；不推送。

## 验收证据

详细结果见[验收记录](verification/acceptance.md)。Chat 87项、完整Renderer 581项及全仓检查通过；Web/Desktop构建通过。上述第3节覆盖包含本轮重新运行的既有回归，第5节明确区分GUI抽验与自动化证据，未声称所有协议状态均手动验收。

## 回滚点

接线先小步可类型检查，再迁移内容组件；中间态不交付。若官方selector默认行为不能保持业务，退回该步使用官方公开手动组合入口解决，不复制SDK源码或悄悄重做UI。公共接口/服务数据变化超过计划时先记录证据并复审范围。
