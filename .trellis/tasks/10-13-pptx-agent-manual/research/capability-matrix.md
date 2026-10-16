# PPTX 能力逐项矩阵（实施中，更新于 2026-10-16）

固定 GenOffice 版本：`480548fd55f1be3593ee0d8e316a734751d58309`。上游源码临时副本来自父任务调研，目录 `/private/tmp/mimir-genoffice-html-git/`；工具清单以 `apps/slides/src/renderer/ai/slides-skill.ts`，操作以 `packages/pptx-ops/src/prompts/ops/*.md` 为准。Mimir 执行证据是 `packages/office/src/agent/pptx-agent.test.ts`（6 例）及原有 `PptxEditor.test.tsx`、`pptx-structure.test.ts`。`packages/office/src/agent/pptx-agent.ts` 的 7 项浏览器本地操作与 `apps/server/src/services/pptx-agent-host.ts` 的固定上游 `runTxn` 共存；后者接受 61 项 AI-callable 操作，但目前只有代表性操作经过真实原件读回。

状态说明：「本地已验」= 本地执行和聚焦测试覆盖；「宿主可调用，未逐项验」= 固定版 runTxn 已接通但该操作尚无独立保存读回证据。浏览器与桌面共用 HTTP 路由，新增对象层级/翻转/背景/隐藏命令尚未分别实测。非 AI-callable 操作仍被通用 `apply_ops` 拒绝；现有图表通过独立 `edit_chart` 动作接入受控的单项 `setChart`。表格单元格手动编辑已通过组件与宿主保存读回。图表手动插入要求用户逐项填写类别和有限数值，固定声明 `dataSource:'user'`，只支持单系列柱状/折线/饼图；现有图表现可编辑多个既有系列、标题、类型、图例与数据标签；首次导入转换须明确确认，特殊格式可能简化。不能通过新增后删除模拟编辑，因为会改变图表身份、层级和关系。

## 顶层 Agent 工具（17）

| 上游工具 | 模型可调用 | Mimir Agent | 执行/两端 | 读回与失败证据 |
| --- | --- | --- | --- | --- |
| `read_slide` | 是 | 已接 | 画布本地；两端 E2E 待验 | 聚焦测试；错误为结构化失败 |
| `execute_slide_script` | 是 | 已接（限制见下） | 画布本地受限解释器；固定上游脚本语法；两端E2E待验 | 4例覆盖原子失败、保存和真实几何布局审计；无eval/网络 |
| `web_search` | 是 | 已接（限制见下） | 通用Brave配置；服务端执行；两端E2E待验 | 共用DOCX搜索服务；真实密钥调用未验 |
| `image_search` | 是 | 已接（限制见下） | 通用Brave配置；服务端执行；两端E2E待验 | 共用DOCX图片搜索；真实密钥调用未验 |
| `generate_image` | 是 | 已接（限制见下） | 通用图片生成模型；服务端执行；两端E2E待验 | 接通提示词生成；引用图/编辑/透明背景等上游语义仍缺 |
| `analyze_media` | 是 | 已接（限制见下） | 通用视觉模型；服务端执行；两端E2E待验 | 支持公网图片和提供的视频帧URL；原音视频转录/抽帧未接 |
| `insert_web_image` | 是 | 已接（限制见下） | 受控下载→原生图片→当前画布；两端E2E待验 | 严格独立schema，下载类型/体积/地址限制；宿主保存读回 |
| `replace_image` | 是 | 已接（限制见下） | 受控下载→替换既有图片；两端E2E待验 | 强制sourceId；保留裁切选项真实传递；宿主保存读回 |
| `ask_clarification` | 是 | 已接（限制见下） | 当前编辑器演示需求Inspector；两端E2E待验 | 确认/取消/Escape/打开其他Inspector取消；画布变版拒绝 |
| `plan_deck` | 是 | 已接（限制见下） | 画布句柄记录严格逐页计划；两端E2E待验 | 不修改画布；后续生成/重生成可复用计划风格 |
| `regenerate_slide` | 是 | 已接（限制见下） | 模型JSON→固定原生编辑操作；两端E2E待验 | 清除旧对象与动画，原子更新；模型服务mock验证，真实模型未验 |
| `generate_deck` | 是 | 已接（限制见下） | 模型JSON→原生形状/文字/图片；两端E2E待验 | 替换/追加、事实来源、几何边界与按比例裁切；真实模型与逐页流式未验 |
| `save_style_template` | 是 | 已接（限制见下） | 既有存储templates/pptx内有界风格模板；两端E2E待验 | 只存风格描述，不修改PPTX；保存/列出mock集成验证 |
| `list_style_templates` | 是 | 已接（限制见下） | 读取同一模板集合；两端E2E待验 | 不修改画布、不推进版本；mock集成验证 |
| `edit_chart` | 是 | 已接 | 独立宿主 action；两端 E2E 待验 | 共享 Zod 校验；多系列保存重开、导入确认、无来源、错长数据、失败草稿与未知 action 回归 |
| `apply_ops` | 是 | 已接 | 画布本地；两端 E2E 待验 | 聚焦测试；错误为结构化失败 |
| `load_guide` | 是 | 已接 | 画布本地；两端 E2E 待验 | 聚焦测试；错误为结构化失败 |

## 编辑操作（71；其中模型可调用 61）

