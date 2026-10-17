# PDF 文字参数片独立检查

2026-10-17，`pdf_image_upload_ui_check` 按 root 新派发负责独立 text check。对照已批准 `pdf-text-params-next-plan-20261017.md` 与冻结 `pdf-text-parameters-implementation-20261017.md`，读取相关 task/spec 并沿实际 shared→route→native→Agent→pending→Editor 路径检查。引用既有 GenOffice/WeKnora 固定证据，没有新研究、嵌套 agent、浏览器、provider 或模型调用。

## Findings (fixed)

### 1. 被原生 clip 遮挡的文字会生成完整标注

- File: `apps/server/src/services/pdf-text-glyphs.ts`
- Issue: PDFium 字符框是完整物理 glyph bounds，原实现没有读取文字对象的 clip path。真实 PDF 仅显示单词开头时，对完整单词仍成功创建覆盖全部字形的 AP/QuadPoints。
- Evidence: 新增真实矩形 clip fixture，修复前期望拒绝但实际返回 bytes/count1。最终同页包含一个可见与一个被 clip 的相同词，all=true 整体拒绝，默认首个可见匹配仍成功 count1。
- Fix: 缓存每个原生文字对象的 clip 状态；带非空 clip path 的命中字形不作为可靠位置发布，匹配在任何 pdf-lib 写入前拒绝。没有更改原件/字体/内容流或 Catalog 守卫。

### 2. Undo 后旧 Inspector 草稿继续覆盖同一 T 的新当前值

- File: `packages/office/src/editors/PdfEditor.tsx`
- Issue: `pendingDraft` 只按 T id 绑定。手工输入未应用的 STALE DRAFT 后 Undo，T id 不变，面板仍显示并可应用旧草稿，遮住 history 中恢复的实际文字/格式。
- Evidence: 真实 native 中文/字体/换行 Editor 回归中复现，修复前 Undo 后 textarea 仍为 STALE DRAFT。
- Fix: 草稿增加 history epoch，仅在当前 epoch 与 id 同时匹配时使用。Undo/Redo 与外部写后重新展示当前 pending 值；新增 Undo→Redo 两次读取断言，原真实两次保存与 batch survivor 断言继续通过。

### 3. 第二指针取消会打断第一指针拖动

- File: `packages/office/src/editors/PdfPendingTextOverlay.tsx`
- Issue: `pointercancel` / `lostpointercapture` 无条件清除当前 gesture，第二指针相关事件可取消第一指针的拖宽。
- Evidence: 在真实 PointerEvent 测试中插入 pointer2 的 cancel/lostcapture，修复前最终 pointer1 up 无提交，原预期 width120 断言失败。
- Fix: 两个取消入口均核对 gesture 所属 pointerId。Escape/blur 与所属指针取消仍零提交；原单次拖宽、键盘步长和 no-op 测试保持。

### 4. 已排版多行 T 移动时仅检查首行字号

- File: `packages/office/src/agent/pdf-batch.ts`
- Issue: pending replay 只检查 x 与 y+fontSize，不检查已知 width/height。500×600 页面上把宽150的中文多行块移到 x490，原实现仍成功并推进版本，内容会超出页面。
- Evidence: 真实 Editor/native fixture 增加水平与垂直移动溢出；修复前第一项实际 ok=true/version+1。
- Fix: replay 在写入前检查完整已知 width/height 与有限数值；旧无尺寸 pending 沿既有字号回退。两种移动均拒绝，版本不变；保存/history/batch 幸存 T 仍经同一重放路径。

对应测试：`apps/server/src/test/pdf-text-parameters.test.ts`、`PdfEditor.content.test.tsx`、`PdfTextControls.test.tsx`。`.trellis/spec/shared/contract/pdf-agent.md §17` 最小同步上述 clip、whole-block replay、epoch 与所属指针要求。

## Findings (not fixed)

- 本片没有剩余已确认代码问题。实际 320px／420×500 Inspector、下拉 portal、纸面拖移/调宽、错误区域与固定底栏、Escape 回 live 入口，以及真实渲染标注和保存重开仍由 root 用统一生产构建验收。native/组件测试不替代浏览器像素。
- 斜排文字、带裁切路径的命中文字对象、无可靠原生字形保持明确拒绝；没有扩展 native writer 支持范围。
- 未运行完整 `pnpm check`、全 Office/server 套件、build、Desktop 或真实 Agent/model/provider；root 统一重型 gate，Desktop 按用户选择由用户验收。全仓既有技能 lint 阻断不重复运行。

## Verification

- Tests — Office **7 文件 57/57，exit0**：
  `pnpm --filter @mimir/office exec vitest run src/agent/pdf-agent.test.ts src/agent/pdf-content-agent.test.ts src/agent/pdf-batch.test.ts src/editors/PdfEditor.content.test.tsx src/editors/PdfTextControls.test.tsx src/editors/pdf-toolbar-render.test.tsx src/editors/PdfEditor.batch.test.tsx`
  日志 `/tmp/pdf-text-check-office-20261017.log`。
- Tests — server **4 文件 35/35，exit0**：
  `pnpm --filter @mimir/server exec vitest run src/test/pdf-text-parameters.test.ts src/test/pdf-agent-host.test.ts src/test/pdf-agent-route.test.ts src/test/pdf-agent-catalog.test.ts`
  日志 `/tmp/pdf-text-check-server-20261017.log`。包含四 Rotate/offsetCrop、NFKC/物理连字/非 BMP、实际颜色、AP/QuadPoints 与原 stream 保留、HTTP 只读布局/严格参数；新增 clip 原子拒绝。
- TypeCheck — Office 与 server **exit0**，`/tmp/pdf-text-check-{office,server}-types-20261017.log`。本 checker 未改 shared/renderer 类型源码，没有把实现者先前的两个包通过冒称为独立重跑。
- Lint — 本片20个 TS/TSX `pnpm exec oxlint ...` **exit0**，无诊断。
- Format — 20 TS/TSX + text CSS 共21文件 `pnpm exec oxfmt --check ...` **exit0**。
- Ant Design — InsertPanel、MarkupPanel、PendingOverlay、PdfEditor 逐文件 `antd lint ... --format json` 各 **0 issues**。一次多文件调用因 CLI 只接一个参数而退出1，已改逐文件重跑通过，不是代码错误。
- `node scripts/check-style-backticks.mjs`、限定修改的 `git diff --check` **exit0**。

本片源码与测试已冻结，可进入 root 统一构建/浏览器验收。未改图片/OCR/DOCX/XLSX/PPTX/vendor，未 stage/commit/archive/delete。
