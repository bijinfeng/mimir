# PDF 涂黑副本 UI 独立复核（2026-10-17）

## 范围与结论

读取 UI implementation、原计划、shared／宿主检查结果；逐段检查 `PdfEditor.tsx`、`PdfRedactionCopy.tsx`、纯坐标模块、局部 CSS 及实际 Editor tests。原生内容移除、完整对象／流和像素证据见独立 `pdf-redaction-copy-host-check-20261017.md`，不以本片 mock 下载测试替代。

生产已冻结。此次仅修 `PdfInspector.tsx` 的关闭焦点末级回退，在 `PdfEditor.redaction-copy.test.tsx` 新增两条回归；未改 controller、PdfEditor 业务、坐标、CSS、server/shared/vendor 或其他格式。根会话已获知需要把这处产品修复纳入最终 Web build。

## Findings (fixed)

- **文件：`packages/office/src/editors/PdfInspector.tsx`**。开启涂黑后切“开始”翻页，原“编辑”分类的 trigger／section 都卸载；Inspector Escape 关闭后无可用 focus destination，实际 Editor 回归先复现 `document.activeElement === BODY`。
- **修复**：开启 Inspector 时捕获其当前可见 Ribbon tab；仍优先回原 trigger 或当前具名 group。仅当来源 group 已卸载、焦点尚属面板／BODY 且 tab 仍连接时，末级回到原可见 tab（此处“编辑”）。不增 public props，不强行切分类，不抢用户外部焦点。
- **相邻风险已修正并验证**：首次 fallback 会在表单刷新 busy 时提前把 BODY 焦点移到 tab，破坏原延迟回焦。现以“来源 group 已卸载”为必要条件，同分类 busy 仍保留既有请求结束后回入口。实际 forms 全12项通过。
- **测试**：新实际 Editor 回归覆盖涂黑→开始→下一页→Escape→可见编辑 tab，并确认无 host／保存调用。另新增同一 act 内导航与 host 立即完成的取消竞态回归，原控制器已能取消且无迟到下载，无需新增取消分支。

## Findings (not fixed)

- 无本片已确认且遗留的 UI 实现缺陷。
- 320px Inspector、固定 footer 与420px实际视觉、真实 canvas pointer、下载后原生内容验证仍由根会话统一实机验收；本检查不冒充已经看过这些最终构建画面。
- 最终规范同步由根会话统一处理；建议记录焦点末级 tab 回退须限来源 section 已卸载，避免破坏 busy 后延迟回入口。

## 实际路径核对

- 区域仅是 hook 临时 state，调用 raw `hostLocal` 的 `redact_copy`；没有 `handle.execute`、工作字节 publish、markManualChange、markSaved 或 io.save。成功只下载一个输出，不制造 dirty/version/history。
- 导出冻结 handle、version、文档／源 bytes／layout／history identity、当前页及 regions 深复制，并在返回后重验 signal 与全部身份。只接受同 version、无 bytes/info、唯一精确文件名且非空 Uint8Array 输出；失败保留 regions 和宿主错误。
- request ref 阻止同帧双击；关闭／切工具同步 abort，源／版本／页变化清理旧请求；save/applyPages／Agent content 和插字入口同步 abort。只读 host 操作即使 busy 被 React 合并也能取消旧导出。实际同事件导航＋完成回归通过，未发现需要扩大同步逻辑的问题。
- 换页保留跨页区域但取消旧手势／请求；源／layout／history identity 或工具关闭清区域。开启前要求干净且无 pending page/text/replacement；保存页面修改后使用真实新工作 bytes。
- 坐标沿真实 PDF.js scale1 viewport inverse／forward，四 Rotate＋offset CropBox 均有实际 PDF.js 测试；pointer 按 overlay box 标准化，3px 门槛、主指针、capture/cancel/lost capture和Escape两步退出均覆盖。Overlay 仅在当前 PdfSheet bytes/index/rotation/width 已渲染的身份上挂载。
- `.mimir-pdf-inspector` 当前为320px且窄区最多100%-32px；panel flex column、content自身 overflow、footer flex none。没有更改原有结构和外观。

## Verification

- **Tests: pass，7文件103/103**：纯坐标、Editor redaction、drawing-canvas、image-export、toolbar-render、pages、forms。命令 `pnpm --filter @mimir/office exec vitest run src/editors/pdf-redaction-copy.test.ts src/editors/PdfEditor.redaction-copy.test.tsx src/editors/PdfEditor.drawing-canvas.test.tsx src/editors/PdfEditor.image-export.test.tsx src/editors/pdf-toolbar-render.test.tsx src/editors/pdf-pages.test.ts src/editors/PdfEditor.forms.test.tsx --maxWorkers=2`。
- **TypeCheck: pass**：最终修复后的 `pnpm --filter @mimir/office typecheck`。
- **Lint: pass**：6目标TS/TSX oxlint；PdfInspector／PdfRedactionCopy 两组件 antd lint各0问题。
- **Format: pass**：上述6目标与局部 CSS 共7文件 oxfmt check。
- **Styles／diff: pass**：`pnpm lint:styles`、目标 tracked diff check。
- 未运行 full Office、Web build／全仓 gate，未上传、删除测试件、暂存、提交或归档。无关全仓 skill-script lint 基线不记为已通过。