| 上游组/操作 | 模型可调用 | 修改原件 | Mimir 手动入口 | Mimir Agent / 共用执行器 | 两端可达性 | 原件读回 / 失败 |
| --- | --- | --- | --- | --- | --- | --- |
| `text/setText` | 是 | 是 | 文字框段落输入 | 已接：PptxEditSession 补丁/结构 | 共用代码；E2E 待验 | 聚焦测试含代表性保存重开；逐项夹具待补 |
| `text/setFont` | 是 | 是 | 文字工具栏（整段字形） | 已接：PptxEditSession 补丁/结构 | 共用代码；E2E 待验 | 聚焦测试含代表性保存重开；逐项夹具待补 |
| `text/setParagraphFormat` | 是 | 是 | 开始 → 段落与文本框 Inspector：对齐、列表、缩进、行距、段距、文字方向 | 手动与 Agent 共用固定版 runTxn / apply_ops | 共用 HTTP；两端 E2E 待验 | 右对齐、段后12pt；双保存独立XML读回，其他列表/缩进组合仍需复杂原件；浏览器/桌面新入口E2E待验 |
| `text/insertEquation` | 是 | 是 | 插入→公式Inspector：模板/LaTeX/MathML预览/新框或追加 | 固定版runTxn；原生OMML | 两端E2E待验 | 组件与两次保存重开；画布线性回退，PowerPoint数学排版 |
| `element/deleteElement` | 是 | 是 | 对象菜单：删除确认 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 手动命令已接；本项保存读回/两端待验 |
| `element/setFill` | 是 | 是 | 对象菜单：填充/无填充 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 宿主测试与真实菜单组件测试：保存重开、主题条目不变；两端待验 |
| `element/setStroke` | 是 | 是 | 对象菜单：轮廓/无轮廓 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 手动命令已接；本项保存读回/两端待验 |
| `element/setTransform` | 是 | 是 | 对象菜单：位置和大小 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 手动命令已接；本项保存读回/两端待验 |
| `element/setConnectorEndpoints` | 是 | 是 | 对象 → 连接线端点：两端坐标、连接对象和连接点 | 手动与 Agent 共用固定版 runTxn / apply_ops | 共用 HTTP；两端 E2E 待验 | 连接后重开，双端解除连接、40/50→180/200pt；第二次XML读回端点且无stCxn；浏览器/桌面新入口E2E待验 |
| `element/flipElements` | 是 | 是 | 对象菜单：水平/垂直翻转，显示当前状态 | 固定版 runTxn；与 Agent 共用 `apply_ops` | 共用 HTTP；两端 E2E 待验 | 组件测试点水平翻转，保存 OOXML `flipH` 并重开读回；垂直方向待逐项验 |
| `element/setPictureSrcRect` | 是 | 是 | 对象 → 图片裁切：四边百分比、应用和重置 | 手动与 Agent 共用固定版 runTxn / apply_ops | 共用 HTTP；两端 E2E 待验 | 左裁20%跨两次保存保留；SVG按扩展图片+边界clip实际显示；相对边之和≥100禁用，失败不脏；浏览器/桌面新入口E2E待验 |
| `element/setPictureOpacity` | 是 | 是 | 选中图片菜单：100/75/50/25% | 固定版 runTxn；与 Agent 共用 `apply_ops` | 共用 HTTP；两端 E2E 待验 | 组件测试点 50%，SVG 立即更新；保存含 `<a:alphaModFix>` 并重开读回；宿主不可用及失败保持原画布 |
| `element/reorderElement` | 是 | 是 | 对象菜单：顶层/底层/前后一级，边界禁用 | 固定版 runTxn；与 Agent 共用 `apply_ops` | 共用 HTTP；两端 E2E 待验 | 组件测试点置于顶层，保存 XML 顺序并重开读回；其他方向待逐项验 |
| `element/groupElements` | 是 | 是 | 对象 → 对齐与组合 Inspector：具名顶层对象多选、组合 | 手动与 Agent 共用固定版 runTxn / apply_ops | 共用 HTTP；两端 E2E 待验 | 组件组合两个对象，SVG group可见，保存原生grpSp；第二次取消组合并保存；浏览器/桌面新入口E2E待验 |
| `element/ungroupElement` | 是 | 是 | 对象 → 对齐与组合：选中组合后取消组合 | 手动与 Agent 共用固定版 runTxn / apply_ops | 共用 HTTP；两端 E2E 待验 | 组件重开后选择组合取消，第二次保存grpSp移除且子元素保留；浏览器/桌面新入口E2E待验 |
| `element/setShapeGeometry` | 是 | 是 | 插入 → 形状库：具名预设、更改选中形状 | 手动与 Agent 共用固定版 runTxn / apply_ops | 共用 HTTP；两端 E2E 待验 | 椭圆改圆角矩形→调节→保存重开；无预设几何对象禁用；浏览器/桌面新入口E2E待验 |
| `element/setShapeAdjust` | 是 | 是 | 形状库：现有调节键，圆角/箭头提供具名调节字段 | 手动与 Agent 共用固定版 runTxn / apply_ops | 共用 HTTP；两端 E2E 待验 | 圆角adj=25000独立XML，保存重开后再自定义几何并第二次保存；浏览器/桌面新入口E2E待验 |
| `element/setShapeCustomGeometry` | 是 | 是 | 对象 → 编辑顶点：闭合多边形百分比顶点 | 手动与 Agent 共用固定版 runTxn / apply_ops | 共用 HTTP；两端 E2E 待验 | 真实polygon画布、第二次保存custGeom；只提供闭合直线多边形，现已补充开放路径、三次/二次贝塞尔控制点，连续两次保存验证；浏览器/桌面新入口E2E待验 |
| `element/setTextAnchor` | 是 | 是 | 开始 → 段落与文本框：垂直对齐 | 手动与 Agent 共用固定版 runTxn / apply_ops | 共用 HTTP；两端 E2E 待验 | 底部anchor=b跨两次保存；画布更新，其他方向未单独原件验；浏览器/桌面新入口E2E待验 |
| `element/setTextBodyProps` | 是 | 是 | 开始 → 段落与文本框：方向、自适应、换行、四边距 | 手动与 Agent 共用固定版 runTxn / apply_ops | 共用 HTTP；两端 E2E 待验 | vert=vert跨两次保存；其他属性组合需更多原件夹具；浏览器/桌面新入口E2E待验 |
| `element/setEffects` | 是 | 是 | 对象 → 对象效果：阴影、发光、柔化、倒影、清除 | 手动与 Agent 共用固定版 runTxn / apply_ops | 共用 HTTP；两端 E2E 待验 | 发光8pt/柔化3pt/倒影在SVG显示并双保存保留；内外阴影共用SVG filter近似，非Office像素级效果；浏览器/桌面新入口E2E待验 |
| `element/setLink` | 是 | 是 | 对象 → 对象链接：URL/页跳转/放映动作/移除 | 手动与 Agent 共用固定版 runTxn / apply_ops | 共用 HTTP；两端 E2E 待验 | URL保存关系跨两次写回；画布链接标记，编辑点击只选择，放映可打开；页跳转/动作/清除仍需E2E；浏览器/桌面新入口E2E待验 |
| `element/alignElements` | 是 | 是 | 对象 → 对齐与组合：6向对齐，选择范围/页面参照 | 手动与 Agent 共用固定版 runTxn / apply_ops | 共用 HTTP；两端 E2E 待验 | 3对象左对齐画布更新，与组合/连接线跨双保存；其他对齐方向待逐项实测；浏览器/桌面新入口E2E待验 |
| `element/distributeElements` | 是 | 是 | 对象 → 对齐与组合：水平/垂直，选择范围/页面参照 | 手动与 Agent 共用固定版 runTxn / apply_ops | 共用 HTTP；两端 E2E 待验 | 3对象水平分布，画布更新及双保存；垂直与页面参照需更多原件；浏览器/桌面新入口E2E待验 |
| `element/setImageFill` | 否（上游标记） | 是 | 对象→图片填充Inspector：用户PNG/JPEG、形状或页面背景、拉伸/平铺 | 独立手动multipart，严格共享schema，真实MIME/签名/大小校验 | 两端E2E待验 | 原生blipFill、画布pattern和两次保存；图片背景保留音频等原关系 |
| `insert/addElement` | 是 | 是 | 对象菜单：文本框/矩形 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 手动命令已接；本项保存读回/两端待验 |
| `insert/addConnector` | 是 | 是 | 对象 → 对齐与组合：起终对象、直/肘/曲线 | 手动与 Agent 共用固定版 runTxn / apply_ops | 共用 HTTP；两端 E2E 待验 | 直线连接真实画布、XML stCxn；重开后编辑端点二次保存；肘/曲线待独立夹具；浏览器/桌面新入口E2E待验 |
| `insert/addPicture` | 否（上游标记） | 是 | 插入工具栏：本地 PNG/JPEG 文件 | 独立手动媒体路由调用固定版 runTxn；Agent `apply_ops` 仍拒绝图片字节操作 | 共用 HTTP；两端 E2E 待验 | 组件测试 SVG、保存媒体与重开；宿主测试 PNG/JPEG、尺寸比例与 multipart；失败保持原画布 |
| `insert/replacePicture` | 否（上游标记） | 是 | 选中图片菜单：替换本地 PNG/JPEG | 独立手动媒体路由调用固定版 runTxn；Agent `apply_ops` 仍拒绝图片字节操作 | 共用 HTTP；两端 E2E 待验 | 组件测试 SVG 更新、保存媒体及重开；宿主测试旧对象锚点失效与媒体字节读回 |
| `insert/addTable` | 是 | 是 | 插入工具栏：6×6 尺寸网格 | 固定版 runTxn；与 Agent 共用 `apply_ops` | 共用 HTTP；两端 E2E 待验 | 组件测试点 2×3、SVG 显示、保存原生 `<a:tbl>` 并重开；宿主不可用及失败保持原画布 |
| `insert/addChart` | 是 | 是 | 插入工具栏：用户明确输入的单系列柱状/折线/饼图 | 固定版 runTxn；与 Agent 共用 `apply_ops`，手动声明 `dataSource:'user'` | 共用 HTTP；两端 E2E 待验 | 组件测试数据校验、SVG 可见、原生图表与数据读回、二次保存保留；宿主测试图表原件读回和无来源拒绝；失败不改画布及输入 |
| `insert/addSmartArt` | 是 | 是 | 插入→图示Inspector：7种布局/节点/预览 | 固定版runTxn生成可编辑形状组合，非原生diagram quartet | 两端E2E待验 | 组件SVG及grpSp跨两次保存；Venn4节点，其余8节点 |
| `insert/addMedia` | 否（上游标记） | 是 | 插入→音视频Inspector：文件预览、视频当前帧封面；对象→媒体播放 | 独立手动multipart，MP4/WebM/MP3/WAV/Ogg≤32 MiB | 两端播放E2E待验 | 真实WAV媒体字节、原生双关系/封面、SVG媒体标识、本地播放器与两次保存；外链不自动加载 |
| `insert/addModel3d` | 否（上游标记） | 是 | 插入→3D模型；对象→3D预览 | 独立multipart、固定版addModel3d附件+封面 | 浏览器与桌面由父会话验收 | 精确GLB附件跨两次保存读回、真实PNG封面、外链/解码器/过量顶点拒绝；非原生am3d |
| `insert/pasteElements` | 否（上游标记） | 是 | 开始→剪贴板：原生对象复制/剪切/粘贴 | 独立manual_asset，服务端生成opaque ref，拒绝客户端XML | 两端E2E待验 | 宿主复制未保存文字/图片媒体关系，保存两次；15分钟本窗口内部剪贴板 |
| `table/setTableCell` | 是 | 是 | 选中表格的对象菜单：按行、列、段落编辑现有文字 | 固定版 runTxn；与 Agent 共用 `apply_ops` | 共用 HTTP；两端 E2E 待验 | 组件测试当前值/禁用原因、SVG 更新、混合格式多段多 run 保存重开；宿主测试独立读回与主题保真；失败保留原画布及草稿 |
| `table/tableMerge` | 是 | 是 | 选中表格：向右/向下合并、拆分 | 手动与 Agent 共用 `apply_ops` | 共用 HTTP；两端 E2E 待验 | 入口已接；合并/拆分独立读回和边界夹具待补 |
| `table/tableStructure` | 是 | 是 | 选中表格：当前行列后插入、删除行列；含合并区域禁用 | 手动与 Agent 共用 `apply_ops` | 共用 HTTP；两端 E2E 待验 | 组件测试插入行、混合文字保留、结构保存重开；其余方向待逐项验 |
| `table/setTableRowHeight` | 是 | 是 | 选中表格：当前行高 pt 输入 | 手动与 Agent 共用 `apply_ops` | 共用 HTTP；两端 E2E 待验 | 组件输入 64pt，保存重开 rowHeights=812800；其余行待逐项验 |
| `table/setTableCellAnchor` | 是 | 是 | 选中表格：顶端/居中/底端 | 手动与 Agent 共用 `apply_ops` | 共用 HTTP；两端 E2E 待验 | 组件选底端，保存重开 anchor=bottom；其他方向待逐项验 |
| `table/setTableColWidth` | 是 | 是 | 选中表格：当前列宽 pt 输入 | 手动与 Agent 共用 `apply_ops` | 共用 HTTP；两端 E2E 待验 | 入口已接；列宽独立读回待补 |
| `table/setTableStyle` | 是 | 是 | 选中表格：底纹、边框/无边框、标题行列、交替行列 | 手动与 Agent 共用 `apply_ops` | 共用 HTTP；两端 E2E 待验 | 组件切换交替行后保存重开；其余样式逐项读回待补 |
| `table/setChart` | 否（上游标记） | 是 | 选中图表：标题/类型/多系列数据/图例/标签 | 独立 `edit_chart` 单项 action；通用 `apply_ops` 仍拒绝 | 共用 HTTP；两端 E2E 待验 | SVG 标题与数据更新、保存重开、二次保存、导入确认及失败保留；特殊格式转换有提示 |
| `slide/deleteSlide` | 是 | 是 | 缩略图侧栏删除 | 已接：PptxEditSession 补丁/结构 | 共用代码；E2E 待验 | 聚焦测试含代表性保存重开；逐项夹具待补 |
| `slide/duplicateSlide` | 是 | 是 | 缩略图侧栏复制 | 已接：PptxEditSession 补丁/结构 | 共用代码；E2E 待验 | 聚焦测试含代表性保存重开；逐项夹具待补 |
| `slide/addBlankSlide` | 是 | 是 | 缩略图侧栏新增 | 已接：PptxEditSession 补丁/结构 | 共用代码；E2E 待验 | 聚焦测试含代表性保存重开；逐项夹具待补 |
| `slide/addSlideWithLayout` | 是 | 是 | 幻灯片 → 尺寸与版式：从原件版式新建 | 手动与 Agent 共用固定版 runTxn / apply_ops | 共用 HTTP；两端 E2E 待验 | 读取原件真实layout列表，第二次保存新增页数量6及slide6关系独立XML读回；浏览器/桌面新入口E2E待验 |
| `slide/pasteSlide` | 否（上游标记） | 是 | 开始→剪贴板：整页复制/剪切/粘贴、目标主题/源格式 | 同一manual_asset，固定copySlide/pasteSlide资源打包 | 两端E2E待验 | 图片整页源资源粘贴；末页剪切/过期/错类型拒绝 |
| `slide/insertSlidePptx` | 否（上游标记） | 是 | 幻灯片→导入幻灯片Inspector：源PPTX预览/页码范围/主题方式 | 固定copySlide/pasteSlide导入完整资源闭包，非浏览器XML | 两端E2E待验 | 原件读回/页数/图片与主题资源；源文件≤32 MiB/最多40页，当前要求页面同尺寸 |
| `slide/moveSlide` | 是 | 是 | 缩略图侧栏排序 | 已接：PptxEditSession 补丁/结构 | 共用代码；E2E 待验 | 聚焦测试含代表性保存重开；逐项夹具待补 |
| `slide/setSlideLayout` | 是 | 是 | 幻灯片 → 尺寸与版式：当前原件版式和选择 | 手动与 Agent 共用固定版 runTxn / apply_ops | 共用 HTTP；两端 E2E 待验 | 应用不同原件layout，首次关系XML与二次新增页读回均指向所选资源；浏览器/桌面新入口E2E待验 |
| `slide/setBackground` | 是 | 是 | 对象菜单：本页纯色背景/重置 | 固定版 runTxn；与 Agent 共用 `apply_ops` | 共用 HTTP；两端 E2E 待验 | 组件测试点纯色，保存并重开读回；渐变/图片/图形背景待接手动及逐项验 |
| `slide/setHidden` | 是 | 是 | 对象菜单：放映中隐藏/显示，状态标记 | 固定版 runTxn；与 Agent 共用 `apply_ops` | 共用 HTTP；两端 E2E 待验 | 组件测试点隐藏，保存 `show="0"`、画布显示状态并重开读回；显示方向待逐项验 |
| `slide/setTransition` | 是 | 是 | 幻灯片 → 备注与放映：完整切换选项 | 宿主可调用：固定版 runTxn；未逐项验 | 共用 HTTP；两端 E2E 待验 | 手动命令已接；本项保存读回/两端待验 |
| `slide/setAdvanceTime` | 是 | 是 | 对象菜单：自动换页秒数及关闭自动换页 | 手动与 Agent 共用 `apply_ops` | 共用 HTTP；两端 E2E 待验 | 组件输入 8 秒显示当前状态，OOXML advTm=8000；关闭方向待逐项验 |
| `slide/setAnimations` | 否（上游标记） | 是 | 备注与放映：逐条修改现有动画的开始/持续/延迟 | 手动独立edit_animation只patch timing；通用apply_ops仍拒绝setAnimations | 共用HTTP；新时间编辑E2E待验 | 组件/真实宿主：500→900ms、delay200双保存读回；客户端raw presetXml被严格schema拒绝 |
| `slide/addAnimation` | 是 | 是 | 对象菜单：选中对象添加入口/强调/退出/方向路径，设置开始/持续/延迟 | 手动与 Agent 共用 `apply_ops` | 共用 HTTP；两端 E2E 待验 | 组件新增淡入和旋转，显示时间线并保存重开；其他效果逐项验收待补 |
| `slide/removeAnimation` | 是 | 是 | 时间线：删除单个动画 | 手动与 Agent 共用 `apply_ops` | 共用 HTTP；两端 E2E 待验 | 组件删除首个动画后保存重开保留另一个动画 |
| `slide/reorderAnimation` | 是 | 是 | 时间线：逐项上移/下移 | 手动与 Agent 共用 `apply_ops` | 共用 HTTP；两端 E2E 待验 | 组件将旋转移至淡入前，保存重开顺序一致；向下待逐项验 |
| `slide/setNotes` | 是 | 是 | 幻灯片 → 备注与放映：多行演讲者备注及应用 | 手动与 Agent 共用 `apply_ops`；`read_slide` 返回未保存讲稿 | 共用 HTTP；两端 E2E 待验 | 组件输入两段和 & 字符，保存重开/二次保存后准确读回；讲稿草稿与宿主繁忙分开 |
| `slide/addComment` | 是 | 是 | 幻灯片 → 分节与批注 Inspector：具名作者/日期/正文和添加 | 手动与 Agent 共用固定版 runTxn / apply_ops | 共用 HTTP；两端 E2E 待验 | 添加传统批注，跨双保存读回；删除测试仍保留幻灯片原文；浏览器/桌面新入口E2E待验 |
| `slide/deleteComment` | 是 | 是 | 幻灯片 → 分节与批注：逐条删除 | 手动与 Agent 共用固定版 runTxn / apply_ops | 共用 HTTP；两端 E2E 待验 | 重开后删除，第二次保存comments XML无cm且正文保留；浏览器/桌面新入口E2E待验 |
| `deck/setSlideSize` | 是 | 是 | 幻灯片 → 尺寸与版式：宽高pt，明确对象不缩放 | 手动与 Agent 共用固定版 runTxn / apply_ops | 共用 HTTP；两端 E2E 待验 | 宽800pt，SVG比例变化；双保存presentation cx=10160000；浏览器/桌面新入口E2E待验 |
| `deck/findReplace` | 是 | 是 | 查找替换栏 | 已接：PptxEditSession 补丁/结构 | 共用代码；E2E 待验 | 聚焦测试含代表性保存重开；逐项夹具待补 |
| `deck/applyHeaderFooter` | 是 | 是 | 幻灯片 → 页脚与页码：页脚、日期字段、页码 | 手动与 Agent 共用固定版 runTxn / apply_ops | 共用 HTTP；两端 E2E 待验 | 季度汇报画布可见，重开追加日期第二次保存，两者XML保留；浏览器/桌面新入口E2E待验 |
| `deck/setSections` | 是 | 是 | 幻灯片 → 分节与批注：具名节的连续页范围 | 手动与 Agent 共用固定版 runTxn / apply_ops | 共用 HTTP；两端 E2E 待验 | B节缩小范围；保存原件ID读回，重开再移除分节第二次保存；浏览器/桌面新入口E2E待验 |
| `deck/applyTheme` | 是 | 是 | 幻灯片 → 主题 Inspector：原件主题、12配色和字体 | 手动与 Agent 共用固定版 runTxn / apply_ops | 共用 HTTP；两端 E2E 待验 | 读取真实theme资源；强调1=C03060跨双保存theme XML；画布刷新但混合母版夹具待验；浏览器/桌面新入口E2E待验 |
| `deck/addSection` | 是 | 是 | 幻灯片 → 分节与批注：从当前页建立具名分节 | 手动与 Agent 共用固定版 runTxn / apply_ops | 共用 HTTP；两端 E2E 待验 | 添加第一部分跨双保存；多节夹具覆盖移位/范围/移除；浏览器/桌面新入口E2E待验 |
| `deck/renameSection` | 是 | 是 | 分节与批注：选择真实分节ID后重命名 | 手动与 Agent 共用固定版 runTxn / apply_ops | 共用 HTTP；两端 E2E 待验 | 重开改为已确认部分，第二次保存presentation name与GUID读回；浏览器/桌面新入口E2E待验 |
| `deck/removeSection` | 是 | 是 | 分节与批注：保留幻灯片的移除确认 | 手动与 Agent 共用固定版 runTxn / apply_ops | 共用 HTTP；两端 E2E 待验 | B移除后第二次保存节名消失、5页保留；浏览器/桌面新入口E2E待验 |
| `deck/moveSection` | 是 | 是 | 分节与批注：上移/下移，首尾禁用 | 手动与 Agent 共用固定版 runTxn / apply_ops | 共用 HTTP；两端 E2E 待验 | A下移后顺序B/A/C，范围编辑与二次移除后顺序保留；上移方向仍待单独夹具；浏览器/桌面新入口E2E待验 |

