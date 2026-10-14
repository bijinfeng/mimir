# 两端实测记录（2026-10-13）

本记录只描述已观察到的行为；父任务和五个格式的验收仍未完成。固定能力参考见 `reference-check.md` 和 `genoffice-five-format-inventory.md`。

## Web 开发实例

地址 `http://localhost:5173/`，使用当前开发服务和已登录测试用户。
下表记录切换 kebai 模型之前的首轮状态；当天后续真实 Agent 补验见文末。

| 格式 | 手动操作及读回 | Agent 结果 |
| --- | --- | --- |
| Markdown | 新建笔记，输入 `/h1` 选择标题 1，再输入 `Slash QA`；保存刷新后仍是 H1。随后输入 `/image`，菜单显示“图片”；选取仓库公开测试图标后，斜杠查询被替换为图片，状态“已保存”，刷新后图片仍在正文。 | 未完成真实模型写入。 |
| XLSX | `toolbar-qa.xlsx` 的 B3 改为 `技术部 QA`，保存刷新后读回。扩展菜单的“当前格加粗”在 B3 操作后显示未保存，保存后用独立 XML 解析确认 B3 样式指向 `fontId=1` 且含 `<b>`；基础网格明确提示暂不显示字形。 | 早期测试依次暴露首次工具调用 409、`[agui] submitInterruptResponses: a run is already in progress` 和前导事件被误报为“模型流缺少 RUN_STARTED”；均已修正并加入回归。重启 QA API 后真实模型完成 `get_workbook_context → read_cells → 最终答复`，准确读出 B3 为 `技术部 QA`。随后提示“把 B3 改成 Agent QA。”，上游返回 `Invalid prompt: ... flagged as potentially violating our usage policy`。再次提示“请将当前工作表的 B3 单元格内容改为‘测试完成’。”时，上游返回 403 `This account only allows Codex official clients`。两次均未执行写工具，画布未改变。因此真实 Agent **读取续轮通过，写入仍未通过**；当前配置的模型账号已不能用于 Mimir 客户端验收。 |
| HTML | `toolbar-qa.html` 的 h1 改为 `Toolbar QA Web`；源码和预览在保存刷新后相同。 | 未完成真实模型写入。 |
| PPTX | `toolbar-qa.pptx` 第一段改为 `加粗大字 QA`；保存刷新后画布读回。新增对象菜单中选择本页“淡蓝”背景，画布及缩略图变色且显示未保存；保存重开后仍为淡蓝，重置命令可用。独立读取 `ppt/slides/slide1.xml` 的 `p:bg/a:srgbClr` 为 `9DC3E6`。 | 未完成真实模型写入。 |
| PDF | `toolbar-qa-text.pdf` 插入 `PDF QA Web`；保存刷新后查找为 `1 / 1`。 | 未完成真实模型写入。 |

上述 QA 文件和一篇新笔记保留在开发实例中，供下一轮逐项验证。
修复文档 Agent 的模型错误渲染后，再用同一 XLSX 页提示“请读取当前表格的 B3。”；当前模型账号再次返回 403。浏览器侧栏现在显示“当前模型账号只允许 Codex 官方客户端，Mimir 无法调用”，并出现“模型请求受限”失败卡；这只验证错误反馈，不算 Agent 读写通过。
Markdown 图片插入后另直接读取 `data/vault/2026/10/未命名笔记-W9Mb11zV.md`，正文含 `![icon](/api/documents/VXigJdR7f2jN-g2k/file)`；这是保存文件读回，不只依赖画布显示。

## 桌面本地模式

安装并启动 Electron 44.4.5，`@mimir/desktop` 本地模式宿主监听 `127.0.0.1:64074`，使用独立本地数据目录。

