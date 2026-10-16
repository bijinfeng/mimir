# HTML 能力矩阵与执行证据

核对日期：2026-10-13。上游固定为 `genspark-ai/genoffice@480548fd55f1be3593ee0d8e316a734751d58309`；Mimir vendor 清单同 commit。上游来源：`apps/html/src/renderer/ai/tools.ts`、`document/{ops,insert-presets}.ts`、`components/{Ribbon,FloatToolbar,StylePanel}.tsx` 及其 `App.tsx` 回调。Mimir 实现：`packages/office/src/agent/html-agent.ts`、`editors/{HtmlEditor,HtmlElementMenu,HtmlInsertMenu,HtmlAgentPrompt}.tsx`、`apps/server/src/services/html-agent-{catalog,writing}.ts`。本页的「两端」指浏览器和桌面使用相同的 renderer/HTTP 服务代码；尚未完成两端的实际界面验收。

## Agent 顶层工具

| 上游工具 | 是否改文档 | Mimir 入口与共用执行器 | 代码与读回证据 | 失败状态 / 未完成范围 |
| --- | --- | --- | --- | --- |
| `get_outline` | 否 | HTML 句柄；当前 `EditedDoc` 解析映射 | `html-agent.test.ts` 读取未保存状态；浏览器/桌面共用句柄 | 大纲至多 100 项，继续用 `from_sid`；两端 UI 未实测 |
| `read_source` | 否 | HTML 句柄；当前 CodeMirror 源码 | 未保存输入回读测试；逐页返回 | 页码与原始行号在跨页切分时仍需更严测试 |
| `apply_ops` | 是 | HTML 句柄 + 手动元素菜单共用 vendored `compileOps` 与 `validatePatchSet` | 13 种操作逐项内存读回，批次失败原子性、版本冲突、撤销测试；`HtmlEditor.test.tsx` 用 Agent 与手动菜单的 `set_text` 连续编辑，验证源码/预览、BOM/CRLF 保存字节与预览属性隔离 | 原件保存读回目前只覆盖 `set_text`；不能据此声称每种操作已完成原件读回或两端验收 |
| `ask_clarification` | 否 | HTML 句柄挂起 Promise，编辑器次工具条问题面板回传答案 | 句柄测试用确认回调证明续轮、取消返回不改画布；面板尚未做浏览器实测 | 上游多选和独立问卷卡样式未完全对齐；面板关闭/导航取消需真实 UI 验证 |
| `plan_page` | `new`/`redesign` 是；`restyle`/`extract` 否 | 服务 `planHtmlPage` → 可编辑提纲确认面板 → `writeHtmlDocument` → 版本门控草稿提交；两端共用 HTTP 服务 | 服务端 3 例定向测试覆盖提纲校验、完整页、非 HTML 拒绝；句柄测试覆盖提纲确认后写入及 round 撤销 | 上游提纲含丰富 style/alternative/brief meta；Mimir 当前简化提纲，`restyle`/`extract` 只返回提纲，不写上游 `genoffice:brief` meta；实际模型与两端生成未验收 |
| `write_document` | 是 | 服务 `writeHtmlDocument` → 句柄草稿提交；两端共用 HTTP 服务 | 不完整页拒绝、旧版本草稿拒绝、成功完整页句柄测试；服务端完整页测试 | 目前收集服务端流后一次性落到画布，未提供上游逐字预览与部分页保留选择；实际模型输出质量未验收 |

## 13 种 `HtmlOp`

以下操作均由同一 `HtmlAgentHandle.applyOps` 执行；手动入口是「编辑元素」菜单（选中预览元素后），`set_attr(style=null)` 另有快捷按钮，Agent 入口是 `apply_ops`。两端调用路径共用 `packages/renderer` + `packages/office`；浏览器只对清除行内样式做了实际画布、保存、重开，桌面端未实测。单项内存读回见 `html-agent.test.ts` 的 13 项表驱动测试；`set_text` 与清除行内样式另有真实编辑器保存字节证据。