## 上游 Ribbon 手动回调入口

2026-10-16 已将 `ribbon-shared.tsx:318–600` 全部96回调追至固定commit的 `App` wiring、actions和Mimir实际工具入口。逐项状态、子菜单参数与剩余缺口见 [Ribbon本地工具审计](ribbon-local-audit.md)。旧表的“待追踪/未接”不能继续当作结论；也不能把基础op存在记为UI完成。完整任务仍未完成：ink、四视图、自定义放映/排练、Zoom图片链接、完整shape/table gallery、渐变及多项子参数确有缺项。

本切片新增录屏（显式开始→停止→预览→插入，32MiB/10分钟/迟到授权清理）、图表设计参数和样式/配色/数据三分类Inspector；真实系统chooser与两端视觉验收独立记录。实施阶段图表6+录屏6个新增组件/helper测试、原Editor67例、原生素材宿主6例及Office/server类型检查通过。独立checker再追加8例图表原生variant/组合图柱距验证（图表总14，录屏6），最终结果见审计文末独立复核。

## WeKnora 适用性核对

2026-10-16 沿主任务已核对的公开站点与源码证据：WeKnora `Tencent/WeKnora@v0.8.3`（`3e22822c1d2397be730c458c7539d0eb8c113a24`） 的 `internal/agent/tools/definitions.go` 包含 `search_knowledge`、`read_document` 和 Wiki 写工具。它可参考 Agent 工具注册与权限边界，但没有 PPTX 原件画布、OOXML 补丁和 Ribbon 的编辑语义。PPTX 文件编辑主参考仍为本表固定 GenOffice 源码，并以 Office 网页版与 Google Docs 手动交互复核。

