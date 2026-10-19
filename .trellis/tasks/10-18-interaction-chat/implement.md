# 第七模块执行计划（v4）

用户已确认仅Composer底部三项控制的有限扩展。v4具体HTML仍需认可，父子任务保持planning。

## 当前阶段：规划与完整官方HTML

1. 记录用户最新全盘官方/无自定义组件/无样式覆盖要求。保留v1/v2/v3完整，不将其作为新实施标准。
2. 研究固定官方完整Thread及闭包、默认样式、依赖/许可/运行时兼容；对照71/379来源逐项分类official / host-external / removed / boundary，记录真实产品冲突，不静默删除业务能力。
3. prototype/v4独立生成：完整Thread仅派生工具栏最小挂载，无components/part/tool/data renderer覆盖，官方默认CSS。用独立文档隔离旧样式；scope/model/strength三项在Composer底部，save/citations/Agent等仍在Thread外应用宿主区，不冒称官方内置。fixture不执行业务。
4. 代表路径GUI、原型构建/类型/lint/first-party格式、来源/覆盖/许可/样式与依赖检查，独立复核。核对51产品hash及v1/v2/v3源码/HTML完全不变。
5. 冻结v4版本/hash，更新台账、限定提交和日志，交付完整对比稿。等待用户认可这个具体新版后再task.py start；现在不改产品。

## 认可后的实施顺序

1. 加载trellis-before-dev及Chat/Renderer/server/shared Agent规范，重新盘点工作树和来源清单，检查最新HTML批准范围。源码事实变化或业务迁移差异须先更新方案。
2. 固定完整官方源码/依赖/许可，以官方Thread加已批准工具栏挂载替换本地消息/Composer/Markdown/思考/工具/附件/动作/错误组件，删除失去用途的自绘渲染与样式。避免全局CSS/antd/Mimir token污染官方内部，不用选择器覆盖修补。
3. 先按research/agui-official-thread-pre-send-seam.md的公开runtime facade接通composer.send/thread.append及threads.main/getById，保留唯一AGUI所有权，复核异步附件/队列前同步冻结；现有AGUI默认onEdit/onReload须落实真实capability门控，不能依赖不存在的reload:false。仅在运行时/业务adapter接线：真实AG-UI数据、历史、发送/取消/安全重试、队列/附件能力；官方不支持的能力如实关闭，不能用自定义renderer伪造。最小SDK升级须保留本地中断补丁并回归。
4. 宿主业务保真：引用定位、只读模型/范围/强度/容量、笔记保存/复制检索资料、队列取回、截图校验、Agent媒体/部分草稿/回退等待互斥与失败留稿，路由及未保存守卫。行为差异与位置按具体v4呈现核对。
5. 移除自定义mimir.trace的UI挂载/消费/历史转接与server发送/新增生产链，盘点流式/非流式入口；shared及数据库旧字段保留兼容，不把trace映射为reasoning/tool。保留citations/failure/conversation/documentAgent事件及缓存结果安全重送。
6. 主/侧栏与全来源状态逐项实施映射，验证官方默认布局及实际容器、生命周期/动作能力、真实HTTP参数/错误恢复。若官方UI默认行为与源业务不等价，按已批准映射处理，不静默放宽。
7. 受影响包及全仓质量门、独立检查、真实GUI；限定提交与规范/日志更新，不混入其他会话。产品尚未通过前不声称任务完成。

## 验证与边界

- 原型：v4自己的build、独立tsconfig、direct oxlint/oxfmt（不改vendor原件）、artifact/来源/默认CSS完整性和task.py validate；不重建冻结v1/v2/v3。
- 未来产品：Chat/Renderer测试和类型；server流事件/检索/历史相关测试、shared类型；pnpm check及AG-UI/Agent/队列真实参数与可控异步回归。
- 源码/构建检查不代替GUI；HTML fixture不代替真实API、Agent写原件、原生剪贴板/文件/媒体/PNG/IME/读屏/Electron。

## 风险与回滚

预计产品范围为packages/chat渲染/样式/runtime、renderer Chat宿主、server trace链与shared兼容类型；不改Office内部工具栏或业务写原件算法。UI按用户要求采用官方默认加三项控制扩展，不以此前Yuque对话样式为验收准绳；宿主业务安全不得因换UI降低。

v4规划用临时依赖、真实完整Thread闭包验证；产品react0.15.28与registry0.15.29等兼容差异在research中留证，未来升级只做必要最小范围。回滚不破坏旧会话数据，冻结稿始终本地保留；实质变更另存版本重审。

## 子任务依赖

- 10-19-chat-attachments与本任务同处planning；用户已同意一并规划。子任务负责真实上传/提取/模型输入/存储关联/过期清理及官方AttachmentAdapter，父任务负责完整Thread/宿主和统一HTML场景。
- 可以并行做原型与协议研究；产品切换/完整验收必须在子任务附件链路可用且队列/Agent发送前冻结接缝证明之后。不得用现有KB永久导入替代聊天附件，不得把完整官方默认+号选后unsupported当最终通过。
- 子任务具体设计和新附件场景一并纳入本版审阅；没有获得最新具体HTML认可前两任务都不start、不改产品。
