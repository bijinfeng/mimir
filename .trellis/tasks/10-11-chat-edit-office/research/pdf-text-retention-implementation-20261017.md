# PDF 待保存插字缓存生命周期实施

2026-10-17，`pdf_pending_retention` / trellis-implement。**实现冻结，可独立 check；生产浏览器待 root 统一构建后复验。**

## 依据与边界

已读任务 PRD/设计、注入完整实施上下文、`pdf-text-retention-fix-plan-20261017.md`、现有生产失败报告及 Office 引擎/编辑器生命周期规范。真实缺口是 Editor 工作副本替换后遗漏仍需重放的 pending base，以及未发布的物化/批次字节不属于 viewer keep 集合；原 loader 在 resolve 时销毁未保留代理，后续 getPage 可永久挂起。

沿用方案已有固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 和同日缓存 WeKnora v0.8.3 证据，没有新增网络调研。WeKnora 仅适用停止与能力门控，不能作为 PDF 缓存或原生写回实现依据。

没有修改 vendor、DOCX/XLSX/PPTX、服务端或 UI 布局。未暂存、提交、归档或删除测试件。

## 变更

- `packages/office/src/editors/pdf-render.ts`：将原图片导出引用计数抽成 `retainPdfDocument`，原 `retainPdfImageExport` 作为兼容别名。请求 pin 与 viewer keep 独立，release 幂等。缓存与进行中加载均在最后用户释放、且 viewer 不再持有时回收；活跃 canvas 渲染期间仍延后销毁。进行中加载取消后允许同 bytes 新建任务；旧完成/失败不会覆盖或删除新任务。`awaitPdfTask` 让单个请求的 load/getPage await 随 signal 结算，并消费迟到失败，不取消其他读者的共享任务。
- `packages/office/src/editors/PdfEditor.tsx`：viewer 稳定保留当前活动 `pending.base`；插字准备读取物化 base 时领请求 pin，在成功/错误/取消 finally 释放。内容操作也持有临时物化 base，覆盖本地锚点文字索引；该临时索引 await 可取消。插字与重放继续沿既有身份/版本守卫发布。
- `packages/office/src/agent/pdf-batch.ts`：重放和临时候选的 geometry 分别持有请求 pin，load/getPage 可取消，finally 释放。没有将候选写入全局 viewer keep，也没有保留全部历史字节。
- `pdf-retention.test.ts`：新增真实缓存管理器 + 可控 pdf.js transport 生命周期回归，8 项覆盖未发布重放、成功/错误回收、两用户与图片导出兼容、取消挂起 load/page、viewer 共享、已取消 signal 的晚到失败、旧任务不覆盖同 bytes 新任务。模拟的 destroyed transport 会令 getPage 永久 pending，避免把生命周期错误变成无害 no-op。
- `PdfEditor.content.test.tsx`：两条原生用例切到实际 pdf-render 缓存与实际 pdf.js（仅画布绘制仍 stub）；包括手动旋转页面物化后的插字，以及中文/字体/换行→move→width→align→批次 survivor→保存→保存后 Undo/Redo。最后 Redo 保存字节与此前保存件精确一致。每次请求 3 秒结算界限用于捕捉原挂起，不放宽原生断言。
- `agent/pdf-batch.test.ts`：移除绕开真实缓存的 loader mock，7 条批次用例现使用实际缓存与 pdf.js，包括四旋转/CropBox、native survivor、页面物化、几何漂移和原子拒绝。
- 12 个其余 `PdfEditor.{batch,blocks,drawing-canvas,external-images,forms,image-export,images,local,ocr,pending-forms,redaction-copy,signature}.test.tsx`：仅适配新增 pin/await 导出，保留各自原 loader。6 处既有无类型 `vi.fn()` 同步补准确 loader 类型以满足目标 lint。

## 实际红→绿证据

1. **修复前**：先使 `PdfEditor.content` 原生字体/换行用例使用实际 pdf-render 缓存，保留生产原有销毁逻辑。测试 3 秒内未结算，失败 `PDF lifecycle request did not settle`，日志 `/tmp/mimir-pdf-retention-red-20261017.log`；没有通过延时放宽绕过。
2. **修复后首轮**：同一原生用例通过，`/tmp/mimir-pdf-retention-first-green-20261017.log`。
3. 真实 batch/cache 与扩展 Editor native 回归 **2 文件 18/18**，后续加生命周期为 **4 文件 26/26**。
4. PDF 综合专项 **18 文件 134/134**，`/tmp/mimir-pdf-retention-final-tests-20261017.log`，覆盖 Editor batch/blocks/content/drawing/external images/forms/image export/images/local/OCR/pending forms/redaction/signature、pdf-render/retention/image-export、agent batch/content。
5. 最终加载回收/取消竞态与局部锚点索引调整后，重跑相关 **5 文件 45/45**，`/tmp/mimir-pdf-retention-final-focused-20261017.log`。
6. 最终 Office typecheck exit 0，`/tmp/mimir-pdf-retention-types-20261017.log`；目标 oxlint 0 错误/警告（空日志）、18 文件 oxfmt check 通过、目标 git diff --check 通过。

## 后续与限制

- 待独立 trellis-check；root 负责统一 Office/server suite、Web 构建和生产浏览器。
- 生产 `7D___MGkpGDrPqFA` 仍停留旧构建的未保存插字挂起；此前已保存标注保持原验收结论。此次没有操作浏览器，不能称实际拖动或 420×500 已通过。
- 构建后实际验收应重建该合成插字，完成拖动、宽度/对齐、取消/继续、保存、Undo/Redo 与 PDF 原生读回。没有模型或 Desktop 验收结论。
