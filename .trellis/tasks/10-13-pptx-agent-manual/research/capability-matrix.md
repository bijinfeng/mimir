# PPTX 能力逐项矩阵（实施中，2026-10-13）

固定 GenOffice 版本：`480548fd55f1be3593ee0d8e316a734751d58309`。上游源码临时副本来自父任务调研，目录 `/tmp/mimir-genoffice-pinned/`；工具清单以 `apps/slides/src/renderer/ai/slides-skill.ts`，操作以 `packages/pptx-ops/src/prompts/ops/*.md` 为准。Mimir 执行证据是 `packages/office/src/agent/pptx-agent.test.ts`（3 例）及原有 `PptxEditor.test.tsx`、`pptx-structure.test.ts`。`packages/office/src/agent/pptx-agent.ts` 的 7 项浏览器本地操作与 `apps/server/src/services/pptx-agent-host.ts` 的固定上游 `runTxn` 共存；后者接受 61 项 AI-callable 操作，但目前只有代表性操作经过真实原件读回。

状态说明：「本地已验」= 本地执行和聚焦测试覆盖；「宿主可调用，未逐项验」= 固定版 runTxn 已接通但该操作尚无独立保存读回证据。浏览器与桌面共用 HTTP 路由，新增对象层级/翻转/背景/隐藏命令尚未分别实测。非 AI-callable 操作仍被宿主拒绝。表格单元格手动编辑已通过组件与宿主保存读回。图表手动插入要求用户逐项填写类别和有限数值，固定声明 `dataSource:'user'`，只支持单系列柱状/折线/饼图；现有图表编辑仍未接。不能通过新增后删除模拟编辑，因为会改变图表身份、层级和关系。

## 顶层 Agent 工具（17）

| 上游工具 | 模型可调用 | Mimir Agent | 执行/两端 | 读回与失败证据 |
| --- | --- | --- | --- | --- |
| `read_slide` | 是 | 已接 | 画布本地；两端 E2E 待验 | 聚焦测试；错误为结构化失败 |
| `execute_slide_script` | 是 | 未接 | 待实现宿主或画布执行；两端未验 | 目录不注册；不可调用 |
| `web_search` | 是 | 未接 | 待实现宿主或画布执行；两端未验 | 目录不注册；不可调用 |
| `image_search` | 是 | 未接 | 待实现宿主或画布执行；两端未验 | 目录不注册；不可调用 |
| `generate_image` | 是 | 未接 | 待实现宿主或画布执行；两端未验 | 目录不注册；不可调用 |
| `analyze_media` | 是 | 未接 | 待实现宿主或画布执行；两端未验 | 目录不注册；不可调用 |
| `insert_web_image` | 是 | 未接 | 待实现宿主或画布执行；两端未验 | 目录不注册；不可调用 |
| `replace_image` | 是 | 未接 | 待实现宿主或画布执行；两端未验 | 目录不注册；不可调用 |
| `ask_clarification` | 是 | 未接 | 待实现宿主或画布执行；两端未验 | 目录不注册；不可调用 |
| `plan_deck` | 是 | 未接 | 待实现宿主或画布执行；两端未验 | 目录不注册；不可调用 |
| `regenerate_slide` | 是 | 未接 | 待实现宿主或画布执行；两端未验 | 目录不注册；不可调用 |
| `generate_deck` | 是 | 未接 | 待实现宿主或画布执行；两端未验 | 目录不注册；不可调用 |
| `save_style_template` | 是 | 未接 | 待实现宿主或画布执行；两端未验 | 目录不注册；不可调用 |
| `list_style_templates` | 是 | 未接 | 待实现宿主或画布执行；两端未验 | 目录不注册；不可调用 |
| `edit_chart` | 是 | 未接 | 待实现宿主或画布执行；两端未验 | 目录不注册；不可调用 |
| `apply_ops` | 是 | 已接 | 画布本地；两端 E2E 待验 | 聚焦测试；错误为结构化失败 |
| `load_guide` | 是 | 已接 | 画布本地；两端 E2E 待验 | 聚焦测试；错误为结构化失败 |

