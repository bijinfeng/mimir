# 对话与生成交互设计（v5规划）

## 方向与基准

最新用户要求使用TanStack AI React与自定义组件替代assistant-ui，视觉使用现有Mimir设计，交互对齐冻结v4。该要求替代此前全官方渲染/默认样式及仅底部工具栏例外。v1–v4源码/HTML/hash保持不变。`apps/web/DESIGN.md`、renderer真实tokens与已批准基础组件是视觉依据；assistant-ui固定源码只读提供交互行为证据。AG-UI为数据/运行协议，不是视觉组件库。

## 架构与分工

- 客户端运行层拟采用`@tanstack/ai-react`的useChat与兼容ai-client，固定与服务端ai0.68.0兼容的确切版本。`@tanstack/ai-react@0.30.3` / `@tanstack/ai-client@0.39.2`为当前研究候选；不得使用宽范围误拉ai0.69依赖。最终研究与隔离探针是技术事实依据，见research/tanstack-v5-runtime.md。
- 自有UI层负责Thread/Message/Markdown/代码/Reasoning/Tool/Attachment/Media/Action/Composer及状态与键盘；从项目token消费浅深主题，不保留assistant-ui运行依赖或官方CSS。用户只改变视觉和渲染所有权，业务安全合同不变。
- AG-UI连接层负责接收RunAgentInput对应SSE、规范事件归约及Mimir事件sidecar。标准state/activity/raw等事件不保证useChat自动归约，必须按真实版本明确处理；事件处理器不能全部依靠unknown cast吞掉。
- Mimir业务层继续拥有检索范围/角色、真实会话ID、历史、队列、引用、存笔记及Agent执行/中断桥。迁移不直接套SDK默认queue：默认stop/error可能清队列，与Mimir只返还首项不等价。必须单一业务队列，避免双重派发。实际probe还证明SDK浅存body引用、getQueue不返回body，故发送记录须在任何await前deep-copy并冻结，恢复记录独立于SDK清队列。
- 附件子任务继续负责受保护临时资源、提取/模型输入、历史及寿命；自有附件组件与状态替代官方AttachmentAdapter/UI所有权。上传入口不可复用KB永久导入副作用。

## 数据流和动作合同

1. UI操作进入统一发送意图，所有新发送入口在任何await/附件准备前同步快照范围canonical documentId、deepReasoning与附件引用；Agent来源/页/版本/轮次/截图守卫只检查已有合同，不降级或隐式授权。
2. SDK stock SSE 已发送完整RunAgentInput（含forwardedProps及legacy data镜像），并非旧的messages/data二字段。保留metadata、引用、失败、conversationId及documentAgent事件，跨源显式credentials=include。TanStack续轮自动携带parentRunId，但现有document-Agent服务会拒绝此客户端字段：transport仅在该路由移除wire parentRunId，保留客户端内部关联，绝不放宽服务端claim/round/version/replay守卫。
3. SDK负责支持的text/thinking/tool等消息归约；sidecar负责未内置归约的标准事件及业务CUSTOM，不合成mimir.trace、不暴露分词/召回过程。每次run/step/message/tool使用真实ID和生命周期，不以视觉文案猜计时/完成状态。
4. cancel与error中止transport、保留部分回答；队列/草稿由Mimir取回规则处理，不让SDK清空业务队列。历史加载和真实ID建立不可重挂载正在运行的stream；文档助手关闭保活、切换按现行key契约。
5. Agent工具执行与续传不依赖UI折叠状态。已执行结果缓存后只续传不重做；resumeInterruptsUnsafe在HTTP失败可能fulfilled false，必须检查布尔值并保留缓存，不能仅依赖catch；round/version/documentId/来源失效拒迟到结果；AGUI interrupt/resume不等同新问题或任意tool approval。通用审批仅协议能力演示，不能绕过既有Agent守卫。
6. 程序快捷提问、队列、普通Send/Enter、只附件默认提问共用发送前守卫与快照；复用API避免派生两个roundId。已发送引用canonical附件ID不依赖UI消息ID，图片绝对同源受保护URL、file引用的wire合同不因新UI取消。

