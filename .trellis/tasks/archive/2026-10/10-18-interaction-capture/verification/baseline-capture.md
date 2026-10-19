# 实际产品基线采样

2026-10-18，现有隔离QA页面 `http://127.0.0.1:5174/docs?scope=all&id=Y5sJ31WzhcQ7_GFg`，测试账号admin@example.com。通过实际侧栏「收集」入口查看，未提交任何抓取/上传请求，未修改文档。

- current-url-empty.png：540px收集弹窗，标题「收进知识库根」，双页签，网页链接/来源帮助，禁用抓取。
- current-url-valid.png：填写公开GitHub仓库URL，仅本地识别，呈现「识别为 GitHub 仓库 · 收集仓库信息和 README」，抓取可用。
- 非法URL实查：即时显示「请输入以 http:// 或 https:// 开头的链接」，抓取禁用。
- current-upload-empty.png：上传空态拖放区，50MB、Markdown笔记/其他原件提示，底部关闭。
- current-upload-narrow.png：390×844下上传空态，弹窗内容折行。

结束后关闭弹窗，视口覆盖reset。截图是当前外观的直接证据，其他错误/忙碌/结果来源于精确源码合同的复现，不冒充这些未执行的真实网络场景。