## 编辑操作（71；其中模型可调用 61）

| 上游组/操作 | 模型可调用 | 修改原件 | Mimir 手动入口 | Mimir Agent / 共用执行器 | 两端可达性 | 原件读回 / 失败 |
| --- | --- | --- | --- | --- | --- | --- |
| `text/setText` | 是 | 是 | 文字框段落输入 | 已接：PptxEditSession 补丁/结构 | 共用代码；E2E 待验 | 聚焦测试含代表性保存重开；逐项夹具待补 |
| `text/setFont` | 是 | 是 | 文字工具栏（整段字形） | 已接：PptxEditSession 补丁/结构 | 共用代码；E2E 待验 | 聚焦测试含代表性保存重开；逐项夹具待补 |
| `text/setParagraphFormat` | 是 | 是 | 未接/未逐项验 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 仅 setFill 有独立宿主保存读回；本项未逐项验 |
| `text/insertEquation` | 是 | 是 | 未接/未逐项验 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 仅 setFill 有独立宿主保存读回；本项未逐项验 |
| `element/deleteElement` | 是 | 是 | 对象菜单：删除确认 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 手动命令已接；本项保存读回/两端待验 |
| `element/setFill` | 是 | 是 | 对象菜单：填充/无填充 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 宿主测试与真实菜单组件测试：保存重开、主题条目不变；两端待验 |
| `element/setStroke` | 是 | 是 | 对象菜单：轮廓/无轮廓 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 手动命令已接；本项保存读回/两端待验 |
| `element/setTransform` | 是 | 是 | 对象菜单：位置和大小 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 手动命令已接；本项保存读回/两端待验 |
| `element/setConnectorEndpoints` | 是 | 是 | 未接/未逐项验 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 仅 setFill 有独立宿主保存读回；本项未逐项验 |
| `element/flipElements` | 是 | 是 | 对象菜单：水平/垂直翻转，显示当前状态 | 固定版 runTxn；与 Agent 共用 `apply_ops` | 共用 HTTP；两端 E2E 待验 | 组件测试点水平翻转，保存 OOXML `flipH` 并重开读回；垂直方向待逐项验 |
| `element/setPictureSrcRect` | 是 | 是 | 未接/未逐项验 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 仅 setFill 有独立宿主保存读回；本项未逐项验 |
| `element/setPictureOpacity` | 是 | 是 | 选中图片菜单：100/75/50/25% | 固定版 runTxn；与 Agent 共用 `apply_ops` | 共用 HTTP；两端 E2E 待验 | 组件测试点 50%，SVG 立即更新；保存含 `<a:alphaModFix>` 并重开读回；宿主不可用及失败保持原画布 |
| `element/reorderElement` | 是 | 是 | 对象菜单：顶层/底层/前后一级，边界禁用 | 固定版 runTxn；与 Agent 共用 `apply_ops` | 共用 HTTP；两端 E2E 待验 | 组件测试点置于顶层，保存 XML 顺序并重开读回；其他方向待逐项验 |
| `element/groupElements` | 是 | 是 | 未接/未逐项验 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 仅 setFill 有独立宿主保存读回；本项未逐项验 |
| `element/ungroupElement` | 是 | 是 | 未接/未逐项验 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 仅 setFill 有独立宿主保存读回；本项未逐项验 |
| `element/setShapeGeometry` | 是 | 是 | 未接/未逐项验 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 仅 setFill 有独立宿主保存读回；本项未逐项验 |
| `element/setShapeAdjust` | 是 | 是 | 未接/未逐项验 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 仅 setFill 有独立宿主保存读回；本项未逐项验 |
| `element/setShapeCustomGeometry` | 是 | 是 | 未接/未逐项验 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 仅 setFill 有独立宿主保存读回；本项未逐项验 |
| `element/setTextAnchor` | 是 | 是 | 未接/未逐项验 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 仅 setFill 有独立宿主保存读回；本项未逐项验 |
| `element/setTextBodyProps` | 是 | 是 | 未接/未逐项验 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 仅 setFill 有独立宿主保存读回；本项未逐项验 |
| `element/setEffects` | 是 | 是 | 未接/未逐项验 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 仅 setFill 有独立宿主保存读回；本项未逐项验 |
| `element/setLink` | 是 | 是 | 未接/未逐项验 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 仅 setFill 有独立宿主保存读回；本项未逐项验 |
| `element/alignElements` | 是 | 是 | 未接/未逐项验 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 仅 setFill 有独立宿主保存读回；本项未逐项验 |
| `element/distributeElements` | 是 | 是 | 未接/未逐项验 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 仅 setFill 有独立宿主保存读回；本项未逐项验 |
| `element/setImageFill` | 否（上游标记） | 是 | 未接/未逐项验 | 未接：执行器缺失 | 未可达 | 不注册可执行；调用明确失败 |
| `insert/addElement` | 是 | 是 | 对象菜单：文本框/矩形 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 手动命令已接；本项保存读回/两端待验 |
| `insert/addConnector` | 是 | 是 | 未接/未逐项验 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 仅 setFill 有独立宿主保存读回；本项未逐项验 |
| `insert/addPicture` | 否（上游标记） | 是 | 插入工具栏：本地 PNG/JPEG 文件 | 独立手动媒体路由调用固定版 runTxn；Agent `apply_ops` 仍拒绝图片字节操作 | 共用 HTTP；两端 E2E 待验 | 组件测试 SVG、保存媒体与重开；宿主测试 PNG/JPEG、尺寸比例与 multipart；失败保持原画布 |
| `insert/replacePicture` | 否（上游标记） | 是 | 选中图片菜单：替换本地 PNG/JPEG | 独立手动媒体路由调用固定版 runTxn；Agent `apply_ops` 仍拒绝图片字节操作 | 共用 HTTP；两端 E2E 待验 | 组件测试 SVG 更新、保存媒体及重开；宿主测试旧对象锚点失效与媒体字节读回 |
| `insert/addTable` | 是 | 是 | 插入工具栏：6×6 尺寸网格 | 固定版 runTxn；与 Agent 共用 `apply_ops` | 共用 HTTP；两端 E2E 待验 | 组件测试点 2×3、SVG 显示、保存原生 `<a:tbl>` 并重开；宿主不可用及失败保持原画布 |
| `insert/addChart` | 是 | 是 | 插入工具栏：用户明确输入的单系列柱状/折线/饼图 | 固定版 runTxn；与 Agent 共用 `apply_ops`，手动声明 `dataSource:'user'` | 共用 HTTP；两端 E2E 待验 | 组件测试数据校验、SVG 可见、原生图表与数据读回、二次保存保留；宿主测试图表原件读回和无来源拒绝；失败不改画布及输入 |
| `insert/addSmartArt` | 是 | 是 | 未接/未逐项验 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 仅 setFill 有独立宿主保存读回；本项未逐项验 |
| `insert/addMedia` | 否（上游标记） | 是 | 未接/未逐项验 | 未接：执行器缺失 | 未可达 | 不注册可执行；调用明确失败 |
| `insert/addModel3d` | 否（上游标记） | 是 | 未接/未逐项验 | 未接：执行器缺失 | 未可达 | 不注册可执行；调用明确失败 |
| `insert/pasteElements` | 否（上游标记） | 是 | 未接/未逐项验 | 未接：执行器缺失 | 未可达 | 不注册可执行；调用明确失败 |
| `table/setTableCell` | 是 | 是 | 选中表格的对象菜单：按行、列、段落编辑现有文字 | 固定版 runTxn；与 Agent 共用 `apply_ops` | 共用 HTTP；两端 E2E 待验 | 组件测试当前值/禁用原因、SVG 更新、混合格式多段多 run 保存重开；宿主测试独立读回与主题保真；失败保留原画布及草稿 |
| `table/tableMerge` | 是 | 是 | 未接/未逐项验 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 仅 setFill 有独立宿主保存读回；本项未逐项验 |
| `table/tableStructure` | 是 | 是 | 未接/未逐项验 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 仅 setFill 有独立宿主保存读回；本项未逐项验 |
| `table/setTableRowHeight` | 是 | 是 | 未接/未逐项验 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 仅 setFill 有独立宿主保存读回；本项未逐项验 |
| `table/setTableCellAnchor` | 是 | 是 | 未接/未逐项验 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 仅 setFill 有独立宿主保存读回；本项未逐项验 |
| `table/setTableColWidth` | 是 | 是 | 未接/未逐项验 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 仅 setFill 有独立宿主保存读回；本项未逐项验 |
| `table/setTableStyle` | 是 | 是 | 未接/未逐项验 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 仅 setFill 有独立宿主保存读回；本项未逐项验 |
| `table/setChart` | 否（上游标记） | 是 | 未接/未逐项验 | 未接：执行器缺失 | 未可达 | 不注册可执行；调用明确失败 |
| `slide/deleteSlide` | 是 | 是 | 缩略图侧栏删除 | 已接：PptxEditSession 补丁/结构 | 共用代码；E2E 待验 | 聚焦测试含代表性保存重开；逐项夹具待补 |
| `slide/duplicateSlide` | 是 | 是 | 缩略图侧栏复制 | 已接：PptxEditSession 补丁/结构 | 共用代码；E2E 待验 | 聚焦测试含代表性保存重开；逐项夹具待补 |
| `slide/addBlankSlide` | 是 | 是 | 缩略图侧栏新增 | 已接：PptxEditSession 补丁/结构 | 共用代码；E2E 待验 | 聚焦测试含代表性保存重开；逐项夹具待补 |
| `slide/addSlideWithLayout` | 是 | 是 | 未接/未逐项验 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 仅 setFill 有独立宿主保存读回；本项未逐项验 |
| `slide/pasteSlide` | 否（上游标记） | 是 | 未接/未逐项验 | 未接：执行器缺失 | 未可达 | 不注册可执行；调用明确失败 |
| `slide/insertSlidePptx` | 否（上游标记） | 是 | 未接/未逐项验 | 未接：执行器缺失 | 未可达 | 不注册可执行；调用明确失败 |
| `slide/moveSlide` | 是 | 是 | 缩略图侧栏排序 | 已接：PptxEditSession 补丁/结构 | 共用代码；E2E 待验 | 聚焦测试含代表性保存重开；逐项夹具待补 |
| `slide/setSlideLayout` | 是 | 是 | 未接/未逐项验 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 仅 setFill 有独立宿主保存读回；本项未逐项验 |
| `slide/setBackground` | 是 | 是 | 对象菜单：本页纯色背景/重置 | 固定版 runTxn；与 Agent 共用 `apply_ops` | 共用 HTTP；两端 E2E 待验 | 组件测试点纯色，保存并重开读回；渐变/图片/图形背景待接手动及逐项验 |
| `slide/setHidden` | 是 | 是 | 对象菜单：放映中隐藏/显示，状态标记 | 固定版 runTxn；与 Agent 共用 `apply_ops` | 共用 HTTP；两端 E2E 待验 | 组件测试点隐藏，保存 `show="0"`、画布显示状态并重开读回；显示方向待逐项验 |
| `slide/setTransition` | 是 | 是 | 对象菜单：淡入/无切换 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 手动命令已接；本项保存读回/两端待验 |
| `slide/setAdvanceTime` | 是 | 是 | 未接/未逐项验 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 仅 setFill 有独立宿主保存读回；本项未逐项验 |
| `slide/setAnimations` | 否（上游标记） | 是 | 未接/未逐项验 | 未接：执行器缺失 | 未可达 | 不注册可执行；调用明确失败 |
| `slide/addAnimation` | 是 | 是 | 未接/未逐项验 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 仅 setFill 有独立宿主保存读回；本项未逐项验 |
| `slide/removeAnimation` | 是 | 是 | 未接/未逐项验 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 仅 setFill 有独立宿主保存读回；本项未逐项验 |
| `slide/reorderAnimation` | 是 | 是 | 未接/未逐项验 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 仅 setFill 有独立宿主保存读回；本项未逐项验 |
| `slide/setNotes` | 是 | 是 | 未接/未逐项验 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 仅 setFill 有独立宿主保存读回；本项未逐项验 |
| `slide/addComment` | 是 | 是 | 未接/未逐项验 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 仅 setFill 有独立宿主保存读回；本项未逐项验 |
| `slide/deleteComment` | 是 | 是 | 未接/未逐项验 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 仅 setFill 有独立宿主保存读回；本项未逐项验 |
| `deck/setSlideSize` | 是 | 是 | 未接/未逐项验 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 仅 setFill 有独立宿主保存读回；本项未逐项验 |
| `deck/findReplace` | 是 | 是 | 查找替换栏 | 已接：PptxEditSession 补丁/结构 | 共用代码；E2E 待验 | 聚焦测试含代表性保存重开；逐项夹具待补 |
| `deck/applyHeaderFooter` | 是 | 是 | 未接/未逐项验 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 仅 setFill 有独立宿主保存读回；本项未逐项验 |
| `deck/setSections` | 是 | 是 | 未接/未逐项验 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 仅 setFill 有独立宿主保存读回；本项未逐项验 |
| `deck/applyTheme` | 是 | 是 | 未接/未逐项验 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 仅 setFill 有独立宿主保存读回；本项未逐项验 |
| `deck/addSection` | 是 | 是 | 未接/未逐项验 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 仅 setFill 有独立宿主保存读回；本项未逐项验 |
| `deck/renameSection` | 是 | 是 | 未接/未逐项验 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 仅 setFill 有独立宿主保存读回；本项未逐项验 |
| `deck/removeSection` | 是 | 是 | 未接/未逐项验 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 仅 setFill 有独立宿主保存读回；本项未逐项验 |
| `deck/moveSection` | 是 | 是 | 未接/未逐项验 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 仅 setFill 有独立宿主保存读回；本项未逐项验 |

