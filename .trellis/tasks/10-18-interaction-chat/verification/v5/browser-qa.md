# v5 浏览器代表路径验证

2026-10-19，IAB，127.0.0.1:5189。使用本地合成消息/文件，无登录、真实模型、上传、持久化或文档工具操作。该记录不是403路由或126目录项的全量GUI通过声明。

## 已实际操作

- CHAT-005.user：非空草稿打开全局模型只读菜单，没有提交或增加消息；Escape关闭，焦点返回模型触发器。
- ATT-001.send-pending：点击发送后原问题保留并出现Cancel；准备期间标准切深入、全部文档切单篇；完成准备后本地发送快照仍为点击时的全部文档/标准。
- 同场景生成中输入队列A，Enter入队；另输入草稿C后Cancel，停止生成，C和A队列均保留。Shift+Enter产生换行。
- AGUI-STATE-002：有效补丁真实onChunk归约为count2；找不到补丁目标变体保留count0并显示OPERATION_PATH_UNRESOLVABLE诊断。
- AGUI-MSG-001：system变体实际归约有system上下文，用户效果区不呈现system消息气泡。
- OFF-016 loaded：Enlarge image打开图片，焦点到Close image、body overflow hidden；Tab仍在关闭按钮；Escape关闭，焦点回Enlarge image、body滚动锁恢复。
- AGUI-HITL-004：允许→确认允许有二次确认；模拟失败返回false并保留缓存。首次发现失败后仅缓存答复不足以重建连接，已转修复并要求实际连接重试证据；最终确认补在下方。

## 验证类型与限制

协议probe的58组默认序列及89附加变体、运行时probe与artifact/source检查各自独立，不能作为全状态GUI执行数。组件状态入口与协议样本可操作，但如play-rejected注入、连续推理滚动、外层滚动测量尚不是逐项实测。真实API/Agent权限、媒体跨浏览器解码、原生选择器/剪贴板权限、系统输入法、读屏、Electron、浏览器200%缩放及OS减少动态留给获批后的产品实施验证。宽度/字体原型控制是布局模拟，不声称等价原生缩放。

## 最终确认

- 最新构建重新载入后，AGUI-HITL-004失败→关闭模拟失败→仅重送：出现真实归约成功回答、工具已完成、连接证据3次，重送入口禁用。隔离SDK probe另外断言两次续轮使用同一parent和同一答复，且只有1 user/1 tool-call。
- 最新构建ATT-001.send-pending：确认已有文件准备就绪后点发送；等待中输入新草稿C并添加第二文件；完成准备后用户消息只包含原问题及旧文件，C和新增文件仍在composer。一次最初点击发生在文件尚未就绪时得到保留稿件的错误，未将此拒绝当作准备完成通过。
- 截图desktop.png为完整桌面浅色；dark.png为相同场景深色；mobile.png是页面“查看尺寸390px”嵌入窄栏模拟；interactions.png为AGUI-TEXT-002播放完成详情。全部截图逐张打开检查，无空白加载状态。品牌修正后重捕同四文件。
- 浏览器viewport覆盖调用未改变实际innerWidth1280/innerHeight720，已reset；因此没有实际手机viewport验收，mobile命名仅沿用审查捕获位置，不代表设备实拍。窄栏截图中的线程自动贴底，用户消息上部可滚动查看。
- 未全量执行403路由和126项，不把目录数量作为全交互保真已验收；具体来源合同见research/v5-interaction-parity.md。
