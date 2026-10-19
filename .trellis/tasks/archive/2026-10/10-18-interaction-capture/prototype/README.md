# 收集与导入 · HTML 交互评审 v1

仅供规划评审，尚未获本模块具体版本的产品实施认可。没有产品组件导入、业务 API、真实抓取、文件读取或上传；样本数值是明确的说明数据。

## 查看与定位

主会话评审地址：`http://127.0.0.1:5184/review.html`。默认部分失败的 3 文件批次；右上切「打磨后」可完整单侧查看，并排画布保持相同宽度，比较区局部横滚，不缩小产品文字。内置 9 组、91 个稳定覆盖 ID，对应源码盘点 `../research/capture-scenes.json`，这些是交互覆盖项，不是 91 个独立页面。`coverage.json` 逐条指向 `review.html#scene=<id>`，每项有可体验路径。

顶部提供当前/打磨后/前后对比、浅深、桌面620×650、窄屏390×844、低高度844×480、200%文字和减少动效；文字开关是布局压力演示，不等同浏览器原生200% zoom。侧栏可搜索场景标题、ID和说明。所有场景都可重置，左右交互彼此独立，同一基础样本对应同一结果。

「评审工具」位于产品画布外：控制成功/失败响应、输入组合事件、模拟选择、重复drop、外部目录变化与退出边界。F6 在当前产品画布与对应工具间切换，解决忙碌弹窗 Tab 被限制时的键盘演示路径。每个初始等待态保持不动，直到工具给出模拟结果；不假装实时阶段、百分比、后台取消或原生选择器。

## 可体验范围

- 展开/紧凑/窄屏导航、命令面板、添加菜单、空库入口；根目录和当前目录落点一致，目录不能在弹窗另选。
- URL 空值/空白/缺协议/不完整/长内容/超过2000、清除、网页/公众号/GitHub来源、失败草稿、Enter及组合事件保护。更多数据工具可切 GitHub 子路径及查询子串识别边界样本（完整URL校验后仍沿用共享来源规则）。
- 单请求等待，明确失败阶段，未知前序不补勾；完整长错误；已返回阶段按 status 呈现；无图、部分失败、有结果无ID、规范URL去重等防御边界。成功260ms窗口仅被评审工具暂停，原自动交接合同保留。
- 文件按顺序逐项处理、同步批次锁、未知格式保原件、提取失败原件、Markdown笔记与空正文、超限/零字节、网络结果不确定、整批成功/部分失败/全失败、首个成功的手动打开与清除结果后重新选择。
- 文件夹首段与相对路径保留，空目录不建实体；原生能力边界说明。重名/隐藏/无后缀、长后缀、长错误、24项滚动可通过更多样本切换。
- 整页drop当前的背景串行与仅toast结果，对比拟统一逐项面板和单批次保护；Files覆盖、经过子节点、离开、空列表、非Files、非folder及目录拖放能力边界。
- 空闲关闭/Esc/遮罩回焦、重新打开清草稿、忙碌锁闭、当前忙碌切页签队列丢失与提案锁tab。普通关闭不撤销保存的文件。
- 上传结果刷新与打开前拟复用未保存guard：继续编辑保留结果、手动丢弃、自动保存、Office无法代存、保存中、失败与再保存。当前列直接展示既有无guard交接，不虚构现有保护。

## 当前列证据与限制

当前列根据本轮 `verification/current-*.png` 的540px弹窗/空上传/URL识别和当前源码静态复现。错误、请求中、逐项结果及未保存缺口没有真实请求采样；这是语义与版式复现，不宣称所有状态像素还原。双方使用同一外观体系，未刻意制造旧主题作对照。

新交互明确只在打磨后：完整URL校验/2000上限与IME单飞、忙碌锁tab、交接锁、结束刷新查询、整页drop统一结果、结果打开前保存保护、空正文Markdown真实说明。目录打开后改名/删除仍可能按旧路径入库，本轮只说明风险，不添加冲突API。

操作系统文件/目录选择器、文件系统权限、真实文件拖放、OS输入法候选、触屏、辅助技术播报、Electron、真实权限/网络/解析/保存结果仍未验证。HTML中的选择和组合事件模拟不能替代这些验收；实际产品实施必须另获认可。

## 构建与自检

使用仓库已有 React、ReactDOM、lucide-react、Vite；图标和字体无CDN。`build.mjs` 内联本地JS/CSS生成单文件`review.html`，`dist/`为中间产物不纳入提交。

```sh
node_modules/.bin/oxlint .trellis/tasks/10-18-interaction-capture/prototype/main.tsx .trellis/tasks/10-18-interaction-capture/prototype/fixtures.ts .trellis/tasks/10-18-interaction-capture/prototype/build.mjs .trellis/tasks/10-18-interaction-capture/prototype/check-artifact.mjs
packages/renderer/node_modules/.bin/tsc -p .trellis/tasks/10-18-interaction-capture/prototype/tsconfig.json
node .trellis/tasks/10-18-interaction-capture/prototype/build.mjs
node .trellis/tasks/10-18-interaction-capture/prototype/check-artifact.mjs
```

当前 pnpm exec 可能因其他会话的依赖改动自动同步全工作区，本目录验证直接调用已有二进制。隐藏目录格式检查用根目录普通文件名作为 `oxfmt --stdin-filepath main.tsx` 参数读取源文本，避免.gitignore跳过。`checks.json` 记录结构/覆盖与静态夹具断言；主会话的浏览器截图、hover几何、焦点与滚动证据单独写入verification/，构建通过不能代替实际效果验收。