- Markdown：新建“未命名笔记”，`/h1` 菜单选择标题 1，输入 `Desktop Slash QA`；状态显示已保存，返回列表重新打开后仍为 H1。随后输入 `/image` 并选择“图片”，从本地选择仓库测试图标；斜杠查询被图片替换，状态显示“已保存”，返回列表重开后正文仍有 `icon` 图片。
- XLSX：通过“添加文档”导入仓库 `xlsx-fixture.xlsx`，将 B3 从 `技术部` 改为 `桌面 QA`；应用后状态为未保存，点击“保存到库”，重新打开后 B3 为 `桌面 QA`，保存按钮禁用。
- PPTX：导入 `formatted-text.pptx`，第一段改为 `桌面本地幻灯片 QA`；状态从未保存变为已保存，返回列表重开后画布读回新文字。
- HTML：导入 `mimir-format-qa.html`，在预览选中 h1，经“元素编辑→设置纯文本”改为 `HTML Local QA`；源码与预览同步变化，保存重开后两处均读回该文字。
- PDF：导入 `mimir-format-qa.pdf`，在页面插入 `PDF Local QA`；画布与缩略图显示新增文字，状态显示未保存，保存重开后画布仍显示该文字。
- 桌面本地 Agent 尚未完成实测。PDF 导入时另发现打包版内置服务缺少 `pdfjs-dist`：界面显示“正文提取失败”，并禁用“询问这篇文档”；页面编辑与保存仍可用。此打包缺陷正在修复，不能据上述手动操作声称 PDF Agent 可用。

重新打包（生产服务顶层 `node_modules/pdfjs-dist` 已存在）后，新导入的 `mimir-format-qa-reparse.pdf` 在上传完成弹窗显示“已提取 13 字”，文档页“询问这篇文档”启用。第一次重扫曾使新旧 PDF 的 `parse_error` 变为 `Please provide binary data as Uint8Array, rather than Buffer.`、正文为空。修复解析器的 Buffer 转换后再次打包，在新包的“数据与备份→重新扫描本地文件”重跑索引：SQLite 中旧 PDF 的正文长度为 39、含 `PDF Format QA` 与 `PDF Local QA`，新 PDF 正文长度 13、含 `PDF Format QA`；两条 `parse_error` 均为 `NULL`。重新打开旧 PDF 后“询问这篇文档”可点击并打开侧栏；本地模式尚未配置聊天模型，因此真实 Agent 写入仍未验。

直接读取桌面本地数据目录中保存的原件，绕过 Mimir 编辑器进行交叉检查：Python `zipfile`/XML 读取 XLSX `sheet1.xml` 的 B3 内联字符串为 `桌面 QA`、PPTX 第一张幻灯片文字为 `桌面本地幻灯片 QA`；原始 HTML 字节含 `<h1>HTML Local QA</h1>`；`pdfjs-dist` 独立读取已保存 PDF 的第一页文字层，得到 `PDF Format QA | PDF Local QA`。这些证据只覆盖上述修改，不替代完整操作矩阵。

## 桌面连接服务模式

`pnpm desktop:build` 在清理旧的、被 Git 忽略的 `server-deploy` 目标目录后打包成功，产出 `apps/desktop/release/mac-arm64/mimir.app` 与 DMG。打包版独立应用 ID 消除了开发版与另一 Electron 应用的窗口混淆。

最初连接 `localhost:3000` 时，开发 API 服务没有静态前端，窗口显示“前端资源未构建”；连接 `localhost:3001` 又命中另一应用占用的 IPv6 `::1:3001`，收到 404。改用明确的 `127.0.0.1` 后探活和登录正常。最终在 `127.0.0.1:3002` 启动独立数据目录与已知 QA 账号的生产模式服务，通过桌面“连接服务器”模式完成以下操作：

