# PPTX 原生工作副本与打印补全

2026-10-17。范围仅 `PptxOutputControls.tsx`、`pptx-output-controls.css`、`src/pptx-output.ts` 及专项测试。`PptxEditor.tsx` 由根会话单独接线；未改 vendor、共享壳、动画或文字范围实现。

## 固定外部证据

- GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`，本轮 `git -C /tmp/mimir-genoffice-html-git rev-parse HEAD` 再核相同。
- `apps/slides/src/renderer/file-actions.ts:114–143`：saveAs 与 save 共串行通道，先 flushActiveEdit/flushNotes，再由宿主保存原生当前文稿；不能用已保存原件下载代替当前画布副本。
- `apps/slides/src/shared/print-html.ts:8–26, 68–76, 97–203`：完整版式为 `full/notes/handout2/handout3/handout6`；备注、讲义使用 A4 纵横向；3 张讲义带横线，6 张纵向2×3/横向3×2；完整页可选细边框。备注转义后进入 HTML。
- `apps/slides/src/renderer/components/PrintDialog.tsx:110–150`：所选范围按文稿顺序、隐藏页过滤，备注同索引排列，真实输出文档供预览；对话框显示纸张数。
- WeKnora v0.8.3 固定 `3e22822c1d2397be730c458c7539d0eb8c113a24`，本轮重新下载固定 README 到 `/tmp/mimir-pptx-output-weknora.md` 成功。43–55 行是企业文档理解、语义检索、RAG/Agent/Wiki、sandbox/browser/MCP，适合知识库与 Agent 组织，没有 Office 原生副本或讲义打印语义。本轮访问 `https://weknora.weixin.qq.com/` HEAD 12秒超时、curl28、无响应头，未把站点访问写为成功。

## 实现及接线合同

`PptxOutputControlsProps`：

```ts
{
  deck: PptxRenderable
  active: number
  documentId?: string
  version?: number
  defaultName?: string
  notes?: (index: number) => string
  saveCopy?: (options: {signal: AbortSignal}) => Promise<Uint8Array>
  isCurrent?: () => boolean
}
```

根会话必须使用当前真实 `session.save()` 回调并接同步写门控、当前 session/document/version 及取消守卫。副本不调用 `source.save`、`commit`、dirty reset，也不入库；PPTX 下载整份文稿的当前原生字节，保留媒体和关系，不经截图重建。名称验证在序列化前完成，自动附 `.pptx`。

- 右 Inspector 保持实际标题“导出与打印”；按文档身份隔离，换版本/卸载取消在途输出。所有下拉 pending 显式禁用，取消在表单 fieldset 外；主操作在固定底部，状态/失败有实际文字，避免空白按钮或重复标签。
- “输出操作”区分导出和打印；导出 PPTX/PDF/PNG/SVG，原有三种静态输出范围/分辨率保留。范围去重按原文稿顺序，保留可见/全部/当前/指定页码。
- `buildPptxOutput` 在首个 await 前冻结所有页 SVG 和纸张尺寸；每次异步后及返回前检查取消与宿主版本。原栅格64MiB和200页预算保留。
- `buildPptxCopy` 接真实当前会话序列化，取消可释放等待；返回前重核宿主版本，不对外发布迟到旧副本。
- `printPptx(deck, indices, options)` 新增 `layout/orientation/frame/notes/signal/isCurrent`；页面和备注先同步冻结，打开空白浏览器窗口后写自包含 SVG 文档，等待字体与图片就绪，实际 `print()` 前重核版本；取消、过期、加载错误或用户关闭窗口均不报告成功，失败窗口关闭。afterprint 关闭临时窗口。
- SVG 输出保持可选择矢量文字（实际字体取浏览器可用字体），媒体/动画静态；PDF 导出依旧栅格。打印首页预览使用同一版面构建器，sandbox iframe 不执行文稿脚本。

## 本代理验证

- `pnpm --filter @mimir/office exec vitest run src/pptx-output.test.ts src/pptx-output-complete.test.ts src/editors/PptxOutputControls.test.tsx`：3 文件12/12。
- 真实 `image-deck.pptx` 当前文字修改后走 `session.save()` 回调下载副本、独立重开；除目标 slide 外所有 ZIP entry 字节相同，图片仍为原生对象且关系保留。
- 真正多页 SVG/ZIP 与栅格PDF（原有测试），全部打印版式 HTML 的纸张数、页序、SVG、A4方向/物理几何、3页横线和备注转义；底层 print spy 仅代替系统对话框，真实 HTML 写入及生命周期仍执行。
- 延迟序列化取消、版本/文稿变化、late bytes、失败不下载；延迟字体时取消/过期关闭窗口且不 print，成功仅 print 一次；逐页异步栅格化不混入中途新文本。
- 真实控件更改文件名下载原生字节、pending取消与禁用、失败反馈、非法选页、五种打印布局与 sandbox 首页预览。
- Office `tsc --noEmit` exit0；4目标 Oxlint exit0；目标 Oxfmt 通过；Antd lint issues0；目标 `git diff --check` 通过。
- 日志：`/tmp/mimir-pptx-output-{tests,tsc,lint,antd}.log`。

浏览器宽/420px、真实下载、系统打印窗口调用及根会话同步写门控接缝由根会话统一验收。本代理未操作浏览器或 Desktop；不把单元测试当作实机证据，也不宣称整体工具补全完成。产品文件冻结后仅补研究/矩阵记录。
