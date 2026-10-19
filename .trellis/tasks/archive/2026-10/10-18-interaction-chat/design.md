# 对话与生成交互设计（v7规划）

## 方向与基准

最新用户要求使用TanStack AI React与自定义组件替代assistant-ui，视觉使用现有Mimir设计，交互对齐冻结v4。该要求替代此前全官方渲染/默认样式及仅底部工具栏例外。v1–v6源码/HTML/hash保持不变。`apps/web/DESIGN.md`、renderer真实tokens与已批准基础组件是视觉依据；assistant-ui固定源码只读提供交互行为证据。AG-UI为数据/运行协议，不是视觉组件库。

## 架构与分工

- 客户端运行层拟采用`@tanstack/ai-react`的useChat与兼容ai-client，按用户最新要求采用已核验稳定版：`@tanstack/ai@0.69.0`、`@tanstack/ai-client@0.39.3`、`@tanstack/ai-react@0.30.4`，正式产品适配器一并更新`@tanstack/ai-openai@0.30.0`。这是对旧ai0.68兼容固定策略的明确修订；先在独立v7依赖环境验证，产品实施时联动server/provider/renderer及锁文件，不能将新client直接接旧server视为兼容已证。版本与迁移证据见research/tanstack-latest-upgrade.md；旧行为探针作为历史基线继续保留。
- 自有UI层负责Thread/Message/Markdown/代码/Reasoning/Tool/Attachment/Media/Action/Composer及状态与键盘；从项目token消费浅深主题，不保留assistant-ui运行依赖或官方CSS。v5改变视觉和渲染所有权；v6另明确修改模型选择及推理等级合同，既有Agent/附件安全守卫不变。
- AG-UI连接层负责接收RunAgentInput对应SSE、规范事件归约及Mimir事件sidecar。标准state/activity/raw等事件不保证useChat自动归约，必须按真实版本明确处理；事件处理器不能全部依靠unknown cast吞掉。
- Mimir业务层继续拥有检索范围/模型选择/能力等级、真实会话ID、历史、队列、引用、存笔记及Agent执行/中断桥。迁移不直接套SDK默认queue：默认stop/error可能清队列，与Mimir只返还首项不等价。必须单一业务队列，避免双重派发。实际probe还证明SDK浅存body引用、getQueue不返回body，故发送记录须在任何await前deep-copy并冻结，恢复记录独立于SDK清队列。
- 附件子任务继续负责受保护临时资源、提取/模型输入、历史及寿命；自有附件组件与状态替代官方AttachmentAdapter/UI所有权。上传入口不可复用KB永久导入副作用。

## 数据流和动作合同

1. UI操作进入统一发送意图，所有新发送入口在任何await/附件准备前同步快照范围canonical documentId、providerId/modelId、reasoning effort与附件引用；Agent来源/页/版本/轮次/截图守卫只检查已有合同，不降级或隐式授权。
2. SDK stock SSE 已发送完整RunAgentInput（含forwardedProps及legacy data镜像），并非旧的messages/data二字段。保留metadata、引用、失败、conversationId及documentAgent事件，跨源显式credentials=include。TanStack续轮自动携带parentRunId，但现有document-Agent服务会拒绝此客户端字段：transport仅在该路由移除wire parentRunId，保留客户端内部关联，绝不放宽服务端claim/round/version/replay守卫。
3. SDK负责支持的text/thinking/tool等消息归约；sidecar负责未内置归约的标准事件及业务CUSTOM，不合成mimir.trace、不暴露分词/召回过程。每次run/step/message/tool使用真实ID和生命周期，不以视觉文案猜计时/完成状态。
4. cancel与error中止transport、保留部分回答；队列/草稿由Mimir取回规则处理，不让SDK清空业务队列。历史加载和真实ID建立不可重挂载正在运行的stream；文档助手关闭保活、切换按现行key契约。
5. Agent工具执行与续传不依赖UI折叠状态。已执行结果缓存后只续传不重做；resumeInterruptsUnsafe在HTTP失败可能fulfilled false，必须检查布尔值并保留缓存，不能仅依赖catch；round/version/documentId/来源失效拒迟到结果；AGUI interrupt/resume不等同新问题或任意tool approval。通用审批仅协议能力演示，不能绕过既有Agent守卫。
6. 程序快捷提问、队列、普通Send/Enter、只附件默认提问共用发送前守卫与快照；复用API避免派生两个roundId。已发送引用canonical附件ID不依赖UI消息ID，图片绝对同源受保护URL、file引用的wire合同不因新UI取消。

## HTML交付

`prototype/v7/review.html`保留原71组379来源态+24附件态，current列不变，proposed换自有组件并与v4逐项parity；UI-013/014按v6用户反馈显式修订。新增`interactions.html`是独立的交互规范/验收页，共用v7组件与本地连接，提供分类、搜索、状态/动作、深链、事件序列/状态输出、失败/取消/恢复与版本适用范围。技术数据仅显示在此页或显式原型调试区，正常问答不混入协议细节。

详情目录依据`research/agui-v6-interaction-catalog.json`（v5协议证据继承，UI-013/014按最新反馈修订）：core0.0.59为36事件、core1.0.0为31（前者含5个旧THINKING事件）；两版共同/新增字段如取消outcome、工具多媒体、resume.status分别标明。旧THINKING事件不是当前runtime原生处理，必须明确legacy inspector或显式normalizer；不能把列出事件当作已消费。纯数据同步事件可无独立常态UI，但必须有可观察状态演示。TanStack扩展和Mimir业务CUSTOM另列，不混称AGUI标准。附件、复制、导出、重试、动作菜单、滚动、焦点、IME等虽非协议事件仍在parity目录中。

