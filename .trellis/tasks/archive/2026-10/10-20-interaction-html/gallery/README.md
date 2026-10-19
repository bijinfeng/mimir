# HTML 真实组件交互 Demo

入口直接导入实际 `HtmlEditor`、renderer `MimirProvider` 与 `editor-theme-bridge`。CodeMirror、iframe、Ribbon、元素 Inspector、插入面板、图片工具、AI 问题/提纲/写作状态和演示覆盖层均沿真实产品实现，不手绘替代组件。before/after 使用同一份 fixture，基线冻结在 `0c44cde`，after 跟随工作区。

## 启动与参数

从仓库根运行：

```sh
GALLERY_SOURCE_ROOT=/private/tmp/mimir-html-baseline-0c44cde pnpm --filter @mimir/web exec vite --config /Users/admin/Desktop/mimir/.trellis/tasks/10-20-interaction-html/gallery/vite.config.mjs --port 5200 --strictPort
pnpm --filter @mimir/web exec vite --config /Users/admin/Desktop/mimir/.trellis/tasks/10-20-interaction-html/gallery/vite.config.mjs --port 5201 --strictPort
```

- before `http://127.0.0.1:5200/?scene=body`
- after `http://127.0.0.1:5201/?scene=body`
- `theme=light|dark`，实际编辑列尺寸 `width=1100&height=760`，宽度最多为浏览器可用宽。此参数不改变浏览器 viewport。
- `capture=1` 隐藏辅助导航与日志；`Alt+Shift+H` 显隐。不会改变产品组件样式。
- `io=controlled|success|error`：默认手动请求，每次点击完成/失败；也可选立即结果。默认读取固定 HTML 立即成功，`load-pending` 才等待手动；`load-error` 第一次读取失败、真实重试恢复。
- `capabilities=missing` 移除可选 Agent 服务和宿主预设回调，用真实禁用说明表达缺能力。
- `interaction=HTML-001` 等 92 个 ID 可由辅助索引导航。`coverage-map.json` 记录真实来源、入口、适用状态与边界；映射不表示已经逐项浏览器验收。

场景导航只选择固定原件或 IO 条件，不自动打开菜单。`source`、`preview`、`find`、`element`、`layout`、`image` 等需要操作者点击真实 Ribbon/iframe。不能把 URL 场景名当作对应状态已出现的证明。

## 真实操作入口

- 视图：点击视图分类，操作源码/分栏/预览、桌面/平板/手机、缩放；开始分类可查找替换。源码编辑、行列、历史和选区来自真实 CodeMirror。
- 元素：点击真实预览中的标题、正文、卡片容器、图片、链接或表格，再从开始分类打开编辑元素。Inspector 的文字样式、结构命令、图片和 CSS 使用真实源码补丁/版本/撤销路径。没有手造 postMessage 或读取隐藏实例。
- 插入：插入分类→真实插入元素面板，涵盖所有已有类型和参数。远程图片 URL 操作可能触发真实网络；安全离线验收应使用固定内嵌 PNG 或本地文件，不假称 CORS/远程服务已验。
- 图片：固定原件内含本地生成的 480×240 RGB PNG。真实点选图片后，裁切和去背景执行真实 Canvas 像素处理，应用只改 fixture 内存原件。浏览器本地文件选择器、真实外部图片读取须独立验收。
- 前置问题：点击“打开实际前置问题”，公开 Agent `execute(ask_clarification)` 打开真实单选+多选面板；跳过/提交/Escape/外部取消均沿产品 Promise 生命周期。
- 提纲：点击“开始实际提纲流程”→完成模拟请求→真实提纲确认面板。当前为 `extract` 模式，确认将提纲固定进 fixture HTML，不自动生成页面；重新拟定会再次等待模拟规划请求。`brief-long` 固定 12 章节与长字段供滚动验证。
- 写作：点击“开始实际写作流程”，公开 Agent `execute(write_document)` 驱动真实写作 hook。点击“发送模拟增量”增加固定 HTML；完成请求将完整页交真实 handle 落地。先增量再失败/真实“停止生成页面”可进入实际部分保留/丢弃。停止与保留的含义沿产品实现。
- 过期：写作期间可直接编辑真实 CodeMirror；辅助“修改原文使草稿过期”调用公开 `handle.applyOps(str_replace)` 改源码，不冒充人工键盘输入。真实 hook 决定过期和保留禁用。
- 整轮：辅助“撤销实际 Agent 整轮”调用公开 `undoRound`。保存：点击真实保存按钮→完成/失败模拟请求，验证 dirty/失败/重试。日志仅记状态/字符或字节数，不记录全文或凭据。
- 演示/导出：视图分类的演示覆盖层、新窗口、全屏和 HTML 下载均为真实浏览器动作，没有拦截或伪造结果。导出只生成 fixture 原件副本，不写知识库；弹窗/全屏/下载权限与实际文件字节由主任务浏览器验收。

## 模拟与未验边界

原件加载/保存和模型规划/写作服务是显式受控 Promise；不会请求后端、连接模型、上传用户数据、保存文件或数据库。模拟成功不证明真实服务、落盘、重开、原生文件选择、离开守卫或字节保真。fixture 没有全站宿主的保存/丢弃/取消导航守卫，不能冒充已验。安全消息、格式保真、版本拒绝、异步身份和业务保存还须产品行为测试或实际宿主证据支撑。

fixture HTML 只包含本地 data PNG、系统字体、锚点链接和固定内容，没有默认外部资源请求。真实原件允许的脚本/网络/sandbox 保持产品实现；不要将 fixture 的离线内容当成产品禁止网络的声明。图片裁切 vendor 暂无键盘裁区移动入口，不能声称全键盘可用。AI 写作沿既有 preview iframe 临时呈现匹配版本的草稿，源码仍保持原文直到明确保留或正常完成；本轮只重组计数、说明与动作，不新增独立草稿画布。

## 静态归档及证据

```sh
python3 .trellis/tasks/10-20-interaction-html/gallery/build-archive.py
```

生成 `docs/visual-comparisons/2026-10-20-html/demo/dist/{before,after}/index.html`，用静态 HTTP 服务打开。入口为 ES 模块，不承诺 `file://` 可直接使用。before/after 从相同 fixture 动态别名到不同真实源码；未修改 vendor。为 vendor 普通 import 中只用于类型的名称使用 esbuild 标准类型擦除（`verbatimModuleSyntax=false`），无运行时组件替换。

每份 bundle 的 `source-manifest.json` 记录真实参与构建的项目/fixture 源文件 SHA；`build-manifest.json` 记录完整资源字节数、SHA 和 aggregate（按排序后的相对路径、制表符、SHA 用换行连接后再 SHA256）。构建原始日志在 demo/build-logs。`headAtBuild` 是构建时当前 HEAD，不表示未提交工作区等于该 commit；具体内容依源码 SHA。修改 fixture 或产品后须重建，最终验收以主任务最新 manifest 与浏览器/测试证据为准。

2026-10-20 准备验证：双份真实组件 production build 已通过；gallery `oxlint --deny-warnings` 已通过。Vite 有 antd 的 `use client` 打包提示和单包体积提示；这些不是运行验收。浏览器逐项验证由主任务负责，当前 coverage 未声称执行完成。

归档后源fixture位于 `.trellis/tasks/archive/2026-10/10-20-interaction-html/gallery/`；上方启动命令保留实施时路径，重新启动时将config路径替换为归档目录。也可直接在仓库根用静态HTTP服务打开 `docs/visual-comparisons/2026-10-20-html/comparison.html`，操作已保存的Demo，不依赖临时5200/5201服务。
