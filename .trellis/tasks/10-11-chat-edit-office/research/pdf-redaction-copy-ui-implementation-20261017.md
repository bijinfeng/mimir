# PDF 涂黑副本 UI 实施记录

2026-10-17，UI生产冻结并交 root，待独立 checker 和真实应用浏览器。宿主报告见 `pdf-redaction-copy-host-implementation-20261017.md`；原研究及固定参考见 `pdf-redaction-copy-next-20261017.md`。本片不表示所有 PDF 工具补齐。

## 参考与边界

- 主参考固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`，`apps/pdf/src/renderer/App.tsx:3643–3683` 的先保存、显式涂黑副本语义，原生真移除由另一个宿主片负责。
- WeKnora v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24` 官网与公开源证据沿同任务研究记录；适用能力真实门控，不提供 PDF 原生涂黑或 Office 工具栏依据。本片沿已核证据，未重新抓取官网。
- UI仅经 `hostLocal({operation:{op:'redact_copy',regions}})` 下载输出副本。不调用公开 Agent 工具、工作字节 publish、io.save 或 markSaved，不推进 dirty/version/history。

## 文件

- 修改 `packages/office/src/editors/PdfEditor.tsx`：编辑分类具名涂黑入口、现有 Inspector/工具互斥、干净且无待提交稿门控、绘图 overlay 槽集成与取消登记。其他工具开启会明确关闭涂黑状态，关闭后不会自动复活旧标记。
- 新增 `PdfRedactionCopy.tsx`：专用 hook、临时多页标记、真实 viewport 加载、指针 overlay、区域列表和固定单一导出动作。
- 新增 `pdf-redaction-copy.ts`：overlay bounds 标准化，PDF.js inverse viewport 转 user-space 矩形，正向 viewport 恢复标记位置。
- 新增局部 `pdf-redaction-copy.css` 与两个专项测试文件。

没有修改 shared/server/vendor 或已有 Agent 公开目录。未改全局 pointer 坐标。

## 生命周期与交互

- 入口仅允许已加载的原件/已保存工作副本、无页面/文字等 pending 修改且宿主就绪。存在修改时显示“请先保存或取消…”；进入后关闭其他 Inspector、插字和原文选择。
- 标记是临时状态，最多100个；当前页高亮所属区域，列表显示跨页归属，可逐项删除或清空。换页保留其他页标记并取消在途请求/手势；doc/bytes/layout/history identity 或工具开关变化清标记。
- viewport来自真实 PDF.js `getPage(...).getViewport({scale:1,rotation:absolute})`；不猜屏幕Y，支持0/90/180/270及offset CropBox。沿 PdfSheet 已完成渲染身份门槛挂 overlay。
- pointer capture、cancel/lost capture、Escape、非主指针和微小拖动均有分支；按实际 overlay box 标准化。Escape先取消拖动，再关闭工具。处理或导出开始会重新挂载 overlay 以清旧手势。
- 导出冻结 handle、version、identity、bytes、当前页和区域集合；ref防同帧双击。只接受同version、无工作bytes/info、唯一`document-redacted.pdf`、非空Uint8Array输出。核验后下载并给可见结果；Blob URL延迟回收。
- 失败保留标记及服务器原错误，支持重试。关闭、切工具、换页、源/版本变化、保存或其他内容操作取消旧请求；迟到成功不得下载。
- 实测发现快速只读宿主操作的busy true→false可被React合并，单靠effect不足以取消。现hook自己持controller，通过onRequest给Editor登记；既有save/applyPages/Agent内容及插字入口同步abort。自己的导出不经这些入口，不会取消自己。

## 验证

```sh
pnpm --filter @mimir/office exec vitest run src/editors/pdf-redaction-copy.test.ts src/editors/PdfEditor.redaction-copy.test.tsx src/editors/PdfEditor.drawing-canvas.test.tsx src/editors/PdfEditor.image-export.test.tsx src/editors/pdf-toolbar-render.test.tsx src/editors/pdf-pages.test.ts
```

**6文件89/89通过**，本片2文件21/21：

- 真实 PDF.js 四Rotate+offset CropBox矩形正反转换、反向拖动和overlay bounds裁切。
- 实际 PdfEditor 多页 pointer 标记、冻结真实user-space regions；源字节身份、dirty、version、保存与上下文保持（仅页导航变化）；可见导出结果。
- tiny/cancel/lost capture/错误pointer与Escape两步退出及编辑分类内live入口回焦。
- 宿主错误原文与重试、单项删除/清空、100预算和释放槽位。
- 同帧双击一次host；关闭/页/源/version/切工具取消并拒绝迟到输出；切回工具不恢复旧标记。
- 坏version、工作bytes、多outputs、错误文件名拒绝且保留标记；快速只读host操作同步取消旧导出。
- pending页面修改不能进入；保存后允许对实际新保存工作字节标记；真实canvas渲染未完成时不挂overlay。

5个TS/TSX目标 `oxlint`、6文件 `oxfmt --check`、`pnpm lint:styles`、`git diff --check`通过。Office `tsc --noEmit`最终exit0；并行PPTX图片扩展期间曾出现其临时类型错误，收尾复核已通过。

测试实际使用PDF.js viewport和PdfEditor，但渲染函数以受控promise模拟完成，host响应以契约mock检查；**不冒充真实canvas像素或原生真移除验收**。原生宿主另有真实PDFium、全对象/解压流/像素及route证据。root已上传4页夹具，文档`7wByk5tu1_660tNu`；本worker未上传或删除文件。

## 交 checker / root

- 独立checker重点核验跨tab回焦：当前PdfInspector可回当前live入口/当前折叠组；若涂黑期间切“开始”翻页再Escape，“编辑”的原触发器已卸载，需验证并必要时恢复编辑tab或其可见入口。现只声明编辑分类内回焦通过，已发给root，不暗称跨tab通过。
- root完成最终Web构建、宽/420 Inspector与真实canvas pointer、90°+offsetCrop、下载副本独立内容/图像检查；复杂结构错误保留宿主具体提示。
- 未跑fullOffice/Webbuild，无提交/暂存/归档/删除；生产冻结后所有权交root安排的drawing_check，不再并行抢改。
