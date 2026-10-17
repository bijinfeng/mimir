# PPTX 图表主题配色与任意 RGB

2026-10-17。本片实现、专项与静态检查已冻结；根会话负责独立检查、统一构建和真实浏览器宽/420px验收。没有上传/删除测试件、暂存、提交或归档，没有真实模型调用，Desktop 用户自验。

## 边界和固定证据

最小缺口在 `PptxChartAppearance.tsx`：仅四组固定四色方案，系列/点色仅固定选项；共享 `ToolbarColorPicker` 任意当前 RGB 不在选项时显示斜线。沿现有320px图表Inspector、内部滚动与固定“应用图表修改”按钮补齐，不增加面板或第二条工具栏。

主要参考 GenOffice checkout `/tmp/mimir-genoffice-html-git`，本片 `git rev-parse HEAD` 确认 `480548fd55f1be3593ee0d8e316a734751d58309`：

- `apps/slides/src/main/slides-main.ts:1183–1244`：legacy blue/warm/cool/mono各五色；fallback accent1..6；mixHex将通道与黑/白混合并round；chartColorSchemes两组多彩（原六色及旋转三位）与每accent单色梯度（25%黑、原色、25%/45%/65%白）。
- 同文件 `1204–1218` 从首张slide继承链读取deckAccents。本片改为使用当前 `ChartModel.themePalette`，即当前图表所属主题链，避免多主题文件套用第一张主题；parser `packages/pptx-engine/src/chart.ts:860–870` 只在完整六accent时公开此数组。
- `apps/slides/src/renderer/components/Ribbon.tsx:2953–2975` 展示主题scheme；`FormatPane.tsx:2283–2314` 的ColorWell支持系列/点当前颜色并调用point edit。
- 原生 `pptx-engine/src/index.ts:2857–2866` 将点patch覆在原pointColors上，未触及点保留；`2890–2912` 沿colorScheme重建图表。`chart-insert.ts:304–329` 系列颜色写原生spPr，不是主题ID。
- **饼图真实差异**：`pptx-render/src/build-chart.ts:1539–1542` 的varyColors饼图默认按themePalette的point序号取色，series.color不影响自动扇区。只写colorScheme会出现“选择方案但扇区不变”。根会话追加授权了本片最小pie/doughnut适配，见下一节。

按项目要求，本片请求 WeKnora 站点与固定公开源码均HTTP200：`/tmp/mimir-pptx-chart-weknora-site.html`、`/tmp/mimir-pptx-chart-weknora-definitions.go`。公开源码沿任务已固定 v0.8.3 commit `3e22822c1d2397be730c458c7539d0eb8c113a24`；definitions.go:14–22为知识库检索，:35–75为按sandbox capability注册文件/执行工具。它适合真实能力/权限门控，不定义OOXML主题、图表色板或Office工具栏交互，故本片主参考为GenOffice；不复用其Markdown编辑器。

## 改动

- 新 `pptx-chart-colors.ts`：12套实际颜色方案（两组主题多彩、六组主题单色、四组完整五色legacy）、当前系列色/真实pie点色及提交时派生点色的纯适配；原生paletteIdx参与自动系列色。缺少完整合法六accent时使用Office fallback。
- `PptxChartAppearance.tsx`：现有方案Select扩展上述方案、当前色块与RGB文字；系列与点色开启共享自定义RGB。可恢复单个系列原颜色，保留其他系列草稿；可将单点恢复为系列/所选方案/自动颜色。当前值相同时恢复动作有禁用原因。
- pie/doughnut不显示实际上不能改变自动扇区的系列色输入，只保留真实方案和单点工具。已有显式点色优先于方案，面板说明保存后的派生色成为原生显式点色，再次选择方案会保留。
- 草稿中的 `pointColorScheme` 只存方案意图；`pointColors` 只存用户单点编辑。`PptxAdvancedControls.tsx` 最小接缝过滤该内部字段，按当前图表kind、最新数据系列长度计算原生pointColors；不会下发未支持属性。派生点色不反写草稿，切方案会重算，切数据tab不丢意图；“保留当前配色”清除方案意图，手动点改动继续保留。用户null重置表示继承当前方案；未单独指定的新数据点也使用该方案。保存重开后按原生显式override事实处理，没有虚构来源字段。
- `shell/EditorShell.tsx` 新opt-in `allowCustomRgb?: boolean`，回调仍为 `onPick`。局部260px颜色弹层提供可见“自定义 RGB”label、当前值、六位hex校验和“使用颜色”；支持有/无#与大小写输入，统一#RRGGBB。不接受空值、三位、alpha、颜色名、rgb()/CSS。输入不会立即调用，只有合法Enter或显式采用调用一次；Escape丢本地草稿并回焦，inline采用后保持挂载。
- 共用popup只加最近`data-toolbar-popup`识别，属性仅新custom picker面板设置，使嵌套ToolbarMenu内Escape只关闭最近颜色层。旧非opt-in picker值/色名/Tab行为不变。新增局部CSS只布局宽度、分区间距和动作对齐，不覆盖antd外观。

未改PptxEditor、server/shared/vendor，未加依赖。`PptxAdvancedControls.tsx` 原有并行图表类型常量整理保持原样。

## 验证