所有真实模型/上传/提取/存储/Agent/原生操作均边界标明；HTML仅本地内存，不冒充真实业务。需实际TanStack useChat消费合法本地流，不能只贴runtime标识却沿用assistant-ui或全静态组件。额外协议能力展示不自动进入产品功能范围。

## 交互与视觉合同

以v4公开行为拓扑逐项比对：发送/Enter、Shift+Enter/组合输入、发送准备/取消/附件错误保留、忙碌排队、停止/重试、suggestion直接发送、用户原样文本、Markdown/代码copy反馈、思考/工具分组与展开、文件/图片/音视频、Copy/Export/Refresh/More能力门控、错误/空消息、滚动/贴底、菜单键盘和关闭回焦点。业务存笔记只针对最后成功非空回答；复制/导出与再生成不能误作真实保存或工具重执行。协议支持但Mimir未提供的后端能力仅演示或显式不可用。

视觉复用白灰/绿色现有世界、系统中文字体、6px控件、14px界面字号与reading角色，输入默认/hover/focus始终单层1px、无外扩阴影、不改变几何；语义错误/警告优先。浅深/390/主侧栏折行不隐藏附件/发送，键盘focus-visible保留，动作hover不推移内容。范围/强度/模型位于输入框内；模型按供应商实例分组可选择，推理等级跟随模型能力，范围仍为单篇/全部。v5的只读绑定、两角色与侧栏强制标准在新目标中已废止。

## 兼容、风险与回滚

更换状态所有者比换皮影响更大，旧assistant-ui runtime facade不可直接移植成TanStack合同。真实请求体、状态/活动侧车、流顺序/终止、历史内容与附件ID、Agent中断、队列停止失败语义、原生IME和剪贴板都需产品阶段专项验证。v5隔离依赖与probe不改产品锁；不进行破坏性历史迁移。产品可按包/宿主接线逐步切换，保留无损回滚和旧会话数据。实质方案变化另存版本并重新评审，不修改已冻结HTML。

## 子任务依赖

附件子任务仍planning，技术所有权随TanStack方向迁移。父任务负责TanStack接线、自有组件和主/侧栏宿主；子任务负责真实附件服务、wire与寿命，两者发布/完整验收互相依赖。详情HTML是同一模块的可独立验收产物，不因树位置隐含批准新能力。本具体v7认可前两任务都不start。


### v5 续传与准备期补充合同

RUN_ERROR 可能清空 SDK lastResume；必须同时冻结原始 {threadId, runId} 与工具答复，失败后调用 resumeInterruptsUnsafe(responses, originalTarget)，检查布尔返回值，成功/明确取消/新轮次才清理；用第三次实际连接证明恢复，不以按钮反馈代替。附件准备完成只能清理本次捕获的附件 ID；若准备期间出现新草稿或新附件，必须保留，宿主状态同步也不能覆盖。REASONING_END 结束可见思考状态，不等待正文 RUN_FINISHED。

## v6 模型及推理能力合同

分组键为已配置providerId，分组标题为供应商实例名；模型键为(providerId,modelId)，不按模型名推断供应商。不引入前端持有密钥。推理能力以经过验证的模型/供应商配置为来源，目录仅展示chat用途且当前用户可用的模型，区分supported（有明确合法枚举及默认策略）、unsupported、unknown/loading/error。只提交该模型允许的原始枚举值，展示名不充当wire值；固定或二态能力按供应商真实参数建模，不统一伪造low/medium/high。

切换模型是一次原子状态更新：保留仍合法的等级，否则使用已声明默认策略；无可验证默认时使用供应商默认（不发送effort），不自动选中臆测等级。切换期间及能力未就绪不发送过期等级。排队/重试/取回记录携带完整模型身份及等级，不能因当前菜单变化而改写。仅快照值送往服务端，服务端重新核验该用户可用provider/model、用途与等级，不信任客户端能力声明。检索范围与Agent目标不因模型变化而替换；缺少视觉/工具等必要能力显式阻止相关任务，不静默降级。

现行shared请求deepReasoning、services/model角色工厂和流式/非流式assistant选择链需要联合迁移；具体源码证据及能力缺口见research/v6-model-capabilities.md。旧客户端兼容可在transport边界识别旧请求，仅旧请求保留旧角色路由；新请求不得把effort反推成chat/reasoning角色。产品规范在正式实施时与代码同批更新，此轮不更改现行产品规范。

## v7 依赖升级边界

v1–v6源码与HTML保持不变。新隔离环境真实安装最新版并生成锁、版本/许可与执行闭包证据；不假定SDK补丁版本无行为变化。普通流、AGUI1.0、状态/活动归约、发送快照、取消/队列、失败续轮与显式原目标缓存均回归。ai-openai跨多个小版本，需要检查factory/exports、chat/embed/summarize/image/transcription工厂、模型选项及OpenAI SDK行为；产品调用仍收敛到plugins/provider，其他AI包不因同属TanStack而无差别升级。

### 新官方推理API的使用边界

ai0.69.0新增ModelReasoning、supportedReasoningLevels、clampReasoningLevel与chat({reasoning})。正式迁移优先复用经核验的官方模型能力API，能力来源必须匹配所配置供应商、模型及实际适配器；不能把原生OpenAI/Azure模型目录套给任意兼容网关。现有openaiCompatible不自动具备官方推理参数映射，仍需在provider层适配并验证；unknown继续如实呈现。UI切换/服务校验不得依赖静默clamp将无效用户选择当作已支持，需按v6明确默认/继承策略处理。源码与探针证据见最新升级研究。
