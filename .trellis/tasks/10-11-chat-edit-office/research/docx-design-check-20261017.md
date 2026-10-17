# DOCX Design 独立复核

2026-10-17。依据 root 冻结边界及 `docx-design-implementation-20261017.md`，复核主题/字体/色板、原生页面底色与节边框、预览、历史和保存。无嵌套代理，无上传/删除/提交/暂存/归档；root负责宽/420浏览器和HTTP原件实测。

## 来源

- GenOffice固定 `480548fd55f1be3593ee0d8e316a734751d58309`，直接核 `apps/docs/src/renderer/components/ribbon-design-tab.tsx` 四主题、六字体/六色板及box/none页面边框；Mimir保留原生语义及明确复杂原件限制，不扩大为完整Word设计功能。
- 本轮复读 WeKnora 官网缓存 `/tmp/mimir-pptx-chart-weknora-site.html`（HTTP200、v0.8.3）；公开源固定 `3e22822c1d2397be730c458c7539d0eb8c113a24` 的 `/tmp/mimir-pptx-chart-weknora-definitions.go` 中sandbox/wiki门控适用于能力范围。它没有OOXML主题/页面设计的原生补丁合同，不用作Office编辑工具栏主参考。

## 独立发现与修复

1. `docxDesignSource`用双引号、自闭合Relationship正则识别主题关系，且缺theme1时无条件允许有主题关系。实际复现：single-quoted custom、paired custom、dangling default、External default都被错误允许，原生writer可能创建第二条主题关系或修改未实际使用的主题文件。改为现有XML parser读取实际Relationship属性；只允许“原theme1存在+唯一canonical内部关系”，或“theme1与主题关系都不存在”两种安全写入基线。原件其它关系源码不序列化。4条回归先失败后通过；另2条验证canonical单引号/paired关系依然可用、保存后关系原文完全保留。
2. `patchPageBorder`的最短sectPr正则遇到sectPrChange中的嵌套旧sectPr，会把历史pgBorders当当前值删改。回归先失败，修复为显式拒绝带节属性修订的边框目标，并在`applyDocxDesign`发出事务之前预检冻结节XML，错误明确提示先到Word处理修订；单次调用同时改底色也不会部分写入。保存适配同样拒绝，不修改历史边框XML。主题和底色自身不因节属性修订被额外限制。
3. 新增实际Agent句柄回归：先手动设主题/底色/内节边框，再进行Agent正文修改，整轮回退后保存全部ZIP entry等于手动设计基线；Agent之后再手动改底色，旧Agent round不能回退并覆盖后续修改。

初次复现 `/tmp/mimir-docx-design-check-repro.log`（5失败/8通过）；测试接线使用真实平铺findReplace参数，未修改生产Agent接口。

## 审查结论

- 设计属性保存在PM根/节末节点，一次docChanged事务，后续输入独立history；内节边框跟随docxIndex，不能按漂移节序号误写。重复/失效锚点拒绝。
- 保存只补目标pgBorders、theme1和原生background；字体/颜色继承显示不烘焙成直接格式。显式Courier/123456、themeTint和未知XML留存；两次保存、重开、undo/redo全部entry比较通过。
- 暗色修复由实现者完成，本轮纳入最终gate：theme run提供dkColor，页框提供setDkBorder和art/back语义；均为视图效果，不改原生颜色。Editor依赖清理只按根design attrs计算设计选项，已读并纳入组件测试。
- 预览边框层为绝对定位/pointer-events:none，只观察原生页框，不改分页模型；连续节按页首段所属节预览的限制有文案。分页最终仍以Word为准。
- Inspector草稿不dirty、当前值和固定footer、冻结第2节后光标移第1节仍改第2节、全文与清底色、stale禁用、Escape回真实Ribbon入口均有真实组件回归。没有重复视觉打磨。

## 本checker修改文件

- `packages/office/src/docx-design-save.ts`
- `packages/office/src/editors/docx-design.ts`
- `packages/office/src/editors/docx-design.test.ts`

## 门禁

- 8文件 **95/95**：docx-design/DocxDesignControls/docx-toolbar-render/DocxAdvancedControls/DocxListControls/docx-case/docx-references/docx；`/tmp/mimir-docx-design-check-tests.log`。其中新增8条对实现者原87条为重叠追加证据。
- Office tsc通过：`/tmp/mimir-docx-design-check-types.log`。
- 9 TS目标oxlint无警告、10文件oxfmt通过、Antd DocxDesignControls零问题、lint:styles与目标git diff --check通过；`/tmp/mimir-docx-design-check-{lint,format,antd,styles}.log`。

## 交付边界

新增安全拒绝：节属性修订的页面边框、外部或悬空主题关系；原件仍可读且保留。已有自定义主题路径/图形背景/复杂脚本主题字体限制继续明确。真实浏览器root接续；无配置模型未验真实模型调用，Desktop由用户验收。全仓check既有480项技能脚本lint阻断由root记录，本轮不声称解除。