| 格式 | 桌面远端操作和保存重开结果 |
| --- | --- |
| Markdown | 新建笔记，`/h1` 选择标题 1，输入 `Remote Slash QA`；状态已保存，重开仍是 H1。 |
| XLSX | 导入同一个 `xlsx-fixture.xlsx`，B3 改成 `远端 QA`，应用后显示未保存；点击保存并重开读回。随后浏览器登录**同一 3002 服务**读到 `远端 QA`，改成 `浏览器 QA` 并保存，桌面重开读到 `浏览器 QA`，证明该手动操作双向共用原件。 |
| PPTX | 导入 `formatted-text.pptx`，第一段改为 `远端幻灯片 QA`，dirty、保存、重开画布均正确。 |
| HTML | 导入 `mimir-format-qa.html`，在预览选中 h1，经“元素编辑→设置纯文本”改为 `HTML Remote QA`；源码和预览同时变化，保存重开仍一致。 |
| PDF | 导入单页测试 PDF，经“页面与版式操作→点击页面位置插入文字”写入 `PDF Remote QA`；画布显示、dirty、保存、重开后画布仍显示该文字。 |

远端服务未配置聊天模型；XLSX 问 AI 侧栏明确显示“请先配置可用的聊天模型”，因此远端 Agent 写入没有执行。上述只证明代表性**手动编辑**在桌面远端可用，不证明 GenOffice 的完整命令矩阵或 Agent 端到端行为。

## 仍需的证据

同一复杂夹具的 Web、桌面本地、桌面远端手动与 Agent 交替编辑，逐项上游操作矩阵，以及独立解析器读回。Web 真实模型已有代表性写入；桌面两模式仍需独立的可用模型或连到同一已配置服务，不能用单元测试或手动写入替代。

## kebai 模型真实写入补验（2026-10-13）

用户在 Web 开发实例配置 kebai 后，将“对话”任务从旧账号切换到 `kebai / deepseek-flash`；设置页显示“已保存”，文档侧栏显示“当前全局模型：deepseek-flash”。以下均由模型在真实文档页调用工具，不是测试替身。测试文件只在 QA 数据中修改。

| 格式 | 工具、画布与保存证据 | 独立读回 |
| --- | --- | --- |
| HTML | `read_source → apply_ops → read_source` 将 h1 改为“HTML Agent 验收”；源码与预览同时改变，显示未保存；手动保存、返回列表重开后仍相同。 | 下载原件 105 B，直接读取字节含 `<h1>HTML Agent 验收</h1>`，原 `<p>Temporary editor layout check.</p>` 保留。 |
| Markdown | 首轮 `get_document_context → apply_ops` 的第一次调用缺少 `op`，报 `unknown op "undefined"`；模型后续重试成功追加“Markdown Agent 验收”。修正模型可见 schema 后，第二轮 `get_document_context → apply_ops → get_document_context` 一次写入成功，追加“第二次 Agent 验收”；笔记自动保存，重开可见。 | vault 原件 `data/vault/2026/10/未命名笔记-W9Mb11zV.md` 保留 H1、图片和两个新增段落。截图见 `screenshots/markdown-agent-live.png`。 |
| PPTX | `read_slide → load_guide → apply_ops` 将第 1 张幻灯片背景改成 `#FFF2CC`，画布 dirty；手动保存后状态已保存。 | 下载原件并用 Python `zipfile`/XML 读取 `ppt/slides/slide1.xml` 的背景为 `FFF2CC`，文字仍为“加粗大字 QA 斜体小字”。 |
| PDF | `read_pages → insert_text` 在第 1 页 `(40pt,100pt)` 插入 `PDF Agent QA`，字号 14；画布 dirty，手动保存成功。 | 下载原件，用独立 `pdfjs-dist` 文字层读取到 `Toolbar QA text document | PDF QA Web | PDF Agent QA`。 |
| XLSX | 首轮读取成功，但模型用 `type` 代替 `op`，`propose_operations` 反复报泛化的参数错误；未改变画布。修正工具 schema 和参数错误后，第二轮 `get_workbook_context → read_cells → propose_operations` 一次写入成功，B3 显示“Agent验收”、dirty；手动保存成功。 | 下载原件，用 Python `zipfile`/XML 读取 `sheet1.xml` 的 B3 为“Agent验收”，样式编号 `s=1` 保留。 |

