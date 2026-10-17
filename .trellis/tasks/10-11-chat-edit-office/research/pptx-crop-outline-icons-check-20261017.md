# PPTX 裁切、轮廓、图标与图表独立检查（2026-10-17）

## 范围与证据

检查本批 CropCanvas/几何适配、Outline Inspector、固定图标图库、图片任意透明度与90°旋转、12种图表插入及真实 PptxEditor 整合。未把此次检查等同于六格式全部工具完成；未提交、暂存或归档。浏览器宽屏/420px与实际下载由根会话接续；此处仅记录代码、组件及原生字节证据。

- 固定 GenOffice `/tmp/mimir-genoffice-html-git` 的 HEAD 本次实查为 `480548fd55f1be3593ee0d8e316a734751d58309`。核 `insert-presets.ts:55` 的 ICON_GALLERY、Ribbon 图片裁切入口及现有裁切/轮廓研究。独立解析上游与 Mimir 图标 SVG body：**28/28、原始几何集合完全相等**，没有以数量相同的其他图形替代。
- WeKnora 网站本次 HEAD 请求8秒、0字节超时，不记作成功。复核已有固定公开源码证据 `/tmp/mimir-pptx-weknora-definitions.go`，版本 v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24`；14–20行的 search_knowledge/read_document/list_documents 属知识检索与Agent合同，不提供图片裁切、原生轮廓或 Office Ribbon 模型。文件编辑仍以固定 GenOffice 为主。该站此前图标实施者成功取得HTTP200的记录保留在 `pptx-icons-20261017.md`，本次失败不冒充该次成功。

## Findings（已修复）

1. **Inspector 等待宿主时换目标仍可能落下旧写入。** `applyPanelOp(s)` 原来只在开始时核页/目标/版本；关闭面板和换对象未必推进版本。根会话为这两个父级接缝加入请求 AbortController、显式 expectedVersion/signal 与关闭取消。checker 将控制器记录限定为 `{binding,session,controller}`：binding 是 documentId/页/首次元素别名/Inspector 的 JSON 字符串，清理仅取消该上下文拥有的请求；使用事件期间创建的每次请求控制器，避免 StrictMode 重放复用已取消控制器。没有改 PptxApply 公共签名或关闭 React 诊断。正常接受后的版本卸载仍保留成功事实。
2. **新增取消 effect 的 React 诊断。** 仅靠多余依赖的清理 effect 有 exhaustive-effect-dependencies 警告；临时 memo 对象包含可变 session 又触发 preserve-manual-memoization。最终使用上述标量身份与显式 session 所有权，目标 Oxlint 无警告/错误，真实集成回归通过。
3. **图标搜索框沿工具栏180px宽度。** 根会话浏览器发现336px Inspector 中未利用可用宽度。checker 在 `pptx-icon-controls.css` 对过滤区 `.me-input--text` 设置 width:100%/min-width:0，保持现有控件高度、主题与图库布局。最终视觉复核交根会话。
4. **缺少真实 Editor 整合回归。** checker 在 `PptxEditor.extended-tools.test.tsx` 增10个用例，沿真实按钮、原生宿主事务、保存字节及活句柄检查行为；测试不直接调用裁切或轮廓 helper 代替界面整合。

## 新增整合断言

- 初始未升级 creationId 的原件图片：画布裁切键盘微调仅改草稿，Escape 无 dirty/版本/历史并回真实图片裁切 Ribbon 按钮；慢宿主期间自身 busy 不卸载或取消手势。
- 两次 Shift+Arrow 修改左边缘后 apply：原生 srcRect 与 box 同事务落地，右边缘和高度不变；`cx/(1-l)` 与原图比例一致，没有裁切后拉伸。首次 e_cNvPr→GUID 后选择仍可继续编辑。
- 裁切 save→undo/save→redo/save：逐个 ZIP 条目等于原件/第一次已裁切文件，不只比较XML片段。
- 等待裁切时取消、换对象、换页、外部真实文字写入推进版本：请求 signal abort；即使宿主迟到返回有效成功字节，也不落旧裁切。版本、保存状态和历史只反映那次真实文字改动。
- 任意37%透明度、向右90°保存、向左90°再次保存：原生 alpha37000与17%左裁切保持，旋转回0。
- 轮廓 Inspector 读取1pt实线，草稿4.5pt/点划线不 dirty，显式 apply 一次写入；保存与undo/redo逐条目恢复，当前态同步。快捷换色继续保留57150EMU宽度、dashDot与双向箭头。
- 等待轮廓时换对象、换页、关闭Inspector：signal abort；真实宿主迟到有效字节不增加版本、dirty或历史。

## Verification

- 最终 `vitest run` 八文件 **199/199通过**：PptxEditor、extended-tools、selection-tools、CropCanvas、crop helper、Outline、Icon、AiControls。记录 `/tmp/mimir-crop-batch-final-tests-check.log`。前一轮七文件190/190与专项10/10是同批重叠回归，不能相加。
- `pnpm --filter @mimir/office typecheck` **exit0**；最终 `/tmp/mimir-crop-batch-final-tsc-check.log`。
- 18个目标TS/TSX的 Oxlint **exit0**；23个目标代码/CSS的 Oxfmt检查 **exit0**；Icon Antd lint issues空；`check-style-backticks.mjs` **exit0**；目标 diff空白检查 **exit0**。
- 本轮实际重跑 `pnpm check`，最终 **fail，停在lint**：480个错误来自 `.agents/.claude/.github/skills/impeccable/scripts` 的捆绑脚本；另有并行非本批 `packages/renderer/src/components/settings/ProviderForm.tsx:2` 未使用Select导入一项。最终记录 `/tmp/mimir-crop-full-repo-final-check.log`。Office本批不再报错；未擅改技能脚本或并行设置页面。全仓检查不能记作通过，后续全仓门禁未由此命令继续执行。

## Findings（未修复/验收边界）

- 全仓lint上述外部范围问题交根会话处理，不属于本批编辑器实现。
- 浏览器视觉、真实下载与重新打开由根会话负责；happy-dom不证明窄屏布局、指针实际命中或真实图标光栅效果。Desktop按用户指示自行验收；无模型配置，不声称完成真实模型调用。
- 本批保持普通顶层图片/单个可描边对象边界；三维投影/异常原件裁切明确回退数值工具，复杂轮廓填充不能由当前原生writer无损表示时明确拒绝，用户选择纯色后才转换。组内/多对象等整体缺口继续留在现行矩阵，未据此宣布工具全部完成。

已在 editor pitfalls 最近归属处补上 Inspector 取消规则；过程与测试数仅存本记录。

## 浏览器发现后的样式修正复核

根会话浏览器发现并修正两处问题后，checker按限定范围复核，无其他代码改动：

- `PptxOutlineControls.tsx` 的 fieldset/content/actions 与对应CSS统一更名为 `mimir-pptx-outline-controls`。原 `pptx-workspace-views.css` 的 `.mimir-pptx-outline` 有240px侧栏宽度、边框与滚动规则，≤650px还有max-height:180px；新类名不会匹配这些大纲视图选择器，三处TSX类名与全部样式选择器一致，未误改工作区大纲。
- 轮廓、图片裁切、插入图表的 Inspector body 现在显式 `flex-direction:column`。其真实DOM同级为字段面板、pageError/pageStatus；纵向排列让状态占独立行，字段面板仍flex:1、min-height:0、内部滚动且底部动作固定，避免提示文本横向压缩表单。
- `PptxOutlineControls.test.tsx` **7/7通过**，日志 `/tmp/mimir-outline-css-recheck.log`；目标两TSX Oxlint、四文件Oxfmt、目标diff检查均exit0。本次按根会话要求未再跑全仓检查；该7项与前述199项重叠。无新增类型/接口，未重复类型检查。
- 此次代码检查没有发现遗留问题；生产重建后的宽屏/420px实机确认继续由根会话完成，不以happy-dom测试替代布局证据。

## 缺失图片源与可见字段标签最终复核

- 根会话在画布裁切入口增加实际图片源检查：`view.media`和原生元素dataUrl都没有有效来源时禁用，并说明“图片源未加载，请重新打开文档后重试”。checker通过读取真实image-deck夹具、按已解析mediaRef移除ZIP内图片部件构造缺失媒体原件；保留真实p:pic、blip关系与框，不mock解析器或组件。新增Editor用例验证入口禁用/说明、点击不启动透明裁切层、数值裁切仍可用，且无宿主调用/版本/dirty/历史。该次extended文件41/41先通过。
- 根会话发现轮廓、插入图表的字段在普通Ribbon上下文中只展示值，补上既有 `ToolbarPropertyForm columns={1}`。checker核实该Context确实控制可见字段label和分组标题输出，包装仅作用于两个Inspector内容区域。已有轮廓整合测试增加可见宽度/线型/端点标签断言；新增图表面板用例检查实际textContent含类型、标题、系列名、类别、数值名称，避免仅aria-label存在仍被误判通过。
- 最终限定三文件 **130/130通过**：PptxEditor81、extended42、Outline7，日志 `/tmp/mimir-pptx-readability-final-check.log`。Office类型检查exit0（`/tmp/mimir-pptx-readability-final-tsc-check.log`）；三目标TSX Oxlint、六目标代码/CSS Oxfmt、目标diff检查均exit0。这些测试与前述199项有重叠，不能直接累计；未再跑全仓检查。
- 本次checker只新增测试和本记录，没有再修改UI实现；生产浏览器最终确认仍交根会话。

## 裁切反馈位置与 AI 可读指令最终限定复核

- 根会话将裁切反馈条改为 `top:calc(100% + 8px)`，仅在 sheet 内有裁切层时增加120px底部margin。核实外层真实 stage 为 `.me-scroll` 的 `overflow:auto`，sheet没有裁剪规则，裁切层自身未设overflow:hidden；仅SVG画布裁剪其内部绘图。反馈条可位于画布下方并随工作台滚动，画布/裁切坐标不随该margin改变。未发现代码层面的新缺陷；420px与宽屏的实际手柄可达性、按钮换行及底部间距由根会话浏览器验收，不以静态检查代替。
- AI草稿保留自然语言页序、稳定 `s_N` 页面标识和先读取当前未保存内容的约束；未再输出原始slide路径、文档ID、API JSON或版本号。逐页拼写/事实核查保留整稿范围，其余预设保留指定页范围。既有原生会话用例在重新排序后用稳定标识找到页面并读取未保存文字，未用模拟工具回复替代。
- 两个现有AI测试文件 **18/18通过**，使用 `pnpm --filter @mimir/office exec vitest run src/editors/PptxAiControls.test.tsx src/editors/pptx-ai-presets.test.ts`；日志 `/tmp/mimir-pptx-ai-final-bounded-only-check.log`。helper及两测试Oxlint、上述三文件加裁切CSS的Oxfmt、目标diff检查均exit0。本次按根会话限定未重跑类型检查，前次Office类型检查通过记录见上文；未改任何UI/代码。
- 首次误用 `pnpm test --` 后筛选未生效，已中断该意外整包运行，不能作为通过的全包门禁。中断前输出显示 `PptxLocalPanels` 打印说明断言及 `PptxChartControls` 原生行列切换断言失败（无完整失败细节），已向根会话交接；不将其归因为本次CSS/文案变更，也不隐去该观察。记录 `/tmp/mimir-pptx-ai-final-bounded-check.log`。

## 意外整包输出的两项失败限定闭环

根会话授权仅复跑并诊断 `PptxLocalPanels.test.tsx`、`PptxChartControls.test.tsx`。首次正确限定运行19项中18通过：图表14项全部通过，打印测试仍失败，具体为查找已被统一输出面板替换的旧 `打印幻灯片` 按钮得到undefined。没有发现需修改生产代码的问题。

- **打印测试旧流程已同步。** 原测试用空文稿直接查旧按钮；现用真实title-layout原件会话，先检查默认PDF导出的“文字不可选择”说明，再通过“输出操作”选择打印，检查真实“打开打印窗口”主按钮可见且可用，并检查首页预览iframe包含真实SVG。保留可见操作和栅格PDF解释语义，没有仅改成宽松字符串匹配。夹具路径沿同文件环境惯例使用Node路径解析，避免happy-dom全局URL替代Node文件URL。
- **图表测试保存等待已修复。** 独立运行通过，但原行列切换只等40ms即重新打开旧bytes，整包并发慢保存可以越过该时间，且异步finally的setBusy会落在act外。行列切换及同文件applyAndRead现在均在act内等待实际mock宿主apply返回的Promise（它包含原生runTxn和savePptx），再明确检查busy已结束后读取两次保存后的原生图表。原始类别、系列和数值断言全部保留，未改生产图表/Editor代码。
- 最终两文件 **19/19通过**，无act warning；`/tmp/mimir-pptx-panels-chart-fixed-check.log`。两个目标文件Oxlint、Oxfmt、diff检查exit0；Office类型检查exit0（`/tmp/mimir-pptx-panels-chart-fixed-tsc.log`）。未扩大整包/全仓测试。此19项与前述批次有重叠，不能累计。代码与测试再次冻结；本两项风险已闭环，全仓既有门禁失败边界仍保留。
