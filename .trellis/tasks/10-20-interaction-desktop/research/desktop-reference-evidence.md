# Research: Desktop 官方参考与适用边界

- Query: 核对 WeKnora 官网/源码，选择适合桌面载体的官方布局参考，并保留已批准语雀视觉方向。
- Scope: mixed
- Date: 2026-10-20

## Findings

所有 HTTP 状态、解析后 URL、字节数、SHA-256 和选取的原始源码行已落盘 `external-evidence.json`。本次实际重新请求官网与 GitHub API，未把上轮缓存当作新的检查。

### WeKnora（必查，非桌面窗口设计主模型）

- [官网](https://weknora.weixin.qq.com/) 200；本次返回站点 HTML 113529 bytes，页面响应不能证明已登录应用的交互。
- [最新公开 release v0.8.3](https://github.com/Tencent/WeKnora/releases/tag/v0.8.3)，发布时间 2026-10-14T07:53:24Z。
- 实际源码固定于 [`eecfe4b3c8c34c94e9b559e5dd02187b4ae447cd`](https://github.com/Tencent/WeKnora/commit/eecfe4b3c8c34c94e9b559e5dd02187b4ae447cd)，committer date 2026-10-19T16:11:36Z；**不声称 main commit 等于 release tag**。
- 固定版本 `frontend/package.json:3` 为 0.8.3，依赖 Vue/vue-router；`frontend/src/router/index.ts:44` 使用 createRouter/createWebHistory；`frontend/src/App.vue:281` 用 RouterView，`:127` 在知识库与 workspace onboarding 间导航。
- 这些证据说明它的知识库/Agent 浏览器壳有路由与 onboarding，但不是 Electron 原生标题栏、操作系统窗口按钮、file setup 或本地/远端 Session 切换模型。本轮不引入 WeKnora 登录页、部署配置或 Markdown editor。完整树中选择的布局候选也已记录，不能把没有发现 Electron 文件名当成对所有部署形态的证明。

### Obsidian（桌面布局主参考，仅原则级适配）

官方帮助页 [Sidebar](https://help.obsidian.md/user-interface/sidebar)、[Create a vault](https://help.obsidian.md/getting-started/create-a-vault) 均 200，重定向到 obsidian.md/help；HTML 是发布容器，因此同时取官方公开帮助源。

官方帮助仓库固定于 [`cd6c9f3c7d5492bbbec94e8f403572b84eeb325b`](https://github.com/obsidianmd/obsidian-help/commit/cd6c9f3c7d5492bbbec94e8f403572b84eeb325b)，committer date 2026-10-19T15:13:44Z。这是**文档版本**，没有据此猜测安装的应用版本。

- `en/User interface/Sidebar.md:20`：通过明确的左右展开图标打开折叠侧栏；`:34` 图标配 tooltip。应用于 Mimir 单一侧栏折叠按钮的名称、图标、焦点和稳定命中区，不新增右侧栏、拖拽 tab groups 或完整 ribbon。
- `en/Getting started/Create a vault.md:8–25`：首启入口围绕两个真实选项和各自下一步组织。应用于现有“本地使用 / 连接服务器”的清楚分组、地址字段和一次提交；不引入 vault 文件夹选择、同步或本机路径编辑。
- `en/User interface/Appearance.md:8`：浅/深与系统自适应。应用于现有 MimirProvider 和已存在首帧脚本的连续性。文档 `:45` 的 macOS translucency 不作为本轮需求，更不复制紫色主题。

### Electron（原生行为规范）

[Custom Window Interactions](https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions) 200。可拖区需要 `app-region: drag`，其中交互控件用 no-drag；这解释了为何浏览器截图无法验收原生拖动。当前 desktop package 的 Electron **声明范围**为 `^44.4.5`，electron-vite 为 `6.0.0-beta.7`；本轮不是依赖升级，不将范围当成机器实际安装版本。

### 对 Mimir 的落点

继续使用共享 MimirProvider/BrandMark/WindowControls，白灰工作面、绿色主操作、紧凑密度。Obsidian 只解决布局与可发现性，原生行为由当前 Electron 合同决定；WeKnora 仅提供按领域必查的边界证据。本轮无需外部图标、字体、素材或复制第三方 UI。

### 相关 specs

`.trellis/spec/project/design.md` §0.1 明确语雀方向取代旧冷灰蓝，Obsidian 只作连续工作区布局对照；§9 品牌同源。
`.trellis/spec/desktop/runtime/conventions.md` 明确仅本地加载自绘标题栏、云端用系统边框；`pitfalls.md` 明确 no-drag、file setup 和 Session 切换不可退化。

## Caveats / Not Found

未启动 Obsidian 或 WeKnora 登录态应用，没有像素级参考截图；本报告绝不声称精确复制其桌面外观。WeKnora 是旁证，Obsidian 官方文档说明能力而非 CSS 数值；具体尺寸应通过 Mimir 真实组件前后渲染和当前设计 token 验收。
