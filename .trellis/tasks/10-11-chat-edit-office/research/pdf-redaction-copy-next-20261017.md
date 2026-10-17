# PDF 真涂黑副本：下一切片边界

2026-10-17，只读研究与实施建议，尚未实现/测试/浏览器验收。当前矩阵的 OCR、签名、真涂黑仍保留为缺口。

## 固定参考与证据

- 主要参考 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`，本地 `/tmp/mimir-genoffice-html-git`。`apps/pdf/src/renderer/App.tsx:3643–3683` 只接受显式确认的涂黑另存副本，存在其他待保存编辑先要求保存。`src/shared/ipc.ts:502–503` 说明 redactions 仅用于明确授权副本。
- 同版本 `apps/pdf/src/main/redaction.ts:305–410` 先预检全部区域，再创建 Redact 批注并调用 PDFium `_EPDFAnnot_ApplyRedaction` 真移除内容，最后给已经移除内容的页面添加黑色填充。选中共享图片、含图 Form、相交 Widget 会拒绝；相交普通批注连同其内容移除。不能以黑矩形覆盖代替。
- 上游 `tests/redaction.test.ts` 使用真实 PDFium，独立读取文字、扫描全部解压流/间接对象、检查图片像素，覆盖 ActualText 与批注内容消除。`redaction-harden.test.ts` 覆盖区域索引/边界/拖拽取消；现存上游测试是实施依据，不表示 Mimir 已通过。
- WeKnora 官网与公开源码沿用本任务已取得的 v0.8.3、`3e22822c1d2397be730c458c7539d0eb8c113a24` 证据：官网 HTTP200及缓存和 `internal/agent/tools/definitions.go` 的 sandbox capability 分隔见 `xlsx-structured-clipboard-plan-20261017.md` 与 `pptx-group-picture-next-20261017.md`。适用的是能力真实门控；它不提供 PDF 涂黑原生保存或 Office Ribbon 合同，不作为外观主参考。本片未重新抓取官网。

## Mimir 现状与建议

- Vendored `redaction.ts` 已包含上述实现，禁止修改 vendor。`pdf-agent-host.ts:302` 的 `assertSafeToRewrite` 只允许 Catalog Type/Pages，继续保留；不能为涂黑放宽全局签名、AcroForm、未知 Catalog 守卫。
- 建议最小路径是 **导出涂黑副本**，源知识库文件和当前工作历史不变。复用 `pdf-agent/local` 的鉴权、50MiB工作字节上传与 `outputs` 响应，新增 strict `redact_copy` 本地操作，但不加入公开 Agent 工具目录；输出名 `document-redacted.pdf`，不返回可发布的工作 `bytes`，版本不推进。复用 renderer `pdfLocal`/`hostLocal`，避免新建重复端点。
- 上游 saveDoc 经 `_PDFiumExt_SaveAsCopy`；不能只凭接口名认定旧内容不可恢复。必须在真实输出上独立检查全部对象/解压流/原文字形与图片像素，确认无原始内容副本/未引用流，且相邻文字/非目标页保留。
- 首片要求先保存或取消其他正文、批注、表单、页面布局和待提交草稿，避免旧坐标、导入页、布局物化改变目标归属。pending 区域只是临时标记，不制造 dirty/history；源文档/字节/页面布局变化清除并取消导出。未来再评估整合未保存布局，不能静默套原页号。
- UI：紧凑 Ribbon 具名「涂黑副本」，320px Inspector、区域列表/清除/删除、固定「导出涂黑副本」。工具提示说明下载后区域内容不可恢复、原件保持；不插普通绘图黑框冒充完成。画布标记用 PDF.js viewport inverse 换算真正 PDF user space，含四 Rotate、offset CropBox、页面缩放；沿当前页面 identity 绑定，不信任 DOM 页码。
- 导出按钮冻结句柄/文档/源字节身份/版本、区域集合与 signal，防双击；失败保留标记，关闭/Escape/切文档取消，迟到结果不得下载。可先服务器生成再显式下载，必须明确哪个结果属于当前区域版本，不显示旧结果。Blob URL 生命周期与同一文档导出合同一致。

## 建议所有权与验收

1. 宿主实现者：shared `pdf-agent.ts` 新操作、server 新 `pdf-redaction-copy.ts`、`pdf-local.ts` 最小 dispatch 和必要tests，已有 routes 通用鉴权不另造；原件预检、真实native、输出独立读取、全体区域原子拒绝与取消。
2. 根会话：`PdfEditor.tsx`、新 overlay/Inspector/纯坐标适配及局部CSS/tests，复用 `hostLocal` 与下载生命周期；不改已有Agent写入路径。完成宿主接口确认后再实施。
3. 独立检查：schema/端点版本、无工作字节发布与库存文件不变、原子失败、图片共享/Widget/Form/未知Catalog拒绝；客户端关闭/切页/修改/取消/双击与真实当前标记。
4. 实机：真实文字中间部分、第二页与相邻文字、独立图片像素；正常和90°/offset CropBox 画布选区；宽1280与420内部滚动/固定按钮/当前区域/Escape回焦。输出须经独立 PDF.js/Poppler 文字和光栅检查，解压对象扫描。不得把一次简单提取不含字符串当作全部安全验收。

没有新增存储、环境键或供应商依赖；不把本地去背景/真涂黑称作模型能力。真实模型未配置、Desktop由用户自行验收的范围保持。