新增三个测试文件共10项（helper4、共享picker4、真实Editor2），与既有ChartControls/EditorShell合跑：**5文件145/145**。

1. helper验证实际自定义六accent、六组混色精确结果、legacy第五色、native paletteIdx、pie默认与override/null语义、跨方案重算、最新数据长度与不变更输入。
2. 共享picker验证原调用行为、任意当前RGB色块、非法输入不调用、Enter/明确采用一次、键盘Tab可达、嵌套Escape父菜单保留/回焦/重开草稿丢弃、inline与disabled。
3. 真实 `PptxEditor` 使用原生runTxn/save宿主：主题mono-accent3→自定义系列#13579B/点#2468AC，单系列恢复与再次选择、非目标系列及原点#1A2B3C/#F0E1D2保留；未应用前零宿主调用，应用一次。保存重开原生XML含实际RGB、数据值不变；只有chart部件变化，其余ZIP entry精确相等。两次保存稳定，单步undo保存全部entry等于基线，redo全部entry等于修改后。
4. 真实pie：多次切换方案、保留当前撤草稿、手动点色优先/重置继承、切数据tab并增加第三类别。新方案实际写pointColors并在画布SVG显示；已有原点色保留，新增点按最新方案。保存二次稳定、undo/redo全部非目录ZIP entry精确恢复。

门禁：7 TS/TSX文件oxlint无告警、8文件oxfmt、styles、目标diff检查通过。ChartAppearance Antd检查0 issues；共享shell仅原有Select `virtual=false` 性能warning（760行，未触及），没有新增Antd警告。日志 `/tmp/mimir-pptx-chart-colors-{tests,lint,format,styles,antd,shell-antd}.log`。

Office tsc在早期通过；最终并行检查受其他所有者新增的`docx-design.test.ts`类型问题阻断（96行DocDefaults.fontAscii、126–128行Decoration.type），已通知root。本片没有用忽略类型或修改他人的测试消除该阻断。最终状态由root合并门禁确认；未重跑既有480项技能脚本lint失败的全仓check。

视觉沿现行截图 `pptx-chart-inspector-final-wide.png` / `pptx-chart-inspector-final-420.png` 的320px Inspector与固定动作；实际新取色器、方案与颜色当前值尚待root生产构建浏览器验收，不能由组件测试代替。

## 独立 Trellis check（docx_lists，2026-10-17）

独立阅读原生配色派生/helper、PptxChartAppearance与实际ChartEditControls提交接缝、共享RGB状态/弹层、native历史和组件测试。确认pointColorScheme仅在调用前转原生pointColors，不下发未知schema；series paletteIdx、pie自动颜色、点override优先级、null继承、最新数据数量和非目标ZIP保真均有真实覆盖。

发现并修复：custom RGB popup的document capture Escape只dismiss，随后事件继续冒泡到PptxEditor Inspector onKeyDown，导致整个图表面板关闭。新增实际PptxEditor回归先复现失败（编辑图表面板为null），再仅在带data-toolbar-popup的新颜色层分支消费preventDefault+stopPropagation，保持旧非opt-in路径。回归验证颜色层关闭/图表Inspector保留/焦点回实际系列取色入口/无宿主调用；原嵌套ToolbarMenu回归仍通过。

独立最终：5文件145/145、Office tsc、7个目标TS/TSX oxlint、目标oxfmt、styles、git diff --check通过。已从同一原生fixture构造器导出`/tmp/mimir-chart-colors-bar-fixture.pptx`和`/tmp/mimir-chart-colors-pie-fixture.pptx`（仅临时导出测试，已移除；不改变产品）。两件均含自定义六accent，bar有两个系列及原点overrides，pie有原点override，供root实际浏览器上传。全仓480项技能lint阻断仍保留，浏览器宽/420和真实HTTP文件验收由root执行。

## RGB 窄视口定位独立 check（2026-10-17）

root真实420浏览器发现新增RGB弹层底部“使用颜色”不可达，随后仅给`useToolbarPopup`补可选estimatedHeight（默认仍240），custom RGB使用340；新层按实际top或bottom锚点设置`max-height: calc(100dvh - 锚点px - 8px)`。本轮独立审查`EditorShell.tsx`和`ToolbarColorPicker.rgb.test.tsx`，确认只对opt-in RGB覆盖高度，已有overflow-y:auto使底部可滚达，内部滚动由insidePanel保护，外部滚动/resize仍按原逻辑关闭，未修改生产代码。

checker只加强RGB测试：实际420px宽、720px高的上开/下开，以及400px短视口的下开3分支，左右留8px；内部scroll后层保持、合法RGB点击“使用颜色”只回调一次并还焦点；另断言旧非opt-in路径保持240估高和原CSS高度限制。统一restoreAllMocks避免定位断言失败污染后续测试。组件测试不代替真实浏览器布局，root继续确认最终生产截图。

最终5文件 **149/149**：ToolbarColorPicker.rgb、EditorShell、PptxChartColors、PptxChartControls、pptx-chart-colors；Office tsc、两目标TS lint/format、目标git diff --check通过。Antd仅原有760行Select virtual=false性能warning，无新增问题。日志`/tmp/mimir-rgb-viewport-check-{tests,types,lint,format,antd}-20261017.log`。未运行Web build或全量Office，未改其他生产文件、上传、删除、暂存、提交或归档。
