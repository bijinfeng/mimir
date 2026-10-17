# DOCX 标题大纲：浏览器与原生保存验收

2026-10-17，root，localhost5180 最终生产构建。测试账号 admin@example.com；仅代码与浏览器，Desktop 用户自验，无真实模型调用。

## 范围

沿 docx-outline-plan-20261017.md / implementation / check。主参考 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`，WeKnora v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24` 的证据沿既有研究，仅能力门控适用，非 Office 外观模板。本次为本地验收，不声称运行上游 GUI。

fixture `/tmp/mimir-docx-outline-browser-20261017.docx`，知识库 `3zoaxLZqZHIo3Jck`，含1–9级、粗体/颜色/链接/双空格、重复/空标题、编号5、headingOutlineOff、显式outline。未保存到库，保留测试件。

## 真实 UI / 原生结果

1. 第一富标题1→9，真实导出下载原为 document-copy (12).docx，固定证据 `/tmp/mimir-docx-outline-browser-level9-20261017.docx`。原生 pStyle Heading9，文字“重复  中文 Link”、粗体/色彩/链接保持；仅 word/document.xml 改变。
2. 一次撤销后真实导出，固定证据 `/tmp/mimir-docx-outline-browser-undo-20261017.docx`，全部6个非目录ZIP部件与上传原件精确相同。
3. 显式outline2→3，真实导出 `/tmp/mimir-docx-outline-browser-explicit3-20261017.docx`。原生 outlineLvl=2（零基，即3级）、斜体保留，仅 document.xml 改变。
4. 1280×720及实际420×500检查。窄屏Inspector320×317.36，body可内部滚动（219/866），固定primary y437.36–461.36，长九级标题换行且缩进封顶；正文9个普通段落均保留，唯一contenteditable=true为主编辑器。
5. 下拉Escape第一次只关popup，第二次关闭Inspector并聚焦文档导航。窄屏“编辑标题”关闭覆盖侧栏，focus留唯一ProseMirror；实际End+“ QA”改首标题，富marks与正文保留，Undo恢复。
6. 编号标题显示当前2级，层级禁用原因“编号标题请通过列表与样式工具调整层级”，原位编辑可用。未把它转换成普通heading，也未隐藏正文。
7. 首轮主动作出现重复“应用层级应用标题层级”，独立checker修掉共享primary的重复children。最终构建宽/420实查label/textContent均只有“应用标题层级”；Escape回焦文档导航，主编辑器仍唯一。

## 回归与失败记录

独立初检7文件101/101；按钮6/6；完整回归曾1839/1842，三个失败逐项处理：一个新label断言/旧生产加载时序，两项真实列表保存链冲突。outline hook错误接管heading→list，修为涉及docListItem由原列表保存计划负责，5文件51/51，保留原等待预算且加入保存后类型/编号/styleId与history精确检查。

最终全Office **177文件1844/1844 exit0**，`/tmp/mimir-office-full-toolbar-ui-final-20261017.log`；最终Web build exit0，`/tmp/mimir-toolbar-browser-ui-final-web-20261017.log`。目标types/static见check报告。全仓480既有技能lint基线不因此清零。

## 证据与边界

截图目录 `/Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51`：`docx-outline-confirmed-wide.jpg`、`docx-outline-confirmed-420.jpg`。

这是一片安全标题层级与原位文字编辑；不含章节树重排、复杂编号改级、CSS隐藏正文的大纲模式，也不代表保护P1完成。整体task保持in_progress。