## 尚未满足的验收

- 完整 71 操作执行与手动命令一致性；当前 7 项本地操作和 61 项宿主操作可调用。对象层级、水平翻转、纯色背景、隐藏等代表性命令已走真实菜单和保存读回，仍需其余方向、子种类和复杂原件验证；`setFont`、`setText` 的复杂多 run、段落属性也需更广夹具。
- 上游 Node 闭包现位于宿主；媒体、图表、动画、母版/主题各类尚需逐项原件夹具、人工 UI 与两端验收。17个顶层工具现均注册；生成与外部服务的语义限制和真实配置验收见文末。
- 每个上游手动回调追踪 App 实现、浏览器及桌面实际操作、原件保存重开和未知 OOXML 保真。

## 本轮真实验证与边界

- `pnpm --filter @mimir/server test`：35 文件 288 例 + 本地 10 例 + fnos 4 例 + 备份 2 例通过；其中 PPTX 宿主测试真实执行 `setFill`，读回 slide XML，核对主题条目未改。
- `pnpm --filter @mimir/office exec vitest run src/editors/PptxEditor.test.tsx`：43 例通过；菜单用例点击对象填充、层级、水平翻转、本页纯色背景和隐藏状态，经上游 `runTxn` 返回画布并保存重开。`src/agent/pptx-agent.test.ts`：4 例覆盖未保存读、版本冲突、批量回滚、轮次撤销和宿主字节落地。
- 服务只回传字节，不写 vault；本地画布在等待宿主时若变版会拒绝结果。上游操作需要更完整的两端 E2E；单项失败不得被写成全部 61 项已验收。

