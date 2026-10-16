# PPTX 八主题图库

2026-10-17。最小缺口：现有主题 Inspector 只有十二色/字体表单，没有固定上游的八主题可见预览。范围限 `PptxDeckControls.tsx` 的主题部分、新 `pptx-theme-presets.ts`、局部 CSS、专项测试；root 追加授权 `pptx-metadata.ts` 仅主题名称读取。接口继续使用 metadata/apply，不改 Editor、共享 action、宿主、其他控件或 vendor。

## 参考证据

- GenOffice checkout `/tmp/mimir-genoffice-html-git` HEAD 再核 `480548fd55f1be3593ee0d8e316a734751d58309`。`apps/slides/src/renderer/themes.ts` 固定八套十二色与 Latin 标题/正文字体：Office（Calibri Light/Calibri）、Ember 红韵（Trebuchet MS/Calibri）、Indigo 靛蓝（Segoe UI/Segoe UI）、Forest 森绿（Candara/Candara）、Cream 米黄（Georgia/Georgia）、Rose 蔷薇（Trebuchet MS/Calibri）、Graphite 石墨（Segoe UI/Segoe UI）、Midnight 午夜（Calibri Light/Calibri）。Mimir 只将 hex 补 `#` 适配现有字段；中文名来自 `i18n/ribbon/zh.ts:270–277`，写入原生 name 仍用英文。
- `components/Ribbon.tsx:2051–2079` 的 gallery 用 lt1/dk1 预览底色/文字、majorFont 的 Aa 与强调色缩略；`style-actions.ts:288–310` 将完整颜色及字体交原生 applyTheme，完成后重解析/dirty。
- 原生 `pptx-ops/src/ops/slide-ops.ts:729–787` 先 bake 未保存编辑，替换 theme、映射幻灯片显式颜色，并为无背景页物化 lt1。母版/版式不改；因此正确的保真断言允许原生所需 theme/slide XML 改动，其余 ZIP entry 必须一致，不能错误宣称仅 theme 部件改变。
- `pptx-engine/src/theme-apply.ts:47–72` 写的是 clrScheme@name，保留 theme 根 name，Latin 字体单独替换，East Asian/cs/script 字体保留。现有 metadata 从根 name 读取会丢失自定义方案名称；本次改优先 clrScheme@name、回退根 name/path，接口不变。
- WeKnora v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24` 固定公开源码证据 `/tmp/mimir-pptx-weknora-definitions.go` 再读：search_knowledge/read_document/list_documents、wiki/sandbox 工具，没有 Office theme/Ribbon 模型，本片不以其 Markdown 工具栏为参考。官方站点上次本会话 HEAD 10s 超时，未取得内容；本片沿既有固定源码证据，不将站点记作成功访问。

## 实现与交互

- 紧凑二列八主题按钮，每项显示真实 lt1/dk1、标题字体 Aa 和六强调色。点击仅选择草稿，不执行；当前状态与待应用状态分开，固定 footer 再次显示选中缩略、标题/正文字体和明确应用按钮。
- 按全部十二色和两个 Latin 字体识别匹配，色值大小写归一；不按可编辑名称猜测。任一字段不同是自定义；多个原件主题不一致时明确显示多个/自定义，不误标某一 preset 是整份当前主题。
- 保留原件主题选择、主题名称、基础/强调/链接十二色、任意色输入、标题/正文自定义字体。长表单只在 Inspector 内容内滚动，footer 不随表单滚走；局部 CSS 使用现有主题 token 与 antd 控件，沿既有窄栏覆盖 Inspector。
- 原件主题内容改变时永久重置草稿，A→B→undo(A) 不复活未应用的旧草稿；同内容 metadata 重读保留输入。pending 禁用所有提交/选择入口，失败保留草稿并明确报错。原生宿主已有版本/取消/历史门控，本片继续复用。

## 验证与边界

专项包含八套完整固定数据、真实匹配/自定义/多主题、点击不写与明确提交、失败重试草稿/重复提交禁用、源变更与 undo 草稿不复活；八套经真实 runTxn→savePptx→重开验证十二色/字体/名称及非 theme/slide ZIP entry 不变；原会话两次保存与 undo/save/redo/save 按 entry 全量比较。

产品冻结时实跑：`PptxThemeControls.test.tsx` 6/6（`/tmp/mimir-theme-tests.log`）；原 `PptxEditor.extended-tools.test.tsx -t 'original layout/theme'` 1/1（29 跳过，`/tmp/mimir-theme-editor.log`）。四个相关 TS/TSX 的 Oxlint、五个相关文件 Oxfmt、DeckControls antd lint 均通过；因文件尚未被 git 跟踪，逐文件 `git diff --no-index --check /dev/null <path>` 无空白诊断，exit1 表示有新增差异。Office tsc 最后只被并行 `pptx-manual-paragraph.ts:27/37` 的 align 与 ParagraphFormatPatch 类型不兼容阻断，无主题自有错误；已报 root，整合后由 root 重跑，不记整包类型检查通过。

真实宽区/420px、键盘焦点、主题应用后的画布和下载由 root 统一浏览器验收；组件测试不记实机。预览使用系统可用字体，未安装的 Latin 字体会回退，工具不下载/嵌入字体；保存仍写所选真实字体名，East Asian/cs 原件值按上游保留。不宣称主题图库覆盖母版设计模板或所有 PPTX 能力。
