# XLSX 管理 Inspector 独立检查

2026-10-17，formal trellis-check。对照已批准 `xlsx-manage-inspector-followup-20261017.md`、实现报告 `xlsx-manage-inspector-implementation-20261017.md`、实际 Editor/宿主执行路径与 Office 编辑器规范复核。检查者未操作浏览器，未运行 Web build 或全量 Office；实际布局由 root 统一验收。

## Findings (fixed)

- 文件：`packages/office/src/editors/XlsxObjectManagement.test.tsx`
- 问题：已有17条覆盖主要布局结构与形状原生保存，但未独立覆盖全部四种表格结构入口、图片删除、转普通区域、来源变化时的旧确认，以及 Antd Select 自身的 Escape 消费。
- 修复：新增6条回归（表格参数化4条、图片/转换/确认1条、Select Escape1条），复用既有 `antd-test-dom` 选项驱动；验证确认前零调用、取消零调用、来源变化卸载旧确认，明确确认后调用原有正确操作及目标。Select 测试等待 React 更新，并补 happy-dom 缺失的浏览器 legacy `which=27`，未改生产键盘行为。

未发现需要修改生产代码的缺陷；未更改实现者的五个生产文件、vendor、其他 Agent 所有文件。

## Findings (not fixed)

- **真实1280与420×500布局仍待 root 浏览器验收**：组件测试验证固定 footer 位于 scroll body 外、当前任务仅有一个 primary、空表不显示无效字段；CSS 使用320px border-box、header/navigation/footer不压缩和完整 flex/min-height:0 高度链。但 happy-dom 无布局，不能以此声称标题、六类型tab、当前对象选择及主动作实际在短窗口可见。此项属于 root 已分工的实际效果验收，无本次未修的代码判断项。
- 无其他未修代码问题。图片管理保持原有真实删除能力；本片未新增图片替换，计划中的括号举例不能当成既有能力或本片新增范围。

## 实际路径核对

- 原管理分支的图表属性、系列数据、系列颜色，形状文字/位置/显式颜色，以及图表/形状/图片删除全部保留；结构化表保留增删数据行、增删列与转普通区域。三个图表任务分别投影当前唯一主动作到固定 footer。
- `XlsxEditor` 传入当前 `view` 为sourceKey、文档/表ID为contextKey。管理调用现有带signal的onPivotOperation接缝；Editor补sheetId，校验发布版本、活句柄和工作表，沿原生handle执行并发布一次历史。未另造文档写路径。
- 来源/context/目标/管理任务/卸载变化均取消旧请求；防重复提交使用请求ref，主按钮显式busy，自己的busy不会中断自身。失败保留草稿，过期响应不发布成功反馈。
- 真实shapePreview优先决定填充；gradient/noFill/unsupported无虚构白色选择，theme可解析solid显示真实颜色。未操作填充只改文字不发送fillColor，文字恢复原值清patch。
- 真实Editor测试零变更version/history保持0，渐变形状仅改文字实际执行一次edit_shape/一次history；保存readXlsx读回原生gradient相同。Undo/save全部非目录ZIP条目精确恢复原件，Redo/save全部非目录条目精确恢复首次保存；不声称重新压缩后的完整ZIP字节一致。
- Escape依次处理颜色层、确认层、Antd Select，再处理Inspector；确认Escape返回真实删除触发器且不变文档，Inspector Escape回真实live入口。来源变化卸载确认；无确认的危险操作不会执行。
- 现行编辑器规范已经覆盖320px Inspector、内部scroll/固定动作、原生填充与版本取消，本片没有新增需单独登记的契约或静默坑，未重复扩写spec。

## Verification

- **目标测试：通过，7文件128/128**：`XlsxObjectManagement.test.tsx`（23）、`XlsxShapeGallery.test.tsx`、`XlsxShapeGallery.check.test.tsx`、`XlsxEditor.pivot.test.tsx`、`XlsxEditor.test.tsx`、`XlsxObjectLayer.test.tsx`、`xlsx-shape-preview.test.ts`。最终整组11.85秒，所有进程exit0。
- **Office TypeCheck：通过**，`pnpm --filter @mimir/office typecheck`。
- **Lint：通过**，4个生产/测试TSX scoped oxlint，最终无warning/error。
- **Format：通过**，上述4个TSX与两CSS共6文件oxfmt check。
- **Antd：通过**，3个生产TSX分别lint均0 issues、partial=false。
- **Styles / diff：通过**，`pnpm lint:styles`与`git diff --check`。
- 未重复全仓 `pnpm check`（root已有480项bundled-skill lint基线），未替代root统一build/full suite/browser验收。未暂存、提交、归档、上传或删除测试文档。

## 证据边界与移交

本片是具体生产浏览器失败后的独立代码检查，没有另作竞品调研；沿用已批准的固定GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`文件编辑依据，以及同日缓存WeKnora官方站/公开源v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24`。WeKnora用于知识库/Agent参考，不能决定Office工具栏。没有声称本轮新网络抓取。

代码与本报告冻结。root后续实际核对1280/420×500标题、tabs/选择、body独立滚动、固定唯一主动作、色板/确认真实鼠标及Escape回焦，再同步本片浏览器证据；全工具任务仍进行中。
