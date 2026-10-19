# 对话与生成交互设计（v3规划）

> 2026-10-19 最新反馈：模型、思考强度和知识库范围须保留在输入框内。下方v3将三项放在Thread外的定位暂不作为最终方案；仅Composer工具栏有限组合的例外待用户确认，证据与具体建议见research/composer-controls-contract.md。v3冻结保留，无产品修改。

## 最终方向与来源

2026-10-19用户要求完整对话渲染全盘使用assistant-ui官方组件，不自定义组件/样式覆盖。v2仅替换Reasoning/ToolFallback、保留Mimir消息/输入/主题的方案不再满足要求。v1/v2冻结原件保持不变，v3独立生成，产品代码仍不改。

主依据为固定assistant-ui官方Thread及完整组件闭包和默认CSS。AG-UI提供事件/运行语义，不规定视觉；不得把CUSTOM mimir.trace伪装成官方思考或工具。WeKnora固定v0.8.3与公开源证据用于核查知识库/Agent合同，不复制其自绘过程卡。具体来源、许可、版本与能力边界见research/full-official-thread-contract.md；71组来源对应见research/full-official-feature-mapping.md。

## 渲染边界

1. 官方对话区：直接挂载完整Thread，不传components override，不注册自定义消息、part、data、tool renderer；Welcome/消息/Markdown/代码/思考/工具/附件/动作/错误/Composer均使用上游原件。不抽取少量primitive再拼装本地消息。不保留Mimir气泡、输入框、自定义检索过程、伪思考轮次与工具统计。
2. 官方样式：固定默认globals和registry所需CSS/依赖，原件字节保持；不改CSS选择器，不做前缀、不映射Mimir token，不改内部字号/颜色/边框/圆角/间距，不加覆盖规则。宿主只决定可用容器和普通布局。
3. 应用宿主：导航、文档画布、历史路由和业务操作不冒称官方组件。官方没有的引用定位、模型绑定/范围/强度、保存笔记、队列取回、截图/Agent执行及草稿/未保存守卫等在Thread外保留。不得为“全盘官方”静默删能力或绕过验证。最终具体位置以本次HTML再审。
4. 运行时：只有数据转换、真实能力adapter、onNew/onCancel/安全重试和宿主IO可以接线；不得通过渲染覆盖或CSS绕路。本地fixture明确模拟，不执行模型/工具/写原件。官方不支持的动作如实禁用/隐藏或留在宿主，不伪造成功。

## 必须保留的业务合同

- 模型两条绑定只读，管理模型导航设置；标准/深入只在主对话，文档侧栏有效值标准。官方Thread内不塞本地模型/范围控件。
- 队列/发送按现有运行时保真；停止/失败只返还首条，其他仍留队列。官方Composer支持情况据实际adapter验证，不能靠假按钮或额外自定义输入框声称兼容。Shift+Enter/IME按官方原件验收。
- 配额/超时/截断/离线保留已有安全恢复；未实现的充值/缩范围/继续生成等不凭空变成可用。历史重试标准与实际参数统一的提案继续留证。
- 截图的来源寿命/页/版本/视觉能力必须校验，不能静默降级或覆盖新草稿；截图不等于新增通用上传。
- Agent已执行后续传失败只重送缓存，不能重新执行；文档/轮次/版本变化拒迟到结果。官方retry/工具UI不代替本地document interrupt/resume桥，也不凭空加工具审批后端。
- 保存笔记只针对最后成功非空回答，互斥/失败重试/打开笔记保留。官方复制/重试等内置动作遵循其原有行为与runtime能力，不能为保持旧自绘门控去改官方件。
- 新建真实会话ID不重挂载流，切换历史按现行key契约重载；历史错误不是空会话。引用/模型设置/打开笔记守未保存离开；关闭助手保活已有Chat。

## 旧问题与方案变化