这证明 **Web 开发实例五格式各一个代表性 Agent 写入**，不等同于固定版 GenOffice 的完整工具/手动命令矩阵。桌面本地和桌面远端仍需用可调用模型实测 Agent；当前两处使用独立数据和模型配置，不能据 Web 结果宣称两端 Agent 已通过。XLSX 与 Markdown 本次修复分别增加服务端工具契约回归，定向测试、类型检查与 lint 通过。其他上游操作和三种宿主模式的完整验收仍未完成。

桌面本地设置页当前显示“暂无供应商”，文档侧栏显示“请先配置可用的聊天模型”。尝试把桌面连接服务直接指向 Web 开发页 `localhost:5173` 时，桌面探活 `GET /healthz` 收到 Vite 的 HTML 而非 Mimir JSON，因而提示 404/非服务；已取消切换，本地数据和模式未改变。浏览器开发服务的模型配置不能由此自动用于桌面本地宿主；桌面真实 Agent 验收仍待独立模型配置或同一配置的可用生产服务。

## R9 工具栏与交互文案补验（2026-10-13）

浏览器先前在六格式文档页检查了可见分类、命令组与画布：826px 视口下 XLSX 可见“开始 / 公式 / 视图”，选中 A3 后出现地址与输入框；HTML 选中预览元素后出现元素路径与操作；PPTX 选中对象后出现段落与位置大小；DOCX、Markdown、PDF 的分类与命令区也已查看。1000px 视口打开“问 AI”后，XLSX 编辑列宽 548px、命令区 `clientWidth=532`、`scrollWidth=652`，向右滚动到 `scrollLeft=120`，命令仍在可滚动区域而非总“更多”。侧栏空态显示快捷提问、范围与输入框，未见快速上手清单。这些观察发生在本轮最后的侧栏状态收敛之前。

随后将 XLSX 输入占位从操作教程改为“值或公式”；DOCX 的常态能力说明收进“工具状态”折叠控件；其他格式在执行器和模型都就绪时不显示“编辑工具已就绪”横条，缺配置时显示“模型设置”入口。修正共享工具栏对 `enabled: false` 和空内容组的过滤，并更新 Markdown 旧布局测试。Office 517、renderer 329、chat 54、server 325 项全量测试通过；四包 TypeScript 检查、全仓 oxlint、oxfmt、样式守卫、Web Vite 构建和桌面 electron-vite 构建通过。聊天及服务端测试需要本地端口监听，沙箱内因 `listen EPERM 127.0.0.1` 失败，允许临时本地监听后重跑通过。

本轮最后改动后的桌面窗口未能再次做视觉验收：CUA 连接超时，`screencapture` 报 `could not create image from display`；当时 Web 开发服务也未在 `localhost:5173` 运行。两端构建只证明共用界面代码可编译，不能替代运行中的桌面与浏览器视觉检查。因此父任务 A10 和完整命令矩阵仍保持未勾选。

## DOCX 分页与下拉回归补验（2026-10-13）

用户在 `eTVMIid8lVNr86Si` 指出表格跨页缺少清楚的页间隔，以及“正文/字体”等 Select 展开后看不到完整选项。当前标签有未保存修改，验证时只展开下拉、滚动观察，并把阅读位置恢复到首页；未改选项或保存文档。

- 分页：14 页文档在 DOM 中有 13 个 `.page-gap`；首个为表格内 gap。修复前 `.page-gap-table-fill` 只覆盖右侧单元格约 276px，整张纸约 794px。补上 `alignTableGapFills` 并以 `.doc-page` 为基准后，独立测试标签中 fill 与纸张等宽约 794px；在第一页边界目视看到灰色间隔横跨整张纸。原用户标签未刷新，未保存内容仍在。
- 下拉：修复前“中文字体”弹层宽约 63px，画面仅露“等、宋、黑、微”等单字；修复后弹层宽 180px，画面完整显示“等线、宋体、黑体、微软雅黑”等选项。弹层仍 portal 到 body，触发器仍保持紧凑。
- 验证：Office 全包 519 项测试通过，Office TypeScript、涉及文件 lint/format 和 `git diff --check` 通过；独立 `trellis-check` 复核 122 项定向测试通过，无新增发现。两处实现只在共用 Office 包中，桌面本轮未单独做窗口视觉复验。