| 上游 `document/ops.ts` 操作 | 修改内容 | 手动入口 | 执行状态与失败 |
| --- | --- | --- | --- |
| `str_replace` | 局部字符串替换 | 菜单：在源码中替换文字 | 单项测试通过；无匹配/歧义由上游编译器拒绝 |
| `replace_element` | 整元素 HTML | 菜单：替换整个元素 | 单项测试通过；SID 失效拒绝 |
| `set_inner_html` | 元素内部 HTML | 菜单：设置内部 HTML | 单项测试通过；void 元素拒绝 |
| `set_text` | 转义后纯文本 | 菜单：设置纯文本 | 单项及 BOM/CRLF 保存字节读回通过；void 元素拒绝 |
| `insert_html` | 前/后/内部首尾插入 | 菜单：插入 HTML + 位置 | 单项测试通过；void 内部插入拒绝 |
| `remove` | 删除元素 | 菜单：删除元素 | 单项测试通过；陈旧 SID 拒绝 |
| `move` | 相对另一 SID 移动 | 菜单：移动到另一元素旁 | 单项测试通过；自身/后代目标拒绝 |
| `set_attr` | 属性值或移除 | 菜单：设置或移除属性；工具栏：清除行内样式 | 单项测试、清除样式按钮到原件字节及浏览器保存重开通过；非法属性名拒绝 |
| `set_style` | 合并行内 CSS | 菜单：设置或移除行内样式 | 单项测试通过；重叠批次拒绝 |
| `set_tag` | 改开始/结束标签 | 菜单：更换标签 | 单项测试通过；void/container 跨类拒绝 |
| `set_text_node` | 直接文本节点 | 菜单：替换直接文本节点 | 单项测试通过；索引不存在拒绝 |
| `wrap_text` | 包裹文本字符范围 | 菜单：包裹文本片段 | 单项测试通过；空范围拒绝 |
| `unwrap` | 删除本元素的标签 | 菜单：去掉元素标签 | 单项测试通过；无结束标签拒绝 |

## 上游手动命令分类

上游 `Ribbon.tsx` 提供保存/另存、查找、撤销/重做、视图、插入预设、AI 预设、演示；`FloatToolbar.tsx` 提供选中元素文字/样式、移动/复制/删除、图片替换/裁切/去背景；`StylePanel.tsx` 提供文本、属性、细粒度样式、图片尺寸与自定义 CSS。Mimir 当前编辑器逐类状态如下。所有未验证项仍是本子任务验收缺口。

| 手动命令类别 | 修改文档 | Mimir 入口/共用执行 | 状态、读回与差距 |
| --- | --- | --- | --- |
| 源码输入、查找替换、撤销/重做 | 输入/替换是 | CodeMirror + 外壳工具条，文本变化同步 HTML 句柄版本 | 既有编辑器测试通过；历史与 Agent 替换交错还需 UI 回归 |
| 选中元素、源码定位、源码/预览/分栏、设备宽度/缩放 | 否 | 预览检视脚本 + 外壳工具条；源码光标也映射回预览选中元素 | 预览消息核对 frame 来源与 parse-map 版本；过期消息拒绝测试通过；两端视觉未实测 |
| 文字、属性、CSS、元素替换/插入/移动/删除/去标签 | 是 | 「编辑元素」菜单与「清除行内样式」快捷按钮 → `applyOps`，和 Agent 同执行器 | 13 项单项测试通过；`set_text` 菜单真实点击到保存字节通过。2026-10-16 增加 `set_attr(style=null)` 快捷按钮：选中状态和无样式禁用原因、源码与预览副本、BOM/CRLF 保存重开均经 `HtmlEditor.test.tsx` 组件用例验证。其他命令尚缺逐项按钮到保存读回 |
| 上游插入预设（标题、段落、列表、按钮、section、分隔线、表格、图片） | 是 | 「插入」菜单 → vendored `insertPresetHtml`/`insertOp` → `applyOps`；表格行列、图片 URL 有专用字段 | 八种预设均经真实组件菜单点击、当前选中段落定位、画布/预览和保存字节读回；图片 URL、表格自定义行列也经字段输入验证。本地图片选择尚未接；浏览器/桌面真 UI 未实测 |
| 上游 FloatToolbar 快速加粗/斜体/字号/颜色/对齐 | 是 | 元素菜单快捷控件 → 同一 `set_style` 操作 | `HtmlEditor.test.tsx` 实际点击加粗与保存字节读回通过；其余快捷项尚缺逐项 UI 读回；预览的 `computed` 快照供按下态与字号基础值使用 |
| 预览内文字/HTML 直接编辑、尺寸拖拽与键盘命令 | 是 | inspector `gx:textEditCommit`/`gx:htmlEditCommit`/`gx:resize`/`gx:keyCommand` → 同一 HtmlOp 句柄 | 模拟真编辑器消息后源码和预览同步测试通过；迟到的旧版本编辑拒绝；真实 iframe 交互尚待浏览器/桌面端验收 |
| 上游复制、剪贴板、图片替换/裁切/去背景 | 是 | 元素菜单复制同一 `insert_html`；图片可输入 URL 或选本地文件嵌入 data URL；裁切/去背景使用固定版 GenOffice `CropDialog`/`CutoutDialog` 像素算法，输出 PNG data URL 后经共用 `set_attr` 写回；源码编辑器保留原生剪贴板 | 元素复制按钮保存字节读回通过；`HtmlEditor.picture.test.tsx` 模拟对话框 PNG 输出，验证过期版本拒绝及 HTML 原件保存读回；`html-picture-ops.test.ts` 验证去背景只移除边缘相连像素。本地文件选择、真实裁切和去背景交互及像素输出尚未在浏览器/桌面实测；远程图片必须允许 CORS，失败明确提示 |
| 上游图片变换、对齐及元素上/下移动 | 是 | 预览拖拽定位 `gx:moveTo` 已接 `move`；元素菜单按钮接固定上游 `image-style.ts`、`move-target.ts` 纯函数并经同一 `set_style` / `move` 执行 | 固定上游文件已同步；`HtmlEditor.test.tsx` 实际点击上移和右转，保存字节等于画布；翻转、对齐与跨容器移动尚缺逐项 UI 读回 |
| 上游自定义 CSS、样式恢复、图片宽高/锁定比例 | 是 | 菜单多声明 CSS、宽高与比例锁定均写同一 `set_style`；解析规则对齐固定上游 `float-position.ts` 的 `parseDeclarations` | `HtmlEditor.test.tsx` 实际点击设置宽度、按计算宽高比例同时写高度、提交两条自定义 CSS 声明，保存字节读回通过；上游延迟样式预览/取消尚未对齐，Mimir 用 CodeMirror 撤销已提交样式 |
| 保存与另存、自动保存 | 是 | Mimir「保存到库」；保留 UTF-8 BOM/CRLF | 保存字节测试通过；上游另存与自动保存不在当前 Mimir 原件保存入口，差距待产品判定 |
| 演示/新窗口、AI 预设 | 否或触发 Agent | 预览视图与聊天侧栏 | **未对齐上游独立入口和演示模式** |

