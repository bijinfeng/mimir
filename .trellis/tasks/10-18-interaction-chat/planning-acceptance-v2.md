# 第七模块 v2 规划交付验收

用户明确要求完全删除自定义检索过程，仅用 AG-UI / assistant-ui 支持的消息交互。本版仍为独立HTML规划稿，未修改产品，任务保留planning，等待本具体版本认可后实施。

- 预览：http://127.0.0.1:5189/v2/review.html?mode=compare#scene=CHAT-005.user
- 本地：[review.html](prototype/v2/review.html)，冻结信息见[version.json](prototype/v2/version.json)。
- v1保留：[原HTML](prototype/review.html)，原SHA256 `70a18bd3622cb98ccde681c539c28336fd730f5e9b380e271109c67c34496f19`。

## 验收对应

- AC1 / AC6：71组379来源状态仍可定位。CHAT-016七态明确proposedStatus=removed；当前列留现行事实，提案无检索日志、轮次/工具计数、替代过程行；其余含trace的实时/历史消息同样移除。数量是来源映射，不是379次GUI测试。
- AC2：保留当前/提案/同宽对比、浅深/390/768、键盘、字体与异步模拟。主会话复验删除态、真实reasoning开合、长内容、工具状态与窄屏，证据见[浏览器记录](verification/v2/browser-qa.md)。
- AC3：固定assistant-ui提交a587b2838f2d644549d216098d54cfbeedfac522，官方源码原件+MIT许可+逐件hash见[provenance.json](prototype/v2/provenance.json)。真实external-store消息context经GroupedParts驱动官方Reasoning与ToolFallback，等待点为官方Thread分支摘录；没有trace到思考/工具的转换。WeKnora参考沿用固定v0.8.3证据，服从本次明确删除决定。
- AC4：原型构建/类型/lint/格式/来源与artifact映射检查、独立复核、51个产品hash与旧v1 hash核对记录于下方冻结结论。仓库依赖不变。
- AC5：保留代码复制失败、零内容连接失败恢复、历史标准重试、图片适配/错误、部分草稿/回退互斥等R7修正提案及原有业务守卫；不再保留v1的自定义检索手动开合设计。队列/Escape代码差异已独立复核，代表路径另有GUI证据。

## 版本和能力边界

官方组件原件基于react SDK 0.15.29，产品0.15.28缺少responseDeliveryStatus类型。原型运行/类型均使用临时隔离0.15.29，React/ReactDOM仍唯一项目实例。它验证本版原型闭包，不证明现有AG-UI/Agent全量兼容；未来实施纳入最小SDK升级与相关回归。官方英文组件文案原样保留，主题/字体映射单列，不手改第三方状态机。

本轮不跑产品全仓门、不改变前几轮外部阻断结论。模型、工具、写原件、剪贴板、文件选择、截图、原生IME/读屏和Electron为fixture或边界，真实验证留待认可后。用户知识库引用、范围、保存、队列与Office中断守卫保留；不凭空引入工具审批能力。

## 后续

按本版冻结HTML逐项实施，覆盖Chat、Renderer宿主、server trace生产链与shared兼容类型；旧数据库字段只兼容读取，不破坏性迁移、不转换为假reasoning。已保存来源研究、执行计划和官方闭包依赖锁；实质变动另存版本重审，不覆盖v1/v2。

## 冻结结论

- 最终SHA256：`6c18bbd2d936e7b706b7ed3375a6234b82670b961e6be10ba7b81eac306a3af8`。原型构建、TypeScript、oxlint、first-party oxfmt和artifact检查全部通过；主会话再次执行类型/lint/artifact/task validate通过。
- [独立复核](research/independent-v2-review.md)：PASS，无剩余源码/产物阻断；12官方原件逐字节hash与许可匹配，单HTML包含MIT全文，单React实例。
- [完整性记录](verification/v2/integrity.json)：51/51产品文件与冻结v1均不变；仓库依赖/lock无改动。
- [浏览器记录](verification/v2/browser-qa.md)：代表路径实测通过；最终reload当前含旧trace、提案无trace，warning/error日志为空。
- 本版仅规划交付通过，不等于产品验收或实施批准；task仍planning，不归档、不推送。
