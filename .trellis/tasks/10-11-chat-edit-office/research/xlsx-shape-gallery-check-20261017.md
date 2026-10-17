# XLSX 完整形状库独立检查（2026-10-17）

## 范围与结论

独立审查实现者冻结的8文件：ObjectControls、ObjectLayer、ShapeGallery、图库纯适配/CSS及三份专项测试。未发现需修补的生产问题；只新增 `packages/office/src/editors/XlsxShapeGallery.check.test.tsx`，补4项实际 Editor/原生宿主边界回归。生产文件继续保持 freeze。

参考及适用性沿用同片 `xlsx-shape-gallery-20261017.md`：GenOffice固定 `480548fd55f1be3593ee0d8e316a734751d58309`，xlsx-gateway shape-types白名单104项；WeKnora v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24` 站点与definitions源码HTTP200产物位于 `/tmp/mimir-xlsx-shapes-weknora-{site.html,definitions.go}`，权限门控可参考，不提供XLSX形状/Office工具栏模型。此次为代码独立检查，未运行竞品GUI。

## 审查要点

- 图库准确过滤104种原生可插入preset，加既有textbox；PPTX专属连接线不进入工作表。纯适配无unknown→rect回退；gallery与canvas共用实际polygon/path/fillPath/strokePath，固定105项均有有限真实几何。
- Gallery在busy期间保持挂载；取消effect只依赖source/context，避免自身宿主busy导致自取消。请求controller身份、source引用和unmount abort防止迟到消息覆盖新状态。context改变重置草稿，当前工作字节更新保留可复用插入参数。
- 复用当前宿主propose_operations：显式sheetId、publishedVersion和signal；宿主返回后句柄重验取消与version，再解析原件并发布。单次插入一项operation/一次history。两次保存及undo/redo全ZIP部件已有真实回归。
- Inspector局部320px，搜索/分组/已选摘要与单一插入footer固定；body独立滚动，4列图库。真实宽屏与420px由根会话验收，源码和组件测试不替代浏览器。
- 管理提示预设轮廓/复杂填充旋转文字预览有限。未知preset在画布明确显示限制；缺prst的custom geometry仍受旧parser归rect的边界限制，不能宣称任意复杂原件轮廓完整。

## 新增独立回归

1. 真实XlsxEditor发出并由原生宿主计算形状结果，延迟返回期间切换documentId：旧signal abort，新旧句柄version0、history0、当前原件字节不变。
2. 同一真实Editor迟到原生结果期间切到第二工作表：第二表原文可见，旧signal abort，结果不发布、不变脏。
3. 原生宿主返回错误version：当前字节/history不变，心形、位置和文字草稿保留；真实重试仍用expectedVersion0，成功后只增加一次history且原生形状/锚点正确。
4. 原件含`rot="1800000"`、`flipH="1"`和自定义`adj`级别；实际画布选中显示预览限制，再插入cloudCallout后原`xdr:sp`全文精确保留，原形状和新形状共存。

## 检查结果

- 原6文件93项，加独立4项：**7文件97/97**。日志 `/tmp/mimir-xlsx-shapes-check-tests.log`。
- 独立文件最后重跑 **4/4**：`/tmp/mimir-xlsx-shapes-check-independent.log`。
- Office `pnpm exec tsc --noEmit` exit0；8个TS/TSX目标oxlint无告警；9文件oxfmt、styles、Antd lint（0issues）、目标diff whitespace通过。日志 `/tmp/mimir-xlsx-shapes-check-{types,lint,format,styles,antd}.log`。
- 未运行新的全仓check；既有480项bundled技能脚本lint阻断不声明消失。
- 未修改生产、server/shared/vendor，未构建/上传/删除测试件、提交、暂存或归档。
- 根会话继续真实宽/420及原件下载闭环。模型未配置未验；Desktop由用户验收。整体任务继续进行。

## 浏览器定位缺陷修复的独立复核

2026-10-17 接续。主会话实际浏览器发现：原生 D10 锚点正确，但模型默认20px行高/24px表头与真实27px表头、首行32px、内容行28.046875px不一致。实现者已冻结 `XlsxObjectLayer.tsx`、新增 `xlsx-object-layout.ts` / `.test.tsx` 及 conventions§8 的对应合同。

复核没有发现需要再次修改的问题，本次未改生产代码或测试：

- 测量当前 stage 的直接表格及普通流 `colgroup > col` / `tbody > tr`，按渲染时相同的隐藏项过滤顺序映射回原生 `column.col` / `row.number - 1`。没有拿 sticky 单元格或合并格矩形作为锚点，也没有假设稀疏数组下标就是 Excel 坐标。
- DOM 矩形减 stage 原点、除 stage CSS zoom；EMU offset 沿9525/px，滚动共同平移消去。75%/100%/150%、小数 offset 与非默认轨道大小已有专项覆盖。隐藏/未物化轨道取下一可见边界，完全折叠跨度不再画24px最小假矩形。
- 每个 sheet 的 metrics 状态带对象身份校验；切 sheet 时不会套用旧 metrics。layout effect 在新 DOM 提交后测量；ResizeObserver 覆盖 table/行/列，style MutationObserver 处理缩放，窗口 resize 重测；清理 disconnect 两类观察器和事件。没有对象不安装观察器；微小浮点噪声不会重复更新状态。
- 无真实布局或 DOM 轨道数量无法对应模型时保留模型回退。回退仍只用于有限预览；200列/1000行/20000格等既有物化边界外不承诺完整对象位置。
- 纯坐标适配不改 sheet、visual.anchor、宿主请求或文件字节；XlsxEditor 原件与版本/history路径没有改动。stage 的原有最小尺寸估算仍沿既有调用，当前表格本身提供实际普通流尺寸。

独立最小门禁：ObjectLayer + layout **2文件9/9**；3文件 oxlint/oxfmt、目标 diff whitespace通过。Office tsc已在本次并行readonly测试修正后独立重跑 exit0，日志 `/tmp/mimir-docx-case-check-types.log`；布局目标日志 `/tmp/mimir-xlsx-shape-layout-check-{tests,lint,format}.log`。实现者报告的7文件100/100为其整合证据，本次不重复扩测或叠加计数。

冻结交回主会话统一构建与真实浏览器 D10、420px、缩放验收。没有用组件矩形mock代替真实浏览器复验，没有上传/删除测试件、提交、暂存或归档。
