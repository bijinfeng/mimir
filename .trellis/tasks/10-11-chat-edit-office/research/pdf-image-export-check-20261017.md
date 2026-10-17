# PDF 页面图像导出 · 独立复核 2026-10-17

## 边界与结论

复核根会话已 freeze 的 `pdf-render.ts`、`pdf-image-export.ts`、`PdfImageExportControls.tsx/css`、`PdfEditor.tsx` 导出接缝与三个新增测试。沿实际调用链检查范围解析→当前工作副本物化→pdf.js页面viewport→PNG→单页/ZIP→显式下载，以及源身份、取消、历史/dirty和共享缓存。未发现需修改的生产缺陷；仅补两项独立回归，不改生产界面或启动构建。

1. `PdfEditor` 导出身份包括documentId、当前工作字节、layout和historyVersion；物化前后另外复查真实handle/version/agent快照bytes/pages。已应用的文字/表单/绘图在currentBytes，pending页面几何沿`buildPdfWorkingCopy`进入临时输出，不保存原件、不制造历史。
2. 当前页/全部/自定义范围按显示页序去重排序，支持72/150/300dpi。尺寸来自原生viewport，不混入编辑器缩放或DPR；单页32MP、单边16384、总PNG128MiB有限制。完整批次成功后才返回输出，页失败或取消不提供半成品ZIP。
3. 控件以identity+config约束ready；文档变化/关闭abort旧controller并撤销预览URL。迟到请求finally只清自己的controller，不能清后继running。download再次检查ready/blocked/busy/liveIdentity。
4. 整批导出用`retainPdfImageExport`按字节引用计数持有解析缓存，不修改主画布retain集合。release幂等且只销毁不被viewer/其他导出持有的文档；activeRenders保护加载、绘制、PNG编码全过程，finally清canvas并收集待销毁task。

## Findings (fixed)

- `PdfEditor.image-export.test.tsx`：既有“源变化”实际覆盖内容旋转，未直接覆盖documentId变化和后继请求。新增真实换源方式：相同PDF原始字节、不同documentId，旧导出尚未完成即发起新导出；断言旧signal取消、迟到结果不创建URL、不清后继下载、无宿主save。
- `pdf-page-image.test.ts`：新增两个导出引用共同持有同份PDF、释放一份后继续复用解析；在异步PNG编码期间取消，验证迟到像素拒绝、canvas归零、最终一个release才销毁一次task。该项覆盖缓存生命周期与编码阶段取消的组合，不只模拟绘制promise。

## Findings (not fixed)

无生产缺陷遗留。浏览器实际PNG像素/下载、1280与420布局由根会话负责，本代理未重复视觉验收；Desktop用户自验，未运行真实模型。

## Verification

- 专项三个导出测试文件11/11（原9项+本轮2项）。相关7文件60/60：页面图像、范围/ZIP、真实Editor导出、既有render/pages/drawing-canvas/working-copy。`/tmp/mimir-pdf-image-export-check-tests.log`。
- Office TypeCheck通过：`/tmp/mimir-pdf-image-export-check-types.log`。
- 7文件oxlint无警告、8文件oxfmt、styles、Antd lint、diff通过：`/tmp/mimir-pdf-image-export-check-{lint,format,styles,antd}.log`。
- 未重跑全仓check；先前全仓实际阻断为480项bundled Impeccable技能脚本lint，不能由专项green推出全仓通过。

## 固定对标证据

本次重新核验GenOffice HEAD `480548fd55f1be3593ee0d8e316a734751d58309`。`apps/pdf/src/renderer/App.tsx:4760`的exportImages以当前/全部可见页和150/72 viewport生成PNG，清canvas后经Electron `window.pdfApi.exportImages`输出；`:6333`提供具名导出入口。Mimir沿原生PDF页面栅格化语义，用浏览器下载/ZIP和右Inspector替代原生桥，增加范围、dpi、取消/过期守卫，不直接复用Electron调用。

WeKnora按同任务已取得的HTTP200现场快照复核站点`/tmp/mimir-references-weknora-site.html`与v0.8.3 commit `3e22822c1d2397be730c458c7539d0eb8c113a24`的`/tmp/mimir-references-weknora-tools.go`：tools.go:18为search_knowledge、:34为read_file、:47–49为sandbox list/write/edit，未提供Office页面图像导出或PDF缓存生命周期合同，因此不作为本片文件编辑工具栏主模型。
