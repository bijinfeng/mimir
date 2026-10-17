# DOCX 对比与拆分下一纵切片

日期2026-10-17。当前墨迹已进入真实浏览器最后窄修；本文定义后继范围，不表示已实现。

## 证据

主参考固定GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`，`/tmp/mimir-genoffice-html-git`。

- `apps/docs/src/renderer/editor/compare.ts` 1–131：段落LCS、增加/删除/修改清单，明确不是Word合并修订文档。live正文来自Editor JSON，表格旧实现退原preview，不能照抄为Mimir未保存表格对比。
- `review-actions.ts` 279–302：本地选择DOCX后parse比较，密码文件拒绝；`ComparePanel.tsx` 独立只读结果。
- `App.tsx` 1680–1693、6306–6324：拆分是300ms同步的只读HTML镜像、独立滚动、可关闭，不是第二可编辑文档；不能称原生分页副本。
- `styles.css` 9526–9579：上游可编辑大纲只是display:none隐藏非标题，存在隐藏正文选区危险。Mimir本片不移植该实现，后继大纲需先定真实选区/编辑边界。

WeKnora官网与公开源码复用本任务已取得的HTTP200证据：`/tmp/mimir-group-flip-weknora-site.html`；v0.8.3 commit `3e22822c1d2397be730c458c7539d0eb8c113a24` 的 `internal/agent/tools/definitions.go` 位于 `/tmp/mimir-group-flip-weknora-definitions.go`。14–21知识工具、35–49文件能力、69–75wiki范围用于如实能力门控，不提供DOCX本地比较或拆分实现，不作Ribbon视觉模型。

## 最小行为缺口及所有权

缺口是当前Review缺本地比较，View缺同步只读拆分；行为实际位于DocxEditor会话呈现与新本地解析/比较适配。后继实现者独占新增 `docx-compare.ts`、`DocxCompareControls.tsx`、`DocxComparePanel.tsx`、`DocxSplitView.tsx`及局部CSS/tests，DocxEditor/DocxViewControls最小接缝。不改vendor/server/shared/chat/PPTX/PDF，不更改native save/API；墨迹checker先冻结后转交DocxEditor所有权。

## 对比合同

- Review具名「对比文档」入口，320px Inspector。选择本地DOCX仅浏览器内解析，不上传、不改知识库。使用现有BoundedZip/openDocx安全入口；在读取前文件大小门槛，比较前段落/文本/运算预算，具体限制给用户可理解错误；超预算不阻塞主线程或造假截断。
- 当前左侧是未保存live PM内容；右侧是所选文件。用同一提取器比较两侧正文段落/标题及表格实际单元格文字；显式说明不比较格式、页眉脚、批注或修订语义，不能把对象preview当已比较对象内容。保留空段、段落顺序及重复文字，不用textContent拼成一段。
- 初次选择→明确比较。结果显示来源名、当前文档版本和增加/删除/修改统计、差异列表，可切「仅差异/全部」。无差异明确空态；只读结果不提供未经实现的合并/接受按钮。长内容自动换行、列表内部滚动，底部动作固定。
- 冻结doc/session/source/version/所选file token；改稿/切源/重选/关闭永久失效旧结果，迟到解析不得覆盖。不能A→B→A复活。失败保留已选文件供重试，不清dirty/history；对比本身不改变文档JSON/Agent版本/history/save基线。
- Escape最近层关闭并回真实触发器/折叠组/可见tab；折叠菜单打开Inspector即关闭。

## 拆分合同

- View独立toggle「拆分视图」，底部只读副本单独滚动、具名region和关闭按钮。独一EditorContent不卸载；同步live正文显示，明确「只读副本，连续排版」，不能伪装打印页或在镜像上编辑。
- 使用项目既有净化机制；移除重复id/contenteditable/autofocus/交互属性，链接不导航；不把原HTML事件/表单嵌入宿主。不执行外部资源或原件脚本。仅受支持正文预览，可说明复杂对象展示有限。
- 独立滚动不改变主文档焦点/选区/版本/history/dirty。切布局/缩放/阅读、窄420时保留可关闭性与合理最小高度，若容器太矮给明确收起入口而不挤压工具栏。
- 新文档清拆分滚动/旧镜像；关闭不丢主编辑器状态。300ms以内同步可以，cleanup取消旧timer。

## 验证

专项纯对比重复/空段/增删改/预算、未保存表格两侧、坏文件与迟到取消；实际Editor文件选择/折叠组/Escape/版本失效、拆分单一挂载/独立滚动/净化/关闭。对比和拆分后无操作导出全ZIP条目精确；改live再比较、撤销/重做保持正常。

独立checker后root真实浏览器1280/420、本地chooser与当前草稿差异、保存/原件不变实证。只跑目标tests/types/static，不并发fullOffice/Webbuild，不暂存/提交/归档/删除测试件。本片不把保护/可编辑大纲/图片拖裁切/浮动表格定位写成已齐。