## 2026-10-16 继续实施的验证

- PPTX + Agent + 共用壳定向测试：188/188（67 个编辑器组件、5 个 Agent、116 个壳测试）；宿主与路由：18/18。Office/server 类型检查与本轮定向 lint 通过；其他格式仍在并行实施，完整整包验证由父任务收口。
- 宿主响应重解析前后二次检查编辑版本及取消信号，回归测试证明解析期间人工修改不会被迟到结果覆盖。宿主重解析/首次硬化 creationId 后按持久 ID 及 cNvPr 别名恢复选中对象，确保表格和动画可连续编辑。
- `edit_chart` 保持原图表对象身份、几何、层级与关联，独立 action 只接受单项图表补丁；模型参数 schema 从共享 Zod 合同生成。导入图表转换可能简化特殊格式，须用户确认；未改媒体/主题保持原件。这轮不等同所有 71 操作或全部手动回调验收。
- 本批前的剩余项见下方新增工具批次；本段为较早批次记录；当前17工具注册状态与复杂媒体缺口见文末。

### 2026-10-16 浏览器实证补充

- 真实 `01_standard_business.pptx`（库 `KY635Y`、文档 `dAKf3a4GLfeyoVMt`）：幻灯片 → 备注与放映输入中文讲稿并应用、选择推进切换，选中标题 Q3 添加淡入 500ms；未保存状态与保存成功已确认。
- 下载原件由 Python XML 独立核对：`notesSlide1` 含讲稿，`p:transition/p:push` 存在，`p:timing` 为 fade、dur=500、spid=2；原图文标题保留。刷新重开面板确认同中文讲稿、推进切换、淡入·单击时·500ms·延迟 0，且无未保存改动；截图 `/tmp/mimir-pptx-notes-animation-reopened.jpg`。
- 真实放映和桌面端仍未验。

