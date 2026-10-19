# v2 浏览器代表路径验收

2026-10-19，主会话使用实际in-app browser检查。最终HTML SHA256 `6c18bbd2d936e7b706b7ed3375a6234b82670b961e6be10ba7b81eac306a3af8`。以下是代表场景抽验，71/379是来源映射而非GUI遍历次数；不证明真实模型或工具业务执行。

| 路径 | 观察结果 |
| --- | --- |
| CHAT-005.user 当前/提案 | 当前保留旧思考/工具统计；提案无trace块及统计，正文/引用/动作保留。最终版本reload后再次确认，截图06。 |
| CHAT-016 七个状态 | 逐一点击尚无trace/有trace运行中/手动开合/完成摘要/只检索/长步骤/无过程，提案均无自定义过程或计数。waiting由官方等待点呈现，其余有正文时无替代过程行。逐态结果见removed-states.json。 |
| CHAT-008.created 真实原型发送 | 填问题并发送，出现官方●；aria-label=Assistant is working，computed animation-name=pulse。没有检索行，截图03。 |
| CHAT-017.live | 官方Reasoning初始展开，手动折叠后模拟完成仍折叠，不被本地新状态机重置。 |
| CHAT-017.long | 官方reasoning-text高度256px，内容335px时内部auto滚动；深色/390/200%文本均无横溢，修正后trigger和正文都为28px；Space可折叠。截图02是早期验证，最终字号修正另有DOM确认。 |
| CHAT-020.running/complete/failed | Running/Used/Failed来自官方ToolFallback，展开能查看原始参数、结果及Error。最终失败示例是工具失败但助手最终回答正常完成，成功动作保留符合源码；移除重复自绘文档工具状态。截图05。 |
| CHAT-020.long 深色390 | 24条长filters、32条结果；窄列tool root269px，pre245px且scrollWidth=clientWidth；无页面横溢，官方换行保留全部数据。截图04。 |
| 生成中两条队列 + Escape停止 | Enter连续排队，停止仅首条返输入框，第二条仍在队列；无重复发送。 |
| HOST-018.escape 覆盖侧栏 | 打开模型菜单，第一次Escape只关菜单、侧栏保留；第二次关闭侧栏，焦点返回问AI入口，草稿/会话保活说明保留。 |
| CHAT-028.zero | 无正文断流仍显示重试/取回；取回后输入框含原问题，没有保存成功动作或trace。 |

最终产物reload后浏览器warning/error日志为空。最终截图[06-final-compare.png](06-final-compare.png)；其他截图只证明对应记录点，不冒充最终产品。最后变更只为单HTML内嵌MIT许可/格式，无UI行为改动。没有设置真实设备viewport override，无需清理；390测试为原型明确的逻辑画布宽度。主页面普通可用宽度下截图用于交付。

未测：379状态全量GUI、真实API、真实reasoning生成/工具调用、Agent写原件、原生剪贴板/媒体/文件选择、真实PNG、系统IME/读屏和Electron；本地原型fixture不证明这些能力成功。
