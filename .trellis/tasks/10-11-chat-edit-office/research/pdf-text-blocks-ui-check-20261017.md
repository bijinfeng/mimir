# PDF 原文段落移动 UI 独立检查 · 2026-10-17

## 范围与结论

复核根会话冻结的 `PdfEditor.tsx`、`PdfTextBlockPanel.tsx`、`pdf-text-block-panel.css`，沿实际面板→manual executor→真实 `applyPdfTextBlockOperation`→工作字节/history/save链核对。只新增本检查独占的 `PdfEditor.blocks.test.tsx` 与 `PdfTextBlockPanel.test.tsx`，**没有修改生产代码、vendor、DOCX或其他worker文件**。本范围未发现需要生产修补的缺陷。

主要文件编辑参照沿用 `pdf-original-block-next-boundary-20261017.md`：GenOffice固定提交 `480548fd55f1be3593ee0d8e316a734751d58309`，`apps/pdf/src/renderer/ai/tools.ts` 原文段落聚类/完整对象移动、`text-block.ts`聚类；WeKnora官网HTTP200快照及公开源码v0.8.3提交 `3e22822c1d2397be730c458c7539d0eb8c113a24` 的工具证据也见该记录。其知识检索/沙箱门控可参考权限与能力边界，不提供PDF原文对象写回/UI合同，本检查未新增竞品研究。

## 新增组件回归（7项）

- 旧选择核验中改选另一段：原signal取消，新选择先核验成功，旧返回随后抵达也不能覆盖新target；Apply携带正确target、page和核验版本。
- 换源字节取消旧inspect；当前live version已改变时，旧版本响应不能生成可执行表单。卸载继续取消当前inspect。
- inspect返回写入bytes、错误版本、缺target三种非法结果均显示失败，不生成移动表单。
- 水平值已提交、垂直值仍为输入草稿时，真实mousedown→click第一次应用获得最新垂直值。
- 已接受move遇父层busy=true仍保留同一请求与signal，同时禁用字段和按钮；busy恢复不误abort自身。
- 操作失败保留数值与错误供重试；卸载取消在途move，迟到完成不更新旧表单。

## 新增真实 Editor/host 回归（7项）

使用真实PDF两页夹具：第一页上下两段重复原文，每段三行、每行normal+bold两个对象，共至少六个目标文字对象；另有非目标矩形，CropBox为非零原点，第二页有独立文字。仅渲染canvas绘制被stub，文字索引、宿主PDF.js/PDFium核验与原生字节写回真实运行。没有用模拟文字索引替代完整对象定位。

1. 从实际 `.mimir-pdf-stage` canvas点击段落，宿主inspect成功后设置17/23pt偏移。草稿不改version/dirty/history；显式Apply只调用一次move，版本只加1。
2. 保存读回目标全部成员矩阵按显示方向移动（x+17、PDF y−23），文字、字体样式与资源hash不变；非目标段落、矩形和第二页原生对象保持。
3. 首次save后一次undo已到基线，undo-save **字节精确等于原件**，redo-save **字节精确等于移动后保存结果**。证明一次历史而非多个对象各记一步。
4. 真实host已计算原生字节但故意延迟响应，move不因自身contentBusy变化被取消，最终真实保存成功。
5. 上述延迟响应分别遇Escape、关闭按钮、换页、换documentId（同一原件字节）四种场景，signal取消，晚到字节不发布、不增版本/dirty/history/保存。
6. 无在途写入时Escape关闭面板并真实回焦“原文段落移动”触发按钮，不产生move或历史。

注：上述步骤由7个Editor测试覆盖（四种取消场景为四项）。宿主四个Rotate、媒体bytes、结构拒绝、Agent/HTTP等专项由另一实现/检查者负责，不将其用例计入本检查14项。

## 实际门禁

- `pnpm exec vitest run src/editors/PdfTextBlockPanel.test.tsx src/editors/PdfEditor.blocks.test.tsx`：**2文件14/14**。日志 `/tmp/mimir-pdf-text-blocks-ui-check-tests.log`。
- Office `pnpm exec tsc --noEmit`：exit0，日志 `/tmp/mimir-pdf-text-blocks-ui-check-types.log`；本次未修改并行DOCX。
- 两测试文件目标oxlint无警告、oxfmt check通过：`/tmp/mimir-pdf-text-blocks-ui-check-{lint,format}.log`。
- `pnpm lint:styles`、PdfTextBlockPanel目标Antd lint、目标生产/测试 `git diff --check` 均通过；日志 `/tmp/mimir-pdf-text-blocks-ui-check-{styles,antd}.log`。
- 未运行build、全suite或全仓check。先前全仓bundled Impeccable脚本lint阻断不由专项通过消除。未提交、暂存、归档或删除测试文档。

## 保留边界与后续

- 本片仅原文段落**整体移动**；不代表edit_block重写/重排、任意字符编辑或OCR/签名/真涂黑已完成。
- 完整成员与原件hash由真实宿主再验；AcroForm、未知Catalog、跨段对象、重叠/clip等既有拒绝继续有效，UI不放宽安全守卫。未保存页面或插字改动先保存再移动，不能拿近似显示框冒充已核验对象。
- 手动panel按当前页/文档/historyVersion隔离，inspect读取live版本，move明确携带target/expectedVersion/signal。busy仅禁用动作，不作为卸载自身已接受请求的条件。
- 根会话负责浏览器1280/420真实选段、高亮、偏移方向、内部滚动/固定底部、Escape、保存重开及最终统一构建。本检查未操作浏览器，不声称视觉已验。
- 无模型配置，真实模型调用未验；Desktop用户自行验收；整体任务保持 **in_progress**。