### 2026-10-16 PPTX 工具栏扩充批次（组件/宿主已验，浏览器与桌面新入口待验）

- 新增 `PptxEditor.extended-tools.test.tsx` 14个完整交互场景：真实组件→固定上游宿主→SVG→保存→重开→第二次编辑保存，独立ZIP/XML核对段落、图片裁切/效果/链接/旋转、形状/连接线/排列/组合、版式/主题/页脚/尺寸、分节/批注、动画时间。新增宿主时间动作经严格Zod校验，保留未修改主题；未知seq和客户端原始XML明确失败。
- 长面板使用右侧340px Inspector（段落、排列、主题、分节批注），窄宽覆盖右侧而不横铺挤走画布；短工具使用受视口/60vh约束的350px弹层。全部新字段用共享 `ToolbarPropertyForm` 显示标签和真实分组标题；当前值从同一活动原件和模型读取，版本变化重建表单、宿主失败不标脏。
- 本批最终定向验证：Office 4文件100例、SVG渲染15例、宿主与路由2文件19例全部通过；Office类型检查、16文件格式、定向lint及diff检查通过。主题12色按基础/强调/链接两列共享色块显示，任意颜色走紧凑自定义弹层；Inspector打开聚焦、Escape关闭并返回触发按钮。窄栏使用workspace容器宽度查询，聊天侧栏占宽时也按实际编辑宽度覆盖。
- 画布效果加入组合SVG filters（阴影/发光/柔化/倒影近似）；修复原image上viewBox不产生实际裁切的问题。超链接有矢量标记，编辑画布阻止导航。主题/版式/节/批注列表均投影当前原件资源，不编造索引。
- 缩略图、主画布、放映当前页与下一页各使用稳定实例命名空间；同时显示的SVG滤镜、裁切和倒影引用不互串，组件独立核对所有资源引用属于各自SVG。纯渲染默认仍为确定性输出。
- 幻灯片 → 放映/演讲者视图使用当前未保存SVG与讲稿；支持键盘/点击步骤、自动换页、隐藏页跳过、对象链接、全屏入口和下一页预览。常见入口/强调/退出为浏览器近似效果；运动路径仅直线终点预览；原始presetXml、逐段动画和媒体命令静态显示。组件证明导航不标脏；真实浏览器播放与桌面实测尚未完成。