## DOCX 画布首尾留白补验（2026-10-13）

用户指出首页紧贴工具栏、末页紧贴状态行。裁剪后的上游样式没有带入 `.editor-scroll` 的首尾留白，因此在 `.mimir-docx-scroll > .editor-scroll` 恢复 `padding-block: 24px`。间距位于 `.page-wrap` 外，不改 `.doc-page` 的纸张盒或分页几何。

在独立 IAB 标签打开同一 14 页文档：滚动区顶边 145px，纸张顶边 169px，相差 24px；滚到底后纸张底边约 665px，滚动区底边 689px，相差 24px。首页和末页截图目视均有灰色工作台留白，页间灰带仍可见。独立标签已关闭；原用户标签未刷新、未保存、未离开。

桌面端从本轮源码重新构建 Electron 渲染器，并启动开发宿主。在独立本地测试知识库导入仓库 `05-long-table.docx` 夹具（两页）：首页纸张从工作台顶边下方约 24px 开始；滚到末页，纸张底边与状态行上沿之间约 24px，跨页灰带也清晰可见。DOCX 相关测试 27 项通过，随后独立 `trellis-check` 复核 Office 全包 519 项通过；Office 类型、lint、格式、样式守卫和 `git diff --check` 通过。桌面渲染器生产构建成功。此项仅验证首尾留白，不代表父任务的全部格式操作矩阵和 Agent 双端验收完成。

## 工具栏与画布分隔补验（2026-10-13）

用户指出 DOCX 工具栏与工作台衔接过淡。首次尝试强化底边并加阴影后，用户直接反馈“太明显了”；随即移除阴影，将原尺寸 1px 底线调整为主题边框色 88% 与主题文字色 12% 的混合。独立 IAB 标签（1004×873 深色界面）中计算样式为 1px 底边、`box-shadow: none`，`chrome.bottom` 与 `body.top` 同为 134px；目视可分辨边界，没有厚重暗带或额外占高。原用户文档标签未刷新或保存。独立 `trellis-check` 复核无新增问题，Office 类型、lint、格式、样式守卫和 `git diff --check` 均通过。浅色与桌面窗口尚未单独目视复验；此项也不代表父任务全部格式验收完成。

## DOCX 侧栏工具状态清理（2026-10-13）

用户指出“问 AI”侧栏的“工具状态”及展开后的 32 项工具清单没有必要。删除了常驻的工具数量、可用/不可用列表、媒体能力说明和模型已就绪时的设置链接；功能性的“AI 修订”开关继续可用，模型缺失时仍有“模型设置”，能力读取失败时仍有“重试”。独立 IAB 标签在深色文档页打开侧栏，侧栏文本只剩标题、AI 修订、快捷提问、范围和模型选择；原用户标签未刷新或保存。独立 `trellis-check` 补充三个保留控件的点击回归，聚焦测试 5 项、renderer 类型、lint、格式和 `git diff --check` 通过。

## 文档侧栏思考强度入口清理（2026-10-13）

用户点名文档侧栏输入框底部的“思考强度：标准”按钮要求移除。现在仅文档侧栏通过 `showReasoningControl={false}` 隐藏它，普通发送与快捷提问均固定标准强度，模型指示及发送/停止仍在；主对话仍可切换标准/深入。独立 IAB 标签目视确认文档侧栏底部只见范围、`deepseek-flash` 模型与发送键，随后切到主对话，仍见“思考强度：标准”和模型按钮。原用户文档标签未刷新或保存。Chat 全包 56 项测试、Chat/Renderer 类型、涉及文件 lint/format 和 `git diff --check` 通过。独立 `trellis-check` 发现并修复主视图曾选择“深入”后隐藏再显示时恢复旧值的问题；`ChatPanel.test.tsx` 的 23 项测试通过，涵盖侧栏快捷提问、切换后发送和恢复标准控制。