## HTML交付

`prototype/v5/review.html`保留原71组379来源态+24附件态，current列不变，proposed换自有组件并与v4逐项parity。新增`interactions.html`是独立的交互规范/验收页，共用v5组件与本地连接，提供分类、搜索、状态/动作、深链、事件序列/状态输出、失败/取消/恢复与版本适用范围。技术数据仅显示在此页或显式原型调试区，正常问答不混入协议细节。

详情目录依据`research/agui-v5-interaction-catalog.json`：core0.0.59为36事件、core1.0.0为31（前者含5个旧THINKING事件）；两版共同/新增字段如取消outcome、工具多媒体、resume.status分别标明。旧THINKING事件不是当前runtime原生处理，必须明确legacy inspector或显式normalizer；不能把列出事件当作已消费。纯数据同步事件可无独立常态UI，但必须有可观察状态演示。TanStack扩展和Mimir业务CUSTOM另列，不混称AGUI标准。附件、复制、导出、重试、动作菜单、滚动、焦点、IME等虽非协议事件仍在parity目录中。

所有真实模型/上传/提取/存储/Agent/原生操作均边界标明；HTML仅本地内存，不冒充真实业务。需实际TanStack useChat消费合法本地流，不能只贴runtime标识却沿用assistant-ui或全静态组件。额外协议能力展示不自动进入产品功能范围。

## 交互与视觉合同

以v4公开行为拓扑逐项比对：发送/Enter、Shift+Enter/组合输入、发送准备/取消/附件错误保留、忙碌排队、停止/重试、suggestion直接发送、用户原样文本、Markdown/代码copy反馈、思考/工具分组与展开、文件/图片/音视频、Copy/Export/Refresh/More能力门控、错误/空消息、滚动/贴底、菜单键盘和关闭回焦点。业务存笔记只针对最后成功非空回答；复制/导出与再生成不能误作真实保存或工具重执行。协议支持但Mimir未提供的后端能力仅演示或显式不可用。

视觉复用白灰/绿色现有世界、系统中文字体、6px控件、14px界面字号与reading角色，输入默认/hover/focus始终单层1px、无外扩阴影、不改变几何；语义错误/警告优先。浅深/390/主侧栏折行不隐藏附件/发送，键盘focus-visible保留，动作hover不推移内容。范围/强度/模型位于输入框内且遵循只读/单篇/侧栏标准合同。

## 兼容、风险与回滚

更换状态所有者比换皮影响更大，旧assistant-ui runtime facade不可直接移植成TanStack合同。真实请求体、状态/活动侧车、流顺序/终止、历史内容与附件ID、Agent中断、队列停止失败语义、原生IME和剪贴板都需产品阶段专项验证。v5隔离依赖与probe不改产品锁；不进行破坏性历史迁移。产品可按包/宿主接线逐步切换，保留无损回滚和旧会话数据。实质方案变化另存版本并重新评审，不修改已冻结HTML。

## 子任务依赖

附件子任务仍planning，技术所有权随v5迁移。父任务负责TanStack接线、自有组件和主/侧栏宿主；子任务负责真实附件服务、wire与寿命，两者发布/完整验收互相依赖。详情HTML是同一模块的可独立验收产物，不因树位置隐含批准新能力。本具体v5认可前两任务都不start。


### v5 续传与准备期补充合同

RUN_ERROR 可能清空 SDK lastResume；必须同时冻结原始 {threadId, runId} 与工具答复，失败后调用 resumeInterruptsUnsafe(responses, originalTarget)，检查布尔返回值，成功/明确取消/新轮次才清理；用第三次实际连接证明恢复，不以按钮反馈代替。附件准备完成只能清理本次捕获的附件 ID；若准备期间出现新草稿或新附件，必须保留，宿主状态同步也不能覆盖。REASONING_END 结束可见思考状态，不等待正文 RUN_FINISHED。
