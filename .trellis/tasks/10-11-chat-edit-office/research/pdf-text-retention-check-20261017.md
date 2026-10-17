# PDF 待保存插字缓存生命周期独立检查

2026-10-17，`pdf_retention_independent_check` / trellis-check。**检查与局部修复冻结，root 可统一 Office suite / Web 构建并进行生产浏览器验收。**

## 范围与依据

已读正式注入上下文的完整保存输出、Trellis check skill、任务 PRD/design/implementation 相关段落、`pdf-text-retention-{fix-plan,implementation}-20261017.md`、`toolbar-pdf-text-browser-20261017.md`，及 Office engine/editors 生命周期和补丁保存规范。按分工只审 PDF 生命周期，不改其他并行 owner 的 DOCX/XLSX/PPTX/vendor。

参考沿用固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 与已记录同日 WeKnora v0.8.3 缓存证据；本次属于缺陷复核，没有新增网络调研，WeKnora 不作为 PDF 缓存或原生写回实现依据。

## Findings（已修复）

### 1. PDF 加载失败丢失自身资源清理

- 文件：`packages/office/src/editors/pdf-render.ts`。
- 原因：loadPdfDocument 的 rejection 分支移除 loading entry 后直接抛错。随后请求 finally 的 lease release 已无法找到 task，不会销毁 pdf.js worker/transport。安装版 pdf.js 的 DocException handler 仅 reject loading capability；真正 worker 清理由 PDFDocumentLoadingTask.destroy 执行。
- 修复：失败分支销毁该 loading task 自己拥有的资源，仍以 task identity 判断是否清理 loading map；不会删除或销毁同 bytes 后建的新任务。
- 红测：新增 invalid PDF 回归先失败，`expected false to be true`，日志 `/tmp/mimir-pdf-retention-check-load-error-red-20261017.log`。修复后已通过。

### 2. 缺少竞争和真实 Editor 取消结算回归

- 文件：`packages/office/src/editors/pdf-retention.test.ts`。
- 补充：加载失败清理/同 bytes 重试、两个请求共同持有进行中任务、旧任务迟到失败不删除新任务。原有旧成功竞争、viewer/图片导出共享 lease、幂等释放、load/page 停止及迟到零宿主调用继续覆盖。
- 文件：`packages/office/src/editors/PdfEditor.content.test.tsx`。
- 补充：真实 pdf-render 缓存和真实 pdf.js 上的 load/getPage 两阶段 × 外部取消/换源四条 Editor 回归。只延迟代理返回，不 mock retain、pin 或 await；确认请求在 gate 未释放时就结算并解锁工具，再释放迟到结果，验证没有 native insertion、写盘、dirty、版本或 Undo/Redo 变化。换源用不同原生尺寸/源引用并核对最终渲染引用。
- 既有真实 Editor 原生测试继续通过：手动旋转后物化插字、中文/字体/换行、移动/缩宽/对齐、批次 survivor、保存、保存后 Undo/Redo，最终 Redo 保存字节精确相等。

### 3. 静默故障知识同步

- 文件：`.trellis/spec/office/frontend/editors/pitfalls.md`。
- 补充生命周期症状、pending base/未发布字节 pin、请求取消与共享资源隔离、加载失败清理和同 bytes 旧任务竞争的避免方式。未新增产品范围或公共接口判断。

## 已复核的关键路径

- retainedSources 的 pending.base 以活动 documentId/source 身份导出，依赖 base 引用稳定，不保留全部历史。
- 插字准备、内容操作的物化底稿、batch replay/geometry 各持有独立 pin 并 finally release，不调用 retainPdfDocuments 覆盖 viewer keep。
- 引用计数与原 retainPdfImageExport 别名共享；一个请求取消不会回收 viewer 或另一请求仍持有的 task。
- collect 只回收已经释放且无 viewer/请求使用的进行中加载；旧完成/失败以 task 身份隔离，不能覆写新缓存。
- awaitPdfTask 取消当前等待并消费迟到 rejection；Editor 身份/版本检查守住发布，真实 Editor 测试证明忙态可结算。
- 原销毁 transport 的 getPage 永不结算行为由专用可控 transport 回归保留；实现前真实缓存 Editor 红测日志 `/tmp/mimir-pdf-retention-red-20261017.log` 已核读，不能将原 no-op retain mock 当有效复现。

## Findings（未修复）

无剩余代码缺陷或需产品判断的事项。生产浏览器复验仍是待完成的验收门禁，不计为已通过：root 需在新构建对 `7D___MGkpGDrPqFA` 重建合成插字，实际拖动、宽度/对齐、取消/继续、保存与原生 history，并检查 1280 与 420×500。本代理没有操作浏览器、模型或 Desktop。

## Verification

- PDF 相关专项：**18 文件 141/141，exit 0**，`/tmp/mimir-pdf-retention-check-tests-20261017.log`，`--maxWorkers=2`。包含 13 个 Editor 文件、pdf-render/retention/image-export 及 agent batch/content。
- Office TypeCheck：**pass，exit 0**，`/tmp/mimir-pdf-retention-check-types-20261017.log`。
- 18 个实现/适配测试文件 scoped oxlint：**pass，0 错误/警告，exit 0**，`/tmp/mimir-pdf-retention-check-lint-20261017.log`。
- 同 18 文件 oxfmt check：**pass，exit 0**，`/tmp/mimir-pdf-retention-check-format-20261017.log`。
- 本 slice 实现、测试及 spec 的 git diff --check：**pass**。
- 未运行全仓 check、完整 Office/server suite、Web build 或浏览器；依 root 分工完成，不把已知 480 个 bundled-skill lint 基线问题重复跑为本次门禁。
- 本检查新增生产修改仅 pdf-render.ts 的失败任务清理；其余为两个目标测试及一行 pitfalls。没有 stage、commit、archive 或删除测试件。
