# DOCX 真实组件交互 Demo

直接使用实际 `DocxEditor`、`MimirProvider`、renderer `editor-theme-bridge`、真实 Tiptap/ProseMirror、分页/字体、Ribbon 和各 Inspector。before/after 用同一份 fixture 编译，不手绘产品控件，不通过 DOM 或私有 state 假造选区、保护或禁用条件。

## 启动与参数

```sh
GALLERY_SOURCE_ROOT=/private/tmp/mimir-docx-baseline-6f6af4c pnpm --filter @mimir/web exec vite --config /Users/admin/Desktop/mimir/.trellis/tasks/10-20-interaction-docx/gallery/vite.config.mjs --port 5202 --strictPort
pnpm --filter @mimir/web exec vite --config /Users/admin/Desktop/mimir/.trellis/tasks/10-20-interaction-docx/gallery/vite.config.mjs --port 5203 --strictPort
```

- before：`http://127.0.0.1:5202/?scene=rich`
- after：`http://127.0.0.1:5203/?scene=rich`
- `theme=light|dark`；`width=1100&height=760` 设置实际编辑列尺寸（宽最多浏览器可用宽），不改浏览器 viewport。
- `capture=1` 只隐藏辅助区；`Alt+Shift+H` 恢复/隐藏。
- `scene` 选择固定原件或 IO 条件，不自动打开所命名的面板。`chart`、`textbox`、`page`、`watermark`、`notes`、`styles` 等仍需点击真实 Ribbon，不把 URL 当作交互已执行的证据。
- `io=controlled|success|error`：默认所有保存等待手动完成/失败；读取默认直接读同源静态原件。辅助下拉可以改变后续请求模式。

`scene=rich` 包含实际上游 kitchen-sink 的标题、富文本段落、列表、原生表格、图片、公式与分节。`headings` 为多层标题；`report` 为中文报告；`columns` 为双栏原件；`footnotes` 为原生脚注原件；`standard` 与 `agile` 为真实加密容器。数据源详见 `fixture-manifest.json`（原路径、基线、字节数和 SHA，逐份比对证明未修改）。

## 主要操作

- 图表/文本框：插入分类→图表/文本框。选择、创建、编辑、取消都沿真实组件。默认固定原件不包含的对象须从真实 UI 插入，不伪造选中。
- 页面与节/水印：布局相关实际分类→页面与节/水印；所有字段、预览和写入为真实原生文档操作。
- 管理脚注与尾注：审阅→修订与拼写组→管理脚注与尾注；可改用 `footnotes` 原件查看已有原生条目。
- 管理样式：开始→样式组→管理样式。列表、引用、审阅、墨迹、导航、保护等保持各自原有入口。
- 查找：真实查找按钮或编辑器 `Ctrl/Cmd+F`，关闭、Escape、焦点返回由产品处理。
- 保存：在真实正文或属性工具改动后点真实“保存到库”，再用辅助“完成模拟请求”或“失败模拟请求”手动结算。成功字节仅保存在当前 fixture 页面的内存，未写磁盘或数据库。
- 重开：成功完成一次模拟保存后点“重开最近模拟保存原件”，用 `documentId` 正常切换真实来源并重新解析最新保存的完整 DOCX 字节。会丢弃成功保存之后的额外未保存变更，按钮已说明。这个路径可验证本地原生读写循环，但不证明真实知识库持久化。
- 加载异常：`load-pending` 读取固定字节后等待手动完成/失败；`load-error` 首次读取抛错，真实“重试”恢复。
- 原生加密：`standard`/`agile` 打开真实 DOCX 解密流程，样例文档密码为公开测试夹具的 `Password1234_`（来源 `docx-encryption-bundle.test.ts`，这是文档密码，不是登录账号）。错误密码、取消和重试均由真实组件处理，Worker 也是实际实现。
- 辅助“读取真实 Agent 上下文”只调用公开 `handle.getContext()` 和 `getVersion()`；日志只记录块数和版本，不记录正文或凭据。默认无模型、后端或上传服务。

