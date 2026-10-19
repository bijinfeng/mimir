# v7 浏览器抽验

2026-10-19，in-app browser，真实生成HTML。

- review.html?mode=proposed#scene=CHAT-012.menu：供应商分组菜单正常，选择模型B和高推理等级，发送本地问题并点击模拟完成，回答Markdown正常，模型/等级保留。
- 重置后回到模型A菜单，保存latest-sdk-demo.png；新版标签正确，布局与v6一致。
- interactions.html#UI-014：126项目录载入，共享iframe中的低/中/高菜单可见，中选中；能力实验入口与发送快照提示正常。
- 两页面未见控制台error。

截图：[模型菜单](latest-sdk-demo.png)。此为代表路径抽验；完整协议与运行时探针见runtime-checks.md。未执行403条GUI测试、真实供应商请求、原生IME/Electron或产品全仓检查。
