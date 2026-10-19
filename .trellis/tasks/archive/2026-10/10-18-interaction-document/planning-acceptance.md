# 第六模块 HTML 规划交付

状态：规划，待用户认可具体冻结 HTML 后实施产品。此文件仅记录规划交付，不表示产品验收或全仓门通过。

## 交付范围

- 78组/422个设计枚举：文档入口/读写状态、标题、大纲/引用、标签/目录/AI整理、来源与反链、媒体及Office宿主、助手交接、命令、未保存保护、浅深/窄屏/长内容/键盘。
- 独立 [HTML](prototype/review.html)，可切当前/打磨后/前后对比、桌面/390px/中栏/低高度、浅深、200%字体、减少动效及适应窗口。异步结果用画布外明确模拟控制，不读写真实资料。
- WeKnora 官网v0.8.3和main固定快照、Obsidian官方帮助固定版本证据已保存；应用性与403采证边界见研究报告。
- 完整研究与盘点、设计/执行计划、9条implement/check上下文均已落盘。

## 质量证据

独立审查见 [planning-review.md](verification/planning-review.md)，机械清单见 [inventory-check.json](verification/inventory-check.json)，原型静态路由及29类渲染机制校验见 [checks.json](prototype/checks.json)。数量不是422次GUI实测。

主会话17条浏览器代表路径及修正确认见 [browser-qa.md](verification/browser-qa.md) 和 JSON。桌面浅深/390px/低高度、标题恢复、目录/标签、引用、原件宿主、助手和长大纲已抽验。真实产品基线24个相关文件哈希保持不变，产品代码无本轮改动。

限定原型typecheck、oxlint、format、build、artifact及任务上下文验证全部通过，已冻结document-review-v1。此轮纯规划不重跑产品全仓测试；前模块记录的范围外全仓阻断仍保留。

## 用户审阅与实施边界

具体版本和SHA256记录在 [version.json](prototype/version.json) 及父任务审批台账。用户尚未批准本模块实施；不task.py start，不归档，不推送。

原生媒体/下载/剪贴板/系统IME/读屏/Electron及业务保存、AI执行需实施后验证。Office内部工具条与完整对话另模块；“共享文档流程”指不同格式共用的阅读宿主，不引入公开分享/协作。浏览器Back与原生退出只如实记录边界，不新增全局router blocker。

冻结HTML SHA256：`2a3aafb4277c37bd06e38ae94ecec085e0f31a062b88e25a000042e5cbdb220d`。预览：http://127.0.0.1:5187/review.html 。