保存并发回归：`HtmlEditor.test.tsx` 在异步保存期间再做 Agent 修改，旧保存完成后仍保持 dirty；保存字节只对应开始保存时的版本，后续版本不会被误标成已保存。2026-10-13 最新验证：`pnpm --filter @mimir/office test` 为 30 文件、502 项通过；`pnpm --filter @mimir/web build` 通过（含 TypeScript 检查）；此前 `pnpm --filter @mimir/office typecheck`、服务端 HTML 路由与写作定向测试 5 项通过。上述测试使用 happy-dom、模拟对话框 PNG 输出及模拟预览消息，尚不是浏览器或桌面端真实 UI 验收；真实图片像素交互与两端保存重开仍待复核。

2026-10-16 浏览器补验：本地 Web 应用用测试账号打开 `mimir-html-toolbar-fixture.html`（文档 ID `B-CMVB50fXDkXYiZ`），在预览点选带红色加粗行内样式的 `<h1>`；「清除行内样式」从禁用变可用，点击后源码由 `<h1 style="color: red; font-weight: 700">` 变成 `<h1>`，预览标题变回默认黑色，按钮显示“选中元素没有行内样式”，状态行显示未保存。点击「保存到库」后显示已保存；刷新文档页，源码和预览仍是无行内样式的标题。420px 视口下工具栏仍为单行、分类与清除入口可见，源码和预览上下排列且状态行可见；临时视口覆盖已恢复。此项是**浏览器真实画布、保存、重开**证据，桌面端及其他 12 个菜单操作仍未逐项实测。该临时 HTML 样本后来经用户明确授权删除。同期 Office 全包 33 文件、578 项通过，类型检查、目标 lint/格式与 `git diff --check` 通过。

## 跨层与参考核对

- `packages/shared/src/document-agent.ts` 的请求 schema → `apps/server/src/routes/conversations.ts` 校验 → `html-agent-writing.ts` 服务 → `packages/renderer/src/lib/api.ts` → `OfficeSourceEditor` 的 `agentServices` → HTML 当前画布句柄，已做静态链路核对。浏览器和桌面共用此渲染层，原生端到端仍未运行。
- WeKnora 公开站点及 `Tencent/WeKnora@v0.8.3`（commit `3e22822c1d2397be730c458c7539d0eb8c113a24`）已于 2026-10-16 核对，具体 HTTP 200、release 与 `internal/agent/tools/definitions.go` 证据见 `10-16-genoffice-editor-capability-audit/research/toolbar-assessment.md`。其知识库读取与 Wiki 写入工具可参考 Agent 权限和工具注册；没有 HTML 原件画布、SID、补丁与保存合同，因此本矩阵以固定 GenOffice HTML 源码作为文件编辑主参考。