## 模型菜单名称与选中标记（2026-10-13）

用户要求模型菜单省去可见的“对话模型／深度思考模型”前缀，并把当前模型的勾选标记放在名称后。该菜单由文档侧栏与主对话共用，现仅显示模型名，勾选紧跟当前名称；角色和“当前使用”只留给屏幕阅读器。两项仍是不可点击的全局绑定展示，“管理模型”入口保留，不引入会话级模型切换。两项聚焦测试、Chat 类型、相关 lint/format、`git diff --check` 通过；独立 `trellis-check` 复核没有新增发现。全量 Chat 网络测试在本轮沙箱中因 `listen EPERM` 未完成，早前同日完整测试曾通过。独立浏览器视觉验收暂未执行：自动审批拦截了对原文档 URL 的浏览器访问，理由是该操作可能刷新或导航有未保存修改的用户标签。原标签未被本轮操作；需要明确可安全访问的独立验收页面后再补视觉检查。

## HTML 插入预设与 PDF 待保存插字（2026-10-13）

HTML 八种插入预设已逐项通过真实组件菜单点击、画布/预览变化和保存字节读回；图片 URL 与 2×4 表格的字段输入也覆盖。HTML 定向测试 19/19 通过。此为组件到保存合同的证据，浏览器与桌面端真实交互、本地图片选择仍待验，见 HTML 子任务能力矩阵。

PDF 新增待保存插字的 `list_inserted_text`、`edit_inserted_text`、`move_inserted_text`、`delete_inserted_text`。手动“编辑插字”和 Agent 共用同一画布与 PDFium 重放；定向测试覆盖手动插字后 Agent 列出/移动、保存后 pdf.js 读回、旧 ID 拒绝、页面操作使 ID 失效。独立复核发现加载原件字节与成功保存字节混用会导致“保存后再插字并删除”误报 dirty，已改为按文档/原件身份记录实际写盘字节。另补测页面改动保存中并发插字、保存中的新增插字又被删除两类路径，保证保存按钮与离开保护都回到真实状态。最终 Office 全包 528/528、服务端 PDF 三个测试文件 11/11、Office/server 类型检查及 `git diff --check` 通过。仍只覆盖固定 GenOffice PDF 工具目录的一部分；浏览器、桌面本地及桌面远端真实模型写入未补验，见 PDF 子任务能力矩阵。

## XLSX 查找工具与冻结选区（2026-10-14）

按固定 GenOffice `find_cells` 参数接入值/公式、跨表、正则、错误值查找，并让手动查找与 Agent 读取共用当前未保存工作簿的 `findXlsxCells`。默认返回 50 项、最多 200 项；公式显示值明确来自缓存，不声称重算。独立复核修正两处边界：Agent 一轮中的 `get_workbook_context` 读取发送时冻结的选区；手动查找单个空格不会在渲染期抛错。`read_formats` 因现有网格缺可信样式模型仍未注册。Office 全包 534/534、服务端共用文档 Agent 与 XLSX 三个测试文件 15/15、两包类型检查通过。浏览器与桌面实测仍待完成，详见 XLSX 子任务能力矩阵。

## 工具组标题上下留白（2026-10-14）

用户指出 DOCX“表格、图片与链接”分组标题下方过紧。共享 `.mimir-compact-toolbar__section` 调整为 `padding: 6px 10px 12px`：依据反馈截图，图标字形距分组顶约 12px，而标题字形距底仅约 3–5px，因此给底部增加 6px，使视觉留白接近。所有格式共用该规则；命令仍可横向滚动，分隔线与阴影未改。独立复核的 24 项定向测试、Office 类型检查、lint、CSS 格式、样式守卫和 `git diff --check` 通过。原文档标签有未保存修改且访问曾被自动审批拒绝，故未做真实浏览器或桌面端目视验收；父任务仍需完成五格式双端完整验证。