## 上游 Ribbon 手动回调入口

来源：`apps/slides/src/renderer/components/Ribbon.tsx`（上述固定 commit）中 `Ribbon({...}: Props)` 的回调。这里按回调逐项列出，避免将视图、文件或提示动作误算作写入。回调还须追到 `App.tsx` 实现与保存路径；「待追踪」代表尚未完成该验收。

| 上游回调 | 分类（暂按名称） | Mimir 手动入口/执行器 | 两端及读回 |
| --- | --- | --- | --- |
| `onAutoSaveChange` | 文件/外部 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onOpen` | 文件/外部 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onSave` | 文件/外部 | 保存 | 聚焦测试或既有编辑器测试；两端 E2E 待验 |
| `onUndo` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onRedo` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onSaveAs` | 文件/外部 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onExportPdf` | 文件/外部 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onPrint` | 文件/外部 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onExportImages` | 文件/外部 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onFormat` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onZoom` | 视图/交互 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onToggleThumbs` | 视图/交互 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onToggleAi` | 视图/交互 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onAiPreset` | 提示/生成 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onPickShape` | 编辑候选，待追踪 | 对象菜单：矩形（部分） | 真实菜单组件测试仅覆盖填充；其余读回及两端待验 |
| `onInsertImage` | 编辑候选，待追踪 | 插入工具栏：本地 PNG/JPEG；独立手动媒体路由 | 组件与宿主保存读回；两端 E2E 待验 |
| `onFormatBackground` | 编辑候选，待追踪 | 对象菜单：纯色/重置（部分） | 组件测试纯色保存读回；渐变/图片待验，两端待验 |
| `onApplyTheme` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onAddSlide` | 编辑候选，待追踪 | 新增页 | 聚焦测试或既有编辑器测试；两端 E2E 待验 |
| `onAddSlideWithLayout` | 编辑候选，待追踪 | 新增空白页（仅当前版式） | 聚焦测试或既有编辑器测试；两端 E2E 待验 |
| `onAddSection` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onToggleFormat` | 视图/交互 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onCopy` | 编辑候选，待追踪 | 缩略图复制/画布文本复制（部分） | 聚焦测试或既有编辑器测试；两端 E2E 待验 |
| `onCut` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onPaste` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onFormatBrushClick` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onFormatBrushDoubleClick` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onTextColor` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onFontFamily` | 编辑候选，待追踪 | 字形菜单 | 聚焦测试或既有编辑器测试；两端 E2E 待验 |
| `onFontSize` | 编辑候选，待追踪 | 字号输入 | 聚焦测试或既有编辑器测试；两端 E2E 待验 |
| `onAlign` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onDirection` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onStrike` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onTextToggle` | 编辑候选，待追踪 | 加粗/斜体/下划线菜单 | 聚焦测试或既有编辑器测试；两端 E2E 待验 |
| `onElementTextColor` | 编辑候选，待追踪 | 文字颜色 | 聚焦测试或既有编辑器测试；两端 E2E 待验 |
| `onFindReplace` | 编辑候选，待追踪 | 查找替换栏 | 聚焦测试或既有编辑器测试；两端 E2E 待验 |
| `onToggleAnimByParagraph` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onSetLayout` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onResetLayout` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onSlideSize` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onParagraphFormat` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onInsertTable` | 编辑候选，待追踪 | 插入工具栏：6×6 尺寸网格，调用共用 `addTable` | 组件保存原生表格并重开；两端 E2E 待验 |
| `onTransition` | 编辑候选，待追踪 | 对象菜单：淡入/无切换（部分） | 真实菜单组件测试仅覆盖填充；其余读回及两端待验 |
| `onApplyAnimation` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onAnimHoverPreview` | 视图/交互 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onAnimHoverEnd` | 视图/交互 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onAddAnimation` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onApplyMotionPath` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onAnimTiming` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onToggleAnimPane` | 视图/交互 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onAnimPreview` | 视图/交互 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onSlideShow` | 视图/交互 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onPresenterView` | 视图/交互 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onCustomShow` | 视图/交互 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onRehearse` | 视图/交互 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onToggleHidden` | 编辑候选，待追踪 | 对象菜单：隐藏/显示 | 组件测试隐藏保存读回；两端待验 |
| `onInkTool` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onInkPen` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onInkHighlighter` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onInkClearAll` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onViewMode` | 视图/交互 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onSlideMaster` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onZoomFit` | 视图/交互 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onToggleRuler` | 视图/交互 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onToggleGrid` | 视图/交互 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onToggleGuides` | 视图/交互 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onToggleNotes` | 视图/交互 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onToggleComments` | 视图/交互 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onNewComment` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onInsertIcon` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onInsertChart` | 编辑候选，待追踪 | 插入工具栏：用户输入类别、系列名称和数值 | 单系列原生图表经 SVG、OOXML 保存重开及二次保存测试；两端 E2E 待验 |
| `onInsertSmartArt` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onInsertWordArt` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onInsertField` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onOpenLink` | 文件/外部 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onOpenZoom` | 视图/交互 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onOpenHeaderFooter` | 文件/外部 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onOpenEquation` | 文件/外部 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onInsertMedia` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onInsertModel3d` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onToggleScreenRecord` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onPictureStroke` | 编辑候选，待追踪 | 对象菜单：轮廓（部分） | 真实菜单组件测试仅覆盖填充；其余读回及两端待验 |
| `onChangeShape` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onShapeStyle` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onShapeFill` | 编辑候选，待追踪 | 对象菜单：填充（部分） | 真实菜单组件测试仅覆盖填充；其余读回及两端待验 |
| `onShapeFillImage` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onPictureCrop` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onPictureOpacity` | 编辑候选，待追踪 | 选中图片菜单：100/75/50/25% | 组件点 50% 后 SVG 更新，保存 `<a:alphaModFix>` 并重开；两端 E2E 待验 |
| `onPictureCutout` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onPictureReplace` | 编辑候选，待追踪 | 选中图片菜单：替换本地 PNG/JPEG | 独立手动媒体路由经宿主保存读回；两端 E2E 待验 |
| `onPictureRotate` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onEditTableStyle` | 编辑候选，待追踪 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onEditChart` | 编辑候选，待追踪 | 未接 | 上游 `edit_chart` 未注册；`setChart` 非 AI-callable，当前共用 `apply_ops` 宿主拒绝；须建受控编辑接缝并验证身份、层级与关系保真 |
| `onOpenChartDataDialog` | 文件/外部 | 待追踪/未接 | 待追踪 App 回调和原件读回 |
| `onArrange` | 编辑候选，待追踪 | 对象菜单：位置、大小、层级（部分） | 组件测试层级保存读回；其他排列项及两端待验 |
| `onFlip` | 编辑候选，待追踪 | 对象菜单：水平/垂直翻转 | 组件测试水平翻转保存读回；垂直及两端待验 |

