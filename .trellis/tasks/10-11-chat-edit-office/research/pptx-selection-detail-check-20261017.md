# PPTX 详细选择工具独立复核（2026-10-17）

后续状态：本记录的裸组内flip保存缺口已在同日下一片修复；真实Agent/host、两次保存与历史已通过，见 `pptx-selection-fill-check-20261017.md`。下文保留本片当时的复核快照。

## 范围与来源

独立 trellis-check 复核根会话的批注组件/Deck复用、Editor快捷键与对象属性分类，以及已冻结的批量段落/列表/轮廓与单对象/直接组成员几何适配。没有改vendor、模型白名单、宿主公共接口，未重复改动其他工作者文件。

主参考仍为固定GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`。来源路径与原生执行语义核对见同目录 `pptx-bulk-format-20261017.md`、`pptx-group-geometry-20261017.md`。WeKnora固定v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24` 的知识检索/文档工具证据沿 `pptx-group-agent-20261017.md`，适用于知识库Agent工具职责，不提供Office Ribbon或组内坐标模型。本轮是既有实施的代码复核，没有新增外部调研结论。

## 已修复

- `PptxCommentControls.tsx`：primary ToolbarButton会自动追加label，原children重复写同一主动作文字，导致按钮出现重复文字。保留图标及原label“添加本页批注”。
- 同组件：成功添加后若原输入因busy禁用掉到BODY，恢复可继续输入的textarea焦点；等待本地busy与外部disabled均解除，只在BODY或自身后代仍聚焦时恢复，异步成功不得抢外部button焦点。根会话同时把新增批注Inspector key稳定到documentId+slidePath；已验接受后清草稿、保存后保留下一条尚未应用草稿和焦点。
- `PptxEditor.multi-selection.test.tsx`：补真实严格宿主的原生批注添加/删除、保存后undo/redo逐ZIP entry比对；关闭/换对象取消延迟宿主，原版本、clean、history保持；快捷键来源回焦与异步不抢外部焦点。
- `PptxTableControls.test.tsx`：旧late-success用例以固定35ms猜宿主已发布版本，实际原生读写未必完成，导致后输入草稿被正确的版本更新清除，且失败后原promise尝试render已卸载root。改为等待originalApply实际完成发布的Promise再建立新草稿，没有修改生产Table。
- `PptxEditor.extended-tools.test.tsx`：旧pending-crop selection用例绕过真实覆盖层直接click底层SVG，与现行明确隔离行为不符。根会话确认保留overlay与canvas guard；现验底层click不穿透、不改选择或abort，对象树可打开但所有行在pending中锁定，尝试点击仍不换对象；再由显式取消中止请求并拒绝迟到原生字节。不宣称已验证pending对象切换。
- `.trellis/spec/office/frontend/editors/pitfalls.md`：补新增批注页级草稿与条件回焦的稳定key合同。

## 代码路径结论

- 详细段落/列表仅解析显式草稿，未改字段不转换原件固定pt/百分比；单独改bulletFont按每个对象自己的统一glyph构造命令，不复制第一个对象的字符；同对象混合glyph明确要求先选择字符。图片符号保持原件，不假装已提供严格批量图片替换。
- 轮廓逐对象保留原Stroke细节；原件未知编号/线型以只读当前项呈现。`pptx-outline.ts`纯helper提取，旧组件保留import/reexport API与原有生成行为；真实server测试不再依赖TSX UI模块。
- 几何显式区分幻灯片与父组合局部坐标，未编辑字段保留原整数EMU。直接成员带group写入，表格仅尺寸变化重分配网格。组内flip在同一原子批次后补显式setTransform刷新父XML，测试覆盖父chOff/chExt、缩放、旋转、翻转与兄弟XML隔离；顶层组合变换不重写成员XML。
- 对象属性两个大分类保持挂载，并用明确hidden CSS覆盖display:flex；分类切换纳入根请求绑定，忙态禁用切换。内层四个格式页签共用草稿与固定底部动作。

## 独立门禁

- Office九文件合并 **58/58**：multi-selection、selection helper/Controls、OutlineControls、geometry helper/UI、GroupText、SelectionCanvas、LocalPanels。日志 `/tmp/mimir-pptx-selection-detail-combined-tests.log`。
- 新server真handle→真host专项 **2/2**，只mock文档lookup，不跑DB setup。命令使用 `/tmp/pptx-three-slice-vitest.config.mjs`，日志 `/tmp/mimir-pptx-selection-detail-host-tests.log`。
- Office与Server `tsc --noEmit`通过；16个目标TS/TSX的Oxlint、20个目标文件Oxfmt、`pnpm lint:styles`通过。日志前缀 `/tmp/mimir-pptx-selection-detail-`。
- 旧Table late-success修正后定向 **1/1**通过、12 skipped，无unhandled；日志 `...-table-race.log`。不把这些重叠轮次累计为总测试数。
- 两个旧失败专项修正后联合定向 **5/5**通过、50 skipped，无unhandled，覆盖Table late-success及crop cancel/locked-selection-then-cancel/page/version；日志 `...-prior-failures-fixed.log`。生产裁切行为未为测试放宽。
- 根会话最后把批注时间改为zh-CN年月日时分，保留dateTime原值、无效日期原文fallback，复核无问题；最终Comment相关挂载 **14/14**、Office tsc及跟进3文件Oxlint/Oxfmt再次通过。日志 `...-final-comment-tests.log`、`...-followup-*.log`；与前述58条重叠，不累计。
- scoped `git diff --check -- packages/office/src/editors apps/server/src/test/pptx-selection-format-host.test.ts`通过。全仓diff仍由另两任务研究文档EOF空行阻断（`10-13-pptx-agent-manual/research/ribbon-local-audit.md:335`、`10-16-genoffice-editor-capability-audit/research/validation-20261016-continuation.md:396`），未改它们。
- 本会话前片实际全仓`pnpm check`被新增Impeccable脚本480项错误阻断，见 `pptx-global-selection-check-20261017.md`；本轮未重复宽跑，不能宣称全仓check通过。

## 尚待根会话处理/确认

- 原生Agent单独组内`flipElements`未刷新父XML的缺口仍存在。本次几何UI显式batch修复可保存，但不代表通用Agent裸flip已修复；应后续统一宿主适配实际修复，不能以新增拒绝代替执行。
- 根会话负责最终build、宽屏/420px浏览器、实际下载闭环。本checker没有声称已做浏览器实测、真实模型或Desktop。用户要求代码与浏览器验收，模型未配置，Desktop由用户自行验收。总体任务仍in_progress，未提交/暂存/归档。
