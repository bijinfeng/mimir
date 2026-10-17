# DOCX 视图、缩放和导航独立检查

2026-10-17；active task `10-11-chat-edit-office`。读过 `docx-views-drawing-next-20261017.md`、`docx-views-implementation-20261017.md`、PRD/design/implement及Office引擎/编辑器/外壳规范。本片独立检查完成并冻结；整体工具补全仍在继续，生产浏览器由root验收。

## 结论和范围

初轮视图独立检查未发现需新增产品修正的确定缺陷；后续root真实浏览器发现表格拖宽的可见宽度与原生保存不同步，已按下文修复并冻结。保留既定语义：打印/Web展示布局；阅读隐藏编辑Ribbon、阻止直接输入，显式Agent写入/草稿/整轮回退退出阅读并提示；标题大纲用于定位，未提供可编辑大纲或第二个Editor。没有把阅读模式称作原件保护。

固定参考沿研究报告：GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 为文档视图/编辑主参考；WeKnora v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24` 的能力门控原则适用工具可执行性，没有DOCX分页/缩放合同。本轮属于实施检查，未重新联网，不把前序证据写成重新抓取成功。

## 检查的实际路径

- `DocxEditor.tsx` 始终只挂一个EditorContent，布局和阅读使用展示状态；Agent wrapper依赖稳定editor/session，不随reading状态重建。六个read工具与底层handle保持一致。显式写命令在调用native handle前退出阅读，直接实际doc update也退出；setEditable关闭emitUpdate，不凭视图切换造dirty。
- `pagination.ts` 的enabled关闭分支取消打印observer/重试/排队任务，并清page gaps、尾注与续注插件、column layout、首尾HF/图片层、混合纸张层及打印min-height。返回print重新schedule实际block测量；没有用CSS隐藏来代替清理。
- zoom改变触发新分页pass；`withDocxUnscaledLayout` 同步置1、finally恢复。PM列宽校正只改原生dragging元数据和delta，保留原event.clientX用于命中；上游`currentColWidth`使用layout offsetWidth，因此未额外错误除倍率。原生表格和图片四倍率mouse手势专项通过。
- fit读取实际scroller的clientWidth/clientHeight，停靠Inspector自然减少可用宽度；没有使用全window宽度。420覆盖Inspector及混合纸张真实几何仍由root浏览器检查。
- 导航页面和标题定位读取实际PM位置；Escape优先退出Inspector，阅读Escape另行退出阅读；回焦查找当前可见入口，跳过隐藏编辑Ribbon同名按钮。无标题空态和标题层级已具名。

## 本检查者改动

初轮仅修改 `packages/office/src/editors/DocxEditor.views.test.tsx`，另新增本报告；后续表格修复见下节：

1. 新增已有dirty内容和redo分支的实际Editor回归。print→Web→阅读→退出→print保留JSON/version/undo/redo；首次undo仍回原文，视图切换后redo仍能恢复同一未保存内容，没有库保存。
2. 新增actual Editor在150%显示下的分页测量回归。用真实block rect调用观察现有`measuring-columns`测量阶段，确认该阶段都在zoom1，随后display恢复1.5，JSON/version/clean不变。初次把所有消费者的rect读取都算作分页，观察到其它live preview正常读取1.5；收窄为已有分页测量阶段后通过，没有因此修改正确的产品测量行为。

## 实际验证

- 原始8文件67/67先独立复跑通过；加入两项后最终 **8文件69/69**：`DocxEditor.views.test.tsx`、`docx-view.test.ts`、`DocxEditor.export.test.tsx`、`docx-toolbar-render.test.tsx`、`pagination-geometry.test.ts`、`docx-footnote-flow.test.ts`、`docx-footnote-gaps.test.ts`、`docx-endnotes.test.ts`。日志 `/tmp/mimir-docx-views-check-tests.log`。
- Office `tsc --noEmit`退出0，`/tmp/mimir-docx-views-check-types.log`。
- 本片7个TS/TSX目标oxlint零警告/错误、8文件oxfmt check通过，`/tmp/mimir-docx-views-check-{lint,format}.log`；最终测试评论修改后单文件lint/format另行通过。
- DocxViewControls、DocxViewPanel分别执行antd lint，issues=[]、partial=false，`/tmp/mimir-docx-views-check-antd-{controls,panel}.log`。
- 目标git diff check通过；局部CSS无反引号。没有运行全量Office、Webbuild或全仓pnpm check，没有重处理已知bundled skill lint阻塞。

## 尚待root生产浏览器确认

真实宽屏/420与混合节纸张的打印→Web→打印还原、缩放与PM拖宽的屏幕位置、停靠Inspector后fit、导航可见入口/焦点。现有实际夹具文档 `iS3v3GY5x7XqhkKO` 由root持有；本检查者未上传或删除文件，没有模型调用。Desktop用户自验；无暂存、提交、归档。

## 浏览器发现的表格拖宽缺陷与修复

root在夹具 `iS3v3GY5x7XqhkKO` 的150%视图实际拖动60屏幕px：PM列宽正确从140/140变成180/140，但DOM表格仍为281px、colgroup仍为50%/50%，显示列宽仍为210.25px。已证实条件样式预览没有覆盖宽度；原因是原生PM columnResizing只改cell.colwidth，DOCX renderer仍读table.widthPx/colWidthsPct。

- `packages/office/src/editors/docx-table-design.ts`：自有extension在同一appendTransaction链按实际cell宽度同步table宽度/比例；TableMap处理合并格，未知宽度不猜测。contents维持原语义，window/显式百分比只同步比例，浮动及其他原件属性保留。history transaction不重算，单次undo/redo恢复精确JSON。
- `packages/office/src/docx-table-save.ts`：回归另证实原生generator保留旧tblW而更新tblGrid。固定绝对宽发生变化时，仅补原件tblW的w:w与w:type=dxa，使其与实际保存grid总宽一致；保留其他属性、浮动、tblLayout和百分比/AutoFit语义。未改vendor。
- `packages/office/src/editors/docx-view.test.ts`：真实原生鼠标手势在1.5倍下200→260，对应列180/140、table320px、比例56.25/43.75；断言实际DOM、一次undo及redo。另覆盖window/contents/percentage与浮动属性保留及精确undo。
- `packages/office/src/editors/docx-table-design.test.ts`：原生条件表格夹具实际拖动后保存，断言tblGrid与tblW一致，段落XML、caption/layout/对角线和非document ZIP部件保留；两次保存稳定，undo保存逐部件恢复原件，redo保存逐部件恢复变更。夹具原生2000twips解析为133px，故保存总宽以实际live列439px/6585twips为准，不误断言无损小数精度。

### 最终目标检查与冻结点

- 先复现DOM失败（280应为320），日志 `/tmp/mimir-docx-table-drag-repro.log`；再复现原生tblW失败（6000应为6585），日志 `/tmp/mimir-docx-table-drag-save-repro.log`。
- 修复后 **4文件33/33**：`docx-view.test.ts`、`docx-table-design.test.ts`、`DocxTableDesignControls.test.tsx`、`DocxEditor.views.test.tsx`，日志 `/tmp/mimir-docx-table-drag-fix.log`。
- Office tsc退出0，日志 `/tmp/mimir-docx-table-drag-types.log`；上述4个改动TS文件oxlint零输出、oxfmt通过，日志 `/tmp/mimir-docx-table-drag-{lint,format}.log`；目标diff check通过。
- 产品代码已冻结并通知root可统一构建。本轮未运行全量Office/Web build/全仓check；root尚需真实浏览器复验150%手势增加60屏幕px、单步撤销与下载原件宽度。上述33/33是目标代码回归，不代替浏览器结论。