## 真实/模拟与未验边界

真实组件直接解析、显示、修改、撤销、导出和物化原生字节；宿主 `load/save` 是显式模拟。只从同源静态资产读取固定文档，所有默认图片/字体均本地；不连接真实后端、模型、数据库，不写用户数据。保存失败不被吞掉，真实状态行负责显示原因。

全站导航的保存/丢弃/取消守卫不在这个 fixture 宿主中，不宣称已验。原生文件选择/系统剪贴板、打印/下载写盘、外部图片、实际服务端/模型、IME、复杂原件保护与密码互通须主任务在对应环境独立验收。辅助场景和源码清单只证明入口/来源，不证明每项 GUI 行为已经执行。

before source 固定 `6f6af4c`，已归档到 `/private/tmp/mimir-docx-baseline-6f6af4c`，依赖用本地同版本 node_modules symlink；忽略生成的 `src/generated/editor.css` 从当前相同基线复制，未修改 baseline 产品源。字体 alias 按生产配置指向真实 `packages/office/src/fonts`，不用替代字体冒充分页结果。

## 静态构建与指纹

```sh
python3 .trellis/tasks/10-20-interaction-docx/gallery/build-archive.py
# 只在产品稳定后更新 after：
GALLERY_BUILD_VARIANTS=after python3 .trellis/tasks/10-20-interaction-docx/gallery/build-archive.py
```

输出 `docs/visual-comparisons/2026-10-20-docx/demo/dist/{before,after}/index.html`。通过静态 HTTP 服务打开；不承诺 `file://` ES 模块可用。每份 `source-manifest.json` 记录真实参与编译的项目源文件；`build-manifest.json` 记录完整资源与 aggregate SHA256。aggregate 是按相对路径排序后的 `path + tab + sha256` 以换行连接，再求 SHA256。`headAtBuild` 只记录构建时 HEAD，工作区的真实内容以 source SHA 为准。fixture/产品改变后须重建，截图与最终验收由主任务负责。

使用 esbuild 标准 TS 类型擦除处理 vendor 普通 import 中仅用于类型的名字，无 vendor 文件修改或运行时替换。构建可能输出 antd `use client` 与包体积提示，成功构建不等于运行验收。原始构建日志在 `demo/build-logs`。分发同样包含 Carlito/GenOffice 字体 OFL 与 msoffcrypto fixture MIT 声明。

2026-10-20：before production build 通过（44 资源，含3份许可）；gallery `oxlint --deny-warnings` 通过。浏览器与最终 after 证据由主任务完成后登记，不把本说明当完成声明。


## 全部稳定交互索引

研究清单完整映射为 `coverage-map.json`：13个界面、92个独立状态、24个参数化动态入口族、349个静态控件/范围，共478个唯一ID。每条保留精修前源码文件与行号、研究原文位置、类型与参数模式、恰当原件、真实进入步骤、适用主题/尺寸及未验边界；所有条目目前明确 `source-only` / `browserStatus=unverified`，不将源码盘点或DOM索引测试称为GUI验收。

独立可搜索页面：live 的 `http://127.0.0.1:5202/interactions.html`；静态归档的 `docs/visual-comparisons/2026-10-20-docx/interactions.html` 与 `demo/interactions.html`。支持ID/标签/源码/参数搜索和类型/模块过滤，以及给真实Demo选主题和编辑列尺寸。两份静态页面使用各自正确的相对Demo路径。源码引用是基线文件位置文本，不误链到当前已移动的行；原文hash在coverage inventory字段。

生成：`python3 .trellis/tasks/10-20-interaction-docx/gallery/build-interactions.py`；完整build脚本会先调用它。它只维护额外索引与coverage，不改变已冻结的主fixture结构、数据或配置。链接只打开实际组件与固定原件，不自动打开所需菜单、不注入任何产品状态。缺少的损坏或受保护原件以及需要本地文件/Canvas/真实环境的状态分别写明，不能把相关入口可达称为对应异常已复现。