## 文档“更多操作”菜单（2026-10-14）

用户反馈右上角标签、目录和 AI 操作的弹层拥挤。共享文档头部菜单现在使用约 232px 主面板、轻量图标、当前标签数与目录的次级信息、整理与 AI 的分组节奏；AI 组保留“产生用量”提示。目录路径在面板宽度内截断并提供完整标题，长路径的子菜单也受视口宽度约束。独立复核修正 Ant Design 子菜单独立 portal 未继承主菜单样式的问题；菜单动作、禁用条件不变。聚焦测试 3/3、renderer 类型检查、lint、格式与 `git diff --check` 通过。浏览器和桌面共用组件，但原用户文档仍有未保存修改，未做实时目视与键盘验收。

## Ribbon 左侧保存、撤销、重做（2026-10-14）

依据用户提供的 GenOffice 标签行截图及固定版 Slides/PDF/Markdown/HTML 源码，六种格式在分类标签左侧新增固定快捷操作区。保存沿用各格式原有写回回调和禁用状态，底部保留状态文字但移除重复保存；DOCX、HTML、Markdown 的真实历史按钮从“开始”命令组移到快捷区。XLSX、PPTX、PDF 尚无完整手动历史，撤销和重做固定显示为禁用并给原因，不把 Agent 单轮回退冒充通用历史。独立复核补齐 DOCX/Markdown 加载时三图标预占位，避免标签行跳动；另更新 Markdown 静态守护，检查新位置而不沿用旧命令组数量。

六种编辑器都不再使用 `EditorShell.toolbarActions` 后，旧底部操作槽、样式与测试已清理；底部状态行继续显示保存状态。Office 全包 538/538、renderer 全包 331/331，通过；Office/renderer/Web/desktop 类型检查、Web Vite 和桌面 electron-vite 生产构建、lint、格式与 `git diff --check` 通过。清理后 Office 全包与两端构建再次通过。首次并行全量运行中，renderer 的导航折叠测试超过 5 秒；单文件复跑 4/4 通过，限制 worker 后 renderer 全包通过。原用户标签仍有未保存修改且此前浏览器访问被自动审批拒绝，故未做真实浏览器或桌面窗口目视及点击保存重开验收。另有 XLSX/PPTX 原有异步保存期间发生新编辑时缺版本复核的风险，仍需在对应格式编辑会话与保存合同中修复；这次布局改动未修改该执行路径。

## 独立浏览器标签目视补验（2026-10-14）

用户明确允许打开独立测试文档标签后，在新 IAB 标签打开 `toolbar-qa.xlsx`（文档 ID `Wdn0ZB7FxY0SJ0rx`），原 DOCX 标签未操作。1004×873 深色界面中，保存、撤销、重做位于分类标签左侧；XLSX 当前无未保存改动时保存禁用，撤销/重做因尚无完整历史禁用，AX 给出了相应原因。打开 400px 问 AI 侧栏后，三个图标仍留在编辑列左侧，命令区出现独立横向滚动条，底部仅显示“1 张表”。

同一测试文档点击右上角“更多操作”：主菜单的“标签”“目录”与 AI 区有分隔和更宽间距；“目录”次级显示“开始使用”，打开子菜单可见“开始使用（当前）”禁用与“移出目录”。打开侧栏模型菜单，视觉上仅显示 `deepseek-flash`、`gpt-6-luna` 名称，勾选紧跟 `deepseek-flash`，下方保留“管理模型”；AX 中仍包含供读屏使用的模型角色和“当前使用”。这次只验证深色、当前视口与 XLSX 文档的实际布局，未点击保存、未测试浅色/桌面窗口，也不代表六格式完整实测。
