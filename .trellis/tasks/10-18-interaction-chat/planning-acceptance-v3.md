# 第七模块 v3 规划交付验收

本版按用户最新要求，对话内直接采用完整assistant-ui官方Thread和默认CSS；不再延用v2的局部替换/主题映射。用户已同意一并规划标准聊天附件，独立10-19-chat-attachments子任务与本稿共同审阅。父子任务保持planning，产品实施尚未批准。

## 目标与具体范围

- 完整官方欢迎、Composer、消息、Markdown/代码、真实reasoning/tool-call、图片/文件/附件、默认动作与错误；无自定义components/part/data/tool renderer，无源码/字体/主题/间距/颜色覆盖，默认英文原样保留。
- 所有proposed移除自定义mimir.trace，保留真实协议parts。引用、保存笔记、范围/模型/强度、显式队列、分类恢复与文档Agent守卫在Thread外宿主保留，不另画第二份消息流。
- 71组379原来源状态有唯一责任分类：official71、host-external179、boundary122、removed7。新增附件24态独立统计，总72组403路径。映射数不等于GUI测试次数。
- 标准附件拟支持文本/代码、现代Office、PDF文字层及PNG/JPEG/静态WebP；每条4件/20MiB，文档10MiB/图片5MiB；不自动导入KB。具体容量、上下文、草稿TTL、已发随会话及仅附件默认提问都在ATT-001.policy和子任务PRD明确，随本稿审批。
- 完整官方默认带来英文文案、布局和Copy/Export门控变化；图片/文件原件、代码复制失败、历史数据类型等差异据实际原件标记，不用自绘补丁掩盖。保存笔记仍是宿主成功非空正文动作。Agent/截图的通用Reload不等于缓存结果恢复。

## 验收与证据对应

- AC1/AC7：source inventory与逐状态映射报告、v3的coverage/scenes/checks对齐；删除态current继续留事实，proposed明确removed。源音频无有效payload仍是boundary，新独立WAV只是媒体演示。
- AC2/AC5：主会话代表GUI与原型操作见verification/v3/browser-qa.md。原型不是产品API/工具/存储验收；未执行原生IME/读屏/Electron或真实模型/Office写原件。
- AC3/AC6：固定assistant-ui a587b2838f2d644549d216098d54cfbeedfac522，35份原件、25运行闭包、MIT全文、实际依赖锁和单React解析见prototype/v3/provenance.json及runtime-resolution.json。完整Thread在独立document中隔离旧CSS，不给官方selector加前缀或注入Mimir token。
- AC4：v1/v2的57份旧资产与51产品hash核对见verification/v3/integrity.json。旧稿不重建、不覆盖；产品manifest/lock不变。
- AC8：子任务PRD/design/implement与真实spec/research上下文齐全；标准官方AttachmentAdapter仅内存fixture，上传/解析/取消/历史/生命周期真实服务待实施。document附件tile无下载，宿主承接读取/下载。

## 已验证的技术路径与实施验收边界

公开AssistantRuntime facade可在composer.send/thread.append前同步冻结，并透传threads.main/getById及唯一AGUI extras/queue/中断桥。产品SDK与新SDK各4项最小真实AGUI探针通过：独立队列快照、官方建议、拒绝保稿、异步附件前冻结、失败interrupt续传。见research/agui-official-thread-pre-send-seam.md；这是最小primitive宿主，非完整Thread产品端到端。

附件7组AGUI转换探针明确：图片必须绝对同源HTTP(S)URL，服务端canonical附件ID独立于UI序号，正式业务使用file/image资源ref，不能把文本fixture当产品上传。见research/chat-attachment-adapter-roundtrip.md。既有普通chat的无KB降级、上下文、历史/schema和多模态链需随子任务真实完成，不能只解除IMAGE_AGENT_REQUIRED。已发附件即使模型回答失败也随会话，1h回收仅无绑定无lease的失败准备/孤儿。

正式切换还需落实AGUI默认Edit/Reload的真实capability与安全动作，不能传不存在的reload:false、CSS隐藏或无差别重跑Agent。标准附件不授权文档Agent编辑，专用截图身份、单PNG、版本/轮次/未保存守卫不放宽。主/侧栏完整联调、HTTP/存储/模型/原生与全仓质量门留实施。

## 冻结记录

2026-10-19 冻结 `chat-review-v3`，版本清单见 [version.json](prototype/v3/version.json)。主 HTML SHA256 为 `2bfbfd2cd62fefca351297ec03d0d3bfde7f64e9eed123a7372e5ef0bcabd920`；独立官方 Thread HTML 为 `e49deaad771175b871bb4674a0def6bafd09c77c3359df7dab89e5357f442df2`。冻结后不覆盖，实质变更另存版本并重新审阅。

预览：[完整官方组件提案](http://127.0.0.1:5189/v3/review.html?mode=proposed#scene=CHAT-005.user)，页面支持当前/提案/对比模式。原71组379态与新增附件24态分开登记，共72组403条唯一路由，不能表述为403次GUI测试。

原型构建、严格类型检查、第一方lint（零警告）、14个第一方文件格式检查、产物与映射检查通过；主会话重新执行类型/lint/产物检查与`git diff --check`通过。独立源码报告 [independent-v3-review.md](research/independent-v3-review.md) 无剩余源码阻断。代表GUI抽验与截图见 [browser-qa.md](verification/v3/browser-qa.md)；原生文件选择事件超时，真实文件选择/上传尚未验证，附件状态使用本地fixture。产品质量门与真实服务不在本轮规划验收范围。

[integrity.json](verification/v3/integrity.json) 复核51份产品基线和57份v1/v2旧资产全部一致；产品manifest/lock未变。父子任务仍planning，等待用户认可这版具体HTML与附件方案，不start、不归档、不推送。规划资产交付通过不等于产品验收或实施授权。
