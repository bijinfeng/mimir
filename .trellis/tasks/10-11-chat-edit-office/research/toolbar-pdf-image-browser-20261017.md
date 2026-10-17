# PDF 图片生产浏览器验收

2026-10-17 root，localhost5180 生命周期生产构建（后续 T/R1/Manage 修改未计入此构建），文档 I56PIa071_MpP1ts。浏览器正常 chooser 上传已授权合成240×160 PNG，未调用图片 provider。

- 420×500 实际上传预览长中文文件名；Inspector x100/y156/w320/h317.359，页面宽420。固定插入按钮 x116/y425.359/w288/h32/bottom457.359，内部滚到参数后仍可达。
- 插入 x150/y180/w120/h80 pt、文字下方，真实执行后图片数1→2，保存成功。native `/tmp/mimir-pdf-images-browser-insert-20261017.pdf`3836B：120 0 0 80 150 390矩阵，原文字与原图片290B保留，MediaBox500×650不变。
- 选择新增图片→向右90°→不透明度37%→裁切左10/上15/右5/下20，保存3048B。native `/tmp/mimir-pdf-images-browser-final-20261017.pdf`：实际0 -78 68 0 178 472矩阵，ExtGState CA/ca .37，新增图片579B、原图片290B，原文字保留。面板显示x178/y178/w68/h78，与旋转后80×120框按边裁切一致。
- 4步Undo→save：`/tmp/mimir-pdf-images-browser-undo-20261017.pdf`2207B与原baseline wholefile cmp完全相同。4步Redo→save：`/tmp/mimir-pdf-images-browser-redo-20261017.pdf`与首次最终3048B wholefile cmp完全相同。重开后画布正常、无dirty。
- 服务端原件读取用于native复核，非浏览器下载声明。搜索/生成无配置门控、9项已有操作列表与Escape回焦沿同日预验收报告；本轮未虚称真实provider或另执行替换/翻转/去背景/删除。
- 截图目录 `/Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51`：`pdf-image-final-upload-420.png`、`pdf-image-final-reopen-1280.png`。

此项不等于全工具完成；E/P/S/R2与其他验收仍开放。