本源回调数：96。Ribbon 子组件和上下文菜单的独立命令还未完成逐项盘点；因此本表不能作为手动能力全集。

## WeKnora 适用性核对

2026-10-13 核对父任务 `research/reference-check.md`：WeKnora 公开站点 HTTP 200，固定公开源码版本 `Tencent/WeKnora@v0.8.2` 的 `internal/agent/tools/definitions.go` 包含 `search_knowledge`、`read_document` 和 Wiki 写工具。它可参考 Agent 工具注册与权限边界，但没有 PPTX 原件画布、OOXML 补丁和 Ribbon 的编辑语义。PPTX 文件编辑主参考仍为本表固定 GenOffice 源码，并以 Office 网页版与 Google Docs 手动交互复核。

## 尚未满足的验收

- 完整 71 操作执行与手动命令一致性；当前 7 项本地操作和 61 项宿主操作可调用。对象层级、水平翻转、纯色背景、隐藏等代表性命令已走真实菜单和保存读回，仍需其余方向、子种类和复杂原件验证；`setFont`、`setText` 的复杂多 run、段落属性也需更广夹具。
- 上游 Node 闭包现位于宿主；媒体、图表、动画、母版/主题各类尚需逐项原件夹具、人工 UI 与两端验收。生成与外部服务 14 个顶层工具仍未注册。
- 每个上游手动回调追踪 App 实现、浏览器及桌面实际操作、原件保存重开和未知 OOXML 保真。

## 本轮真实验证与边界

- `pnpm --filter @mimir/server test`：35 文件 288 例 + 本地 10 例 + fnos 4 例 + 备份 2 例通过；其中 PPTX 宿主测试真实执行 `setFill`，读回 slide XML，核对主题条目未改。
- `pnpm --filter @mimir/office exec vitest run src/editors/PptxEditor.test.tsx`：43 例通过；菜单用例点击对象填充、层级、水平翻转、本页纯色背景和隐藏状态，经上游 `runTxn` 返回画布并保存重开。`src/agent/pptx-agent.test.ts`：4 例覆盖未保存读、版本冲突、批量回滚、轮次撤销和宿主字节落地。
- 服务只回传字节，不写 vault；本地画布在等待宿主时若变版会拒绝结果。上游操作需要更完整的两端 E2E；单项失败不得被写成全部 61 项已验收。
