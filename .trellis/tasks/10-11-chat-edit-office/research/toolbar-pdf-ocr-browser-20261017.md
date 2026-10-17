# PDF 本地临时 OCR：生产浏览器验收

2026-10-17，root。固定生产预览 localhost:5180，统一测试账号。构建日志 `/tmp/mimir-toolbar-ocr-forms-crop-web-20261017.log` exit0，已包含独立检查七类修复；不代表后续 PDF 文字参数/图片面板/浮动表格已验收。

## 实际结果

文档 `q3ZBhBkllZBwhHyy`，原件 `/tmp/mimir-pdf-ocr-mixed-20261017.pdf`，30101 bytes：四页相同中英文字栅格、Rotate0/90/180/270及offset CropBox，第五页空白。

- 实际420×500，Inspector320px，主按钮 x116 y425.359 w288 h32，bottom457.359；完整范围Radio名称与独立选项正确。顺序扫描真实完成 **4页、跳过1页**，空白不再计成功。截图 `pdf-ocr-complete-420.jpg`。
- 实际本地WASM识别，无模型配置/付费服务。结果包括 `Mimir Office OCR 2026` 和 `第二行文字可复制与搜索`；第一行“扫描”误识为“扫摘”，UI有可能出错提示，不能宣称准确率满分。
- 纸面真实拖选→Cmd+C：整行剪贴板为 `Mimir Office OCR 2026\n`；反向片段为 `Office OCR `；跨行为 `Mimir Office OCR 2026\n第二行文字可复制与搜索\n`。DOM SVG selection.toString仍为逐字换行，实际clipboard走修正后的逻辑source偏移，已确认不再逐字断行。首次反向拖动在既有选区上未重新选区，先点空白清选区后真实反选成功，不将前次算产品缺陷。
- Escape退出纸面选字，真实activeElement回“识别扫描文字”。搜索 `OCR 2026` 实际1/4→2/4→3/4→4/4，对应四种原件Rotate；270度页面滚动到文字区后橙色框与原文对齐，截图 `pdf-ocr-search-rotate270-1280.jpg`。180度截图另存。初次270截图在页面上方空白，已用滚到真实文字后的截图覆盖。
- 第一次试图停止时四页已完成，未据超时称失败或停止成功。清除后在同次真实交互中开始→停止，UI明确“已停止”，无临时结果、可再次开始。
- 再识别当前第4页等待“在页面上选字”可见后reload；重新打开OCR显示当前第1页尚无临时识别文字，结果随会话销毁。
- 全程保存/Undo/Redo禁用；KB原有“无可提取文字”提示保持。通过原件只读HTTP读取再SHA256比较，前后与夹具严格相同：`ec4b70529b8b979a5eab6fed8493c97eec96652c4ba644c4b714b45bd9999091`。后文件 `/tmp/mimir-pdf-ocr-browser-after-20261017.pdf`。没有入库OCR或索引写请求。

截图目录 `/Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51`。没有Desktop/真实provider验收。独立39/39与assets/native入口门禁见 `pdf-local-ocr-independent-check-20261017.md`；root统一全Office首轮有旧mock/copy断言失败，正在修复，不能将首轮称全绿。