#### 2026-10-16 当前补全状态与精确保留的缺口

- 17个Agent工具均已注册并接实际执行路径。脚本使用固定版有界解释器，执行后对实际渲染几何做越界/重叠/文字溢出审计。模板、生成、外部图片均通过当前画布字节/版本/取消守卫；生成相关宿主测试使用模型mock，不代表真实模型验收。
- 公式、7类图示、12类艺术字、原生日期/页码、开放贝塞尔顶点、全画布30步撤销重做已有组件与原件两次保存证据。图示为可编辑形状组，公式画布是线性回退，WordArt仅文字填充/描边样式；界面按实际能力说明。
- 原生对象/整页剪贴板由独立manual_asset动作提供；服务端只接严格命令和opaque ref，不接客户端XML/parts，不加入模型目录。ref在本窗口Mimir演示文稿可用15分钟；最多12项、总64 MiB，进程重启失效。无PowerPoint原生系统剪贴板互通。
- 本批最终定向验证：Office 5文件100例通过，含原生剪贴板及媒体Inspector的真实引擎/双次保存场景，扩展工具组件21/21；宿主4文件27例通过；Office/server类型检查、19文件定向lint、格式和diff检查通过。固定上游sync --check报告0差异。真实浏览器宽/窄视觉及保存证据由父会话追加，未由本子任务验收。

仍未满足：

