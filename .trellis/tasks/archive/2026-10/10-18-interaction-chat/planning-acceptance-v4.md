# 第七模块 v4 规划交付验收

2026-10-19，用户确认仅输入框底部工具栏允许有限扩展，以保留模型、思考强度和知识库范围。v4 是该边界下的新 HTML 效果稿；确认扩展边界不等于认可尚未展示的具体效果或产品实施。父子任务保持 planning。

## 本版范围

- 三项控制均位于官方 Composer shell 内，外部重复控制移除；主对话标准/深入，文档侧栏显示禁用的标准状态。模型菜单仍为全局两角色绑定及管理入口；可见角色标签区分同名模型。范围仍是全部文档或单篇，不新增多选能力。
- 固定官方 Thread 原件完整保留，派生仅增加工具栏 import 和 shell 内一次挂载；原 ComposerAction、输入、附件、发送/停止与消息渲染不改。新增工具栏使用同 commit 的官方 Button/DropdownMenu 默认变体，样式只用于新增排布容器，不覆盖官方组件。
- 原71组379态、24新增附件态及403路由保留。其中44态另标 composerExtension；此标记覆盖v3将三项放在Thread外的位置约束，不冒称官方内置业务。详见 [覆盖修订](research/composer-v4-feature-mapping.md)。403不是GUI测试次数。
- 标准附件拟定格式、限额、默认提问、寿命及Agent/专用截图边界沿用附件子任务；模型/上传/解析/持久化/原生能力仍待产品实施，不用HTML模拟声称服务可用。

## 验收合同

- AC1/AC7/AC9：保留原来源/current投影及ID；三项位置、主侧栏限制、缺失/长名/同名/加载/失败/恢复/清除有可定位场景，映射准确。
- AC3/AC6/AC9：36份官方原件、默认CSS、独立文档隔离、许可与最小派生diff可核对；不注册自定义消息/part/data/tool renderer。自定义mimir.trace仍完全删除。
- AC2/AC5：浏览器代表路径验证官方菜单、发送/取消及业务状态，截图与边界单列；真实模型、上传、Office、IME、读屏、Electron、系统缩放与全仓门仍属于产品验收。
- AC4：51产品基线与125旧原型资产完整性核查，v1/v2/v3不重建、不覆盖；产品manifest/lock不变。
- AC8：附件子任务引用本具体v4方案，AttachmentAdapter仍为本地fixture。范围标题代真实documentId的原型局限须明确，不能冒称真实规范ID请求链。

## 技术边界

标准/深入仍是 deepReasoning 业务角色路由，不直接写 provider reasoningEffort；模型显示名不构成每请求 provider/model ID 的冻结合同。范围影响检索，不改变Agent执行文档目标或绕过来源/页/版本/轮次/视觉模型守卫。

正式产品沿用已研究公开runtime facade，在composer.send/thread.append之前冻结，覆盖threads.main/getById并保留唯一AGUI/队列/中断桥。原型的本地fixture验证与产品真实AGUI/HTTP/附件资源验证分开记录。

## 冻结与证据

规划交付核验通过，具体v4仍待用户认可。版本 `chat-review-v4`；[预览](http://127.0.0.1:5189/v4/review.html?mode=proposed#scene=CHAT-005.user)；冻结记录 `prototype/v4/version.json`。

- review SHA256：`72e2ca29620a90e6dc2a777a7621ddbda0511a79589423279378ef8c3c9128ce`；iframe：`5ed483d87152181feb52f39571ba1ea2fe375404ea9f7eb61b66a99a5ff0af7e`。
- 作者build、lint、17项首方格式及actual ExternalStoreRuntime探针3/3通过；主会话重跑严格tsc、check-artifact通过，父子任务context validate通过。
- 初始异步准备后重读选择的阻断已修复：public facade在composer.send/thread.append开始捕获scope/deep/kind，iframe控制事件先同步capture context，再通知宿主；onNew/enqueue/steer只消费message.runConfig快照。GUI实际验证发送准备中改变设置仍送原值、两条队列参数独立及取消保稿。
- [浏览器代表核验](verification/v4/browser-qa.md)与4张截图、[完整性记录](verification/v4/integrity.json)齐全；[独立源码复核](research/independent-v4-review.md)PASS，最终hash一致。实际执行vendor闭包25份，归档closure26份含原Thread，不混称执行。
- 51产品文件与125旧稿资产hash全部一致；36官方原件hash和最小派生diff通过。产品代码、manifest/lock、v1/v2/v3未改。
- 403路由是覆盖映射；真实服务/原生/产品全仓质量门不在本次HTML结果内。任务保持planning，不start、不归档、不推送。