research/chat-package-inventory.json及chat-host-inventory记录当前事实：检索跟随run、历史强度提示偏差、sentHere、零part错误隐藏、代码复制失败静默、图片max-width320/无onError、草稿/回退缺pending门控。v1/v2为这些现象做过自绘提案；v3对话内以官方原件为准，不能一面保持复制/图片等自定义补丁，一面声称全盘官方。真正业务失败恢复与草稿守卫在宿主保留；差异须在来源映射明确。只检索发送documentId=null等现有业务参数不因换UI改掉。

## HTML结构与验证

评审外壳保留稳定场景ID、当前/提案/比较和尺寸切换。当前按源码及真实基线重建，不冒称全实拍。官方对话放在独立document/iframe避免legacy/antd样式串入，原型只隔离文档、不重写官方CSS；产品落地时再按实际路由/样式边界验证。内容使用相同本地fixture，只有真实消息part才出现对应官方UI。主题/缩放/减少动态使用官方支持的模式或评审容器的环境模拟，不改官方内部样式。

71/379全部保留来源追溯，标注official、host-external、removed、boundary（可组合）；不支持项不能通过仿画补齐，不把映射数量当GUI测试次数。固定来源/许可、依赖锁、原件hash与iframe实际运行有证据；独立复核后主会话抽验空态/发送/停止/真实reasoning/tool/长Markdown代码/附件/失败与宿主恢复、浅深/窄屏/键盘，冻结新版本。

51个产品基线与v1/v2 hash保护本轮不改产品/旧稿。真实API/模型/Agent/落库/剪贴板/文件媒体/PNG/原生IME读屏/Electron留待具体HTML认可后的实施验收。

## 实施兼容与回滚

完整Thread可能需要超出v2闭包的官方组件依赖；只在临时隔离环境安装并固定版本，不改产品manifest/lock。本地react SDK0.15.28与固定registry0.15.29已有responseDeliveryStatus差异，完整闭包还需实际类型/构建核对；未来最小升级不得丢AG-UI中断补丁，必须回归历史/队列/Agent安全。

获准后清理TraceDisclosure/parts/data-parts/runtime history与server trace发送/生产链、shared兼容使用点，旧数据库字段兼容不破坏迁移；保留引用/失败/会话及文档业务事件。官方渲染替换后移除相应自绘组件和样式，不能残留全局覆盖。回滚只限本轮产品变更，保留旧记录及冻结稿，不混入Office内部工具改造。

## 新增附件规划与依赖

用户已同意一并规划标准聊天附件能力，独立子任务10-19-chat-attachments负责服务端/共享协议/官方AttachmentAdapter和文件生命周期；父任务负责完整官方Thread及宿主布局，HTML附件场景由prototype/v3统一呈现。聊天附件不是KB永久导入，不直接复用有写documents/分块嵌入副作用的上传路径。父任务产品切换的发布依赖子任务真实附件能力及发送前Agent/队列冻结验证，不能带一个选后必报unsupported的默认+号声称完成。文件格式/容量/寿命建议经研究后写入子任务并随新版具体审批；当前只可明确模拟，无真实上传/模型/落库。

## 公开发送接缝的研究结论

已通过最小隔离探针验证公开AssistantRuntime facade：在composer.send和thread.append之前同步冻结，必须覆盖thread、threads.main及getById；保留原AGUI core/queue/extras与中断补丁唯一所有权。普通发送/两条队列、官方建议、拒绝保稿、异步附件前冻结及interrupt失败后重送在最小primitive宿主中有实证，详见research/agui-official-thread-pre-send-seam.md及probe结果。它证明具体技术路线，仍非完整Thread/产品Agent端到端验收。

现有AGUI hook本身默认提供onEdit/onReload，不能只写“不传回调”就声称产品已禁用；正式接入需通过真实capability facade/安全动作adapter或最小公开选项落实。无安全重试能力的Agent/截图保持官方禁用外观，禁止CSS藏按钮或无差别重跑。建议append拒绝的草稿generation竞争、全部新发送入口只冻结一次也列产品回归。