1. 真实模型和第三方配置后的17工具闭环；generate_image引用图/编辑/透明背景语义，analyze_media原音视频上传/转录/抽帧，attachment://图片解析仍缺。生成仅原生形状/文字/图片，不含原生表格/图表；整份完成后原子显示，缺逐页流式预览/中断保留。数字来源目前是输入声明，未验证实际搜索证据链。
2. 本批已补模型附件+封面、母版对象编辑、图片去背景、格式刷、动画效果/方向/目标段落/时间线、PDF/图片导出与打印。录屏、PowerPoint原生交互3D、完整复杂预设和逐段浏览器播放、矢量PDF直接导出仍缺。setImageFill、音视频插入/播放与PPTX导入本轮已接，独立媒体上传要求同扩展/MIME/签名，导入目前只支持同页面尺寸。固定上游addModel3d自身仅模型附件+预览图，不能据此声称原生交互3D。
3. 其他方向/预设/复杂组合、未知动画与混合母版资源保真、全部96个Ribbon回调及子菜单仍需逐项验收。上表“待追踪”不因相关基础op存在而自动算完成。浏览器与桌面验收由父任务收口，组件/宿主通过不能代替真实视觉与交互证据。

### 2026-10-16 输出/视图/图片/母版/动画/3D 本地工具收口

- 固定源码证据：`apps/slides/src/renderer/export-pages.ts` 的原版依赖桌面导出；Mimir用当前SVG输出PNG/SVG/ZIP与栅格PDF，系统打印保留SVG矢量。`format-brush.ts` 提供选择对象格式语义，本次复制纯色填充/描边和字体/对齐，保留目标文字。`cutout.ts:120`为边缘颜色泛洪，不宣称AI前景分割。`slides-main.ts`母版入口使用`listMasterParts/parseMasterPart`和part事务；`media-insert.ts:241`的`addModel3d`本身就是附件+封面，不能据此宣称原生am3d。
- 3D生产依赖`@google/model-viewer@4.4.0`，动态加载、本地blob URL、拖转/缩放、当前视角PNG封面；GLB限制32MiB/JSON4MiB、外部URI/外部解码器拒绝、有界mesh/accessor和解码数据。测试夹具`packages/office/tests/fixtures/local-tetrahedron.glb`为实际自包含橙色四面体。
- 持续编辑统一右侧Inspector：备注与放映、导出、图标、去背景、母版、3D。主画布选择和dirty沿原有受控宿主路径；输出取消信号在每页处理及下载前检查，关闭面板不触发迟到下载。文件选择/预览另做真实浏览器复核，组件测试不替代外观验收。
- 当前新增定向测试：Office4文件29例（GLB2、格式刷/去背景2、输出3、扩展组件22），另本地面板5例验证当前母版值、可见操作文字、GLB文件选择/未加载禁用、读取前文件预算和无效模型错误；Server2文件10例包含精确GLB/PNG跨两次保存、动画换效果/方向/paragraph/运动路径保留顺序与时间、母版无边框和普通slideXML保留。Office/server类型检查通过。浏览器实证和独立检查由父会话追加，尚不表示桌面和全部回调验收通过。

- 真实浏览器父会话已确认自包含橙色四面体可加载、ArrowRight相机交互、插入后自动选中并打开3D预览、保存并下载`01_standard_business (2).pptx`。该轮发现文件选择按钮仅有aria-label、短窗口主动作难触达，已补可见文字、220px预览和sticky满宽主动作；修后截图由父会话复验。实际GLB附件精确字节的两次保存由服务测试独立验证，浏览器下载内容仍由父会话检查。
- 收口定向检查：Office4文件31例（不含另跑的格式刷/去背景2例）、Server2文件10例，16文件定向oxlint无错误/警告、`git diff --check`通过。项目没有可用的stylelint命令，不把CSS静态检查记为通过；CSS随oxfmt格式检查及真实浏览器验收。独立checker追加格式刷字号比例修复与回归，最终结果由其记录。

- 独立检查追加3D读取前文件预算：`file.size`超过32MiB或小于28B时不调用`arrayBuffer()`；新组件回归证明超大文件未读取。本地面板最终5/5通过、对应lint无错误。


### 2026-10-16 表格设计参数

对象→编辑表格现使用内容/布局/样式Inspector，八固定上游样式、RTL、六flags、逻辑活动格/全表底纹、all/none边框宽色均有手动入口。12例组件→真实原生执行→双保存独立XML，67例Editor回归；主题/未目标格保真与失败草稿通过。固定版GenOffice本身没有outer/inner/horizontal/vertical边框，撤回此前错误缺口，视作可选扩展。真实浏览器进展与剩余Ribbon项见ribbon-local-audit.md，不能据此声称全部96回调完备。


### 2026-10-16 四视图、笔迹、渐变及纹理浏览器收口

浏览排序多选/原序atomic move/undo/redo/save/reload、阅读键盘/Escape；笔/荧光PNG+aislides-ink descr/整笔擦除/清页/history/reload；三色标含alpha和角度；八固定纹理及当前图片stretch/tile；背景双色渐变all、纸张图片all、隐藏背景图形、重置本页及undo均有真实浏览器/原生下载证据。宽1280和420已目视，Inspector固定操作/完整标签/无页面横溢出/嵌套Escape回焦通过。详情及精确文件名见ribbon-local-audit末段。原复杂多色标/路径背景保真all仍禁用；本片不关闭全部Ribbon或真实模型缺口。Web与Server最终生产build exit0；Desktop窗口由用户自行验收。
