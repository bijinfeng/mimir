# PDF 待保存插字缓存生命周期修复

2026-10-17，root；用户持续授权补齐工具。由真实浏览器拖动失败触发，属于既有 PDF 插字功能修复。

## 行为缺口与真实接缝

见 `toolbar-pdf-text-browser-20261017.md`。首次插字后 activePendingText.base 已不是 currentBytes，但 replayPdfPendingText 编辑/拖动/宽度变化仍需要它；PdfEditor retainedSources 遗漏它。pdf-render.loadPdfDocument 在 resolved 时立即 destroy 未保留的代理，又将此代理返回给调用者，getPage 可永久悬挂。取消 Inspector 只 abort 标志，不能让该悬挂 await 结算。

保留集合应包含活动 pending base，并随源/保存/pending结束正确释放。但不能只补这个集合就称所有接缝修复：agentInsertRef 会先 buildPdfWorkingCopy 得到未发布 base；pdf-batch.geometry/replay 也会读取尚未发布 candidate。它们不在 UI keep 集合，存在相同真实生命周期缺口。

## 预期变更边界

- `PdfEditor.tsx`：稳定保留活动 pending base；插字准备读取临时 base 时明确保留，并在成功/失败/取消后释放。
- `pdf-render.ts`：已有 retainPdfImageExport 是按 bytes 引用计数的请求级 pin，可沿同一真实机制抽出具名通用保留接口，保持既有图片导出行为/API兼容，避免复制第二套缓存或无限保留全部历史。只能进行本缺口需要的局部抽取。
- `agent/pdf-batch.ts`：重放及临时 geometry 的异步读取必须在本调用拥有的 pin 内；finally 释放，不能全局覆盖编辑器 keep 集合。
- 最小必要测试及 mocks：真实 pdf-render 生命周期/销毁测试，Editor真实插字→移动/缩宽/对齐→保存/UndoRedo，页面物化后插字及native批次幸存者。现有 content mock retain 是 no-op，须有能实际暴露已释放代理的测试，不能仅断言新数组包含base。

取消/换源必须结束该请求自有忙态并拒绝迟到发布；必要时沿既有 signal 让 PDF 读取 await 可取消，禁止吞错/全局破坏共享 pdf worker。检查同步/异步 release 竞争及引用计数两用户共享。不能以超长等待或改断言避开真实代理销毁。

## 验证与交付

先证明回归在修复前失败，再实施。目标 PDF 文本/批次/图片导出/缓存相关专项，Office typecheck 和目标lint/format/diff；root 负责统一全套及 Web build。正式 implement 冻结报告后独立 check；root 最终在生产浏览器复现实际拖动、文字宽度、对齐、保存/原生读回/history 和420×500 Inspector。保护其他owner改动，不碰vendor、DOCX/PPTX/XLSX，不提交/暂存/归档/删除测试件。

参考沿用已记录固定 GenOffice 480548fd55f1be3593ee0d8e316a734751d58309 及同日缓存 WeKnora v0.8.3；后者只适用能力与停止门控，不作为 PDF 缓存/原生写回或视觉模板。此修复不新增竞品功能推断。

## 实施交接

`pdf_pending_retention` 已实现并冻结；实际红→绿、生命周期范围及静态/专项门禁详见 `pdf-text-retention-implementation-20261017.md`。待独立 check 和 root 统一构建后的生产重验，尚不能据此关闭 PDF 文字浏览器验收。
