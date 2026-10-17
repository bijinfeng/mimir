# Research: 语雀方向主题迁移的消费链与最小边界

- Query: 除 `tokens.ts` / `customToken.ts`，Mimir 从蓝色冷灰迁到中性灰与绿色，还需要同步哪些主题桥、导航状态和测试契约？
- Scope: mixed；本地消费链与规范为主，引用本任务已核对的 WeKnora 官网和版本源码证据。
- Date: 2026-10-16

## Findings

Mimir 已有共享主题系统，可继续使用。仅换色时，多数 Chat / Office / Desktop 样式会自动继承；必要改动集中在启动底色、旧色值测试，以及少数未接通的 Office 变量。若最终选择“导航用灰色选中底、绿色只做局部强调”，需要把导航选中语义从全局品牌浅底中拆出。以下 7 项为高价值迁移风险，不重复主报告的视觉分析。

### 1. 不能因换色重复创建 provider；Chat 桥主要负责字号，Office 桥负责颜色

- `packages/renderer/src/theme/MimirProvider.tsx:45` 统一组装受控 appearance、theme 和 customToken；`:50` 内层 ConfigProvider 只给 locale。给 Chat 或 Office 另传 theme 会重算 CSS 变量 key，现有消费处可能静默失效。
- `packages/renderer/src/components/chat/ChatThemeBridge.tsx:37` 只通过 ChatHostVars 填字号和 gutter，**不是颜色桥**。`packages/chat/src/ChatHostVars.tsx:74` 写内联变量，`:103` 同时承担 flex 高度链。换色无需新增 Chat 颜色变量；字号调整才需同步包内 fallback。
- 主 Chat 的桥在 `packages/renderer/src/routes/_app.chat.tsx:119`、`:133`；文档侧栏在 `packages/renderer/src/components/document/DocChatSidebar.tsx:185`，gutter 是 16px。两种场景都要验收。
- `packages/renderer/src/theme/editor-theme-bridge.ts:48` 起填 `--me-*`：`:55` 强调填充、`:72` 强调文字、`:75` 强调浅底、`:77` 焦点描边、`:81` 工作台底。桥已经分开角色，可以沿用。祖先挂载在 `OfficeSourceEditor.tsx:207`、`NoteEditor.tsx:219`，不可移到编辑器兄弟节点或打断 flex 链。
- `packages/chat/src/custom-token.d.ts:37`、`:40` 只声明 tintList / tintHover / inlineCodeFg。换值不必动这个契约；新增或更名 Chat 实际消费的 token 才同步包侧声明，不让 Chat import renderer 源码。

### 2. 导航选中与品牌浅底耦合，单改 Menu token 不能覆盖本地样式

| 文件与行号 | 实际消费 | 若采用中性导航选中底 |
|---|---|---|
| `packages/renderer/src/components/NavSidebar.style.ts:45` | railActive 用链接字色 + 品牌浅底 | 单独决定 rail 是否仍用绿色强调。 |
| 同文件 `:139`、`:144` | recentItem 的 aria-current 及 hover 分别用品牌浅底/hover 底 | 当前与 hover 成对同步，保留 aria-current。 |
| 同文件 `:200`、`:218` | antd menu-selected 本地以 !important 覆盖底色/字色，角标也用链接色 | **只改全局 Menu 组件 token 不够**。 |
| `packages/renderer/src/components/nav/FolderSection.tsx:129` | 当前页品牌底/链接字色；`:133` location 仅深字与字重 | 同步树当前页，保留“当前位置”和“当前页”的区分。 |
| `packages/renderer/src/components/NavSidebar.style.ts:283` | 设置齿轮激活为品牌底/链接色 | 与 rail 一起决定；`:268` 身份头像单独判断。 |
| `apps/desktop/src/renderer/setup/SetupPage.style.ts:155` | 首启页导航当前项为品牌底/链接色 | 独立页面也需同步，不能只改 NavSidebar。 |

不要为实现灰色导航把 `colorPrimaryBg` 全局改灰：`packages/renderer/src/styles/global.ts:32` 原文引用定位高亮、`settings/settings.style.ts:763` 新模型行闪动、Office 按下态都共用它。建议仅在最终设计明确后，为导航新增独立选中语义。

`packages/renderer/src/components/library/LibraryView.style.ts:78` 面包屑静息已是正文色，`:89` hover 才强调，可保留；`:307` 卡片 hover / focus 品牌边线是自动跟随点，换绿后若太醒目应局部设计，不宜削弱全局键盘焦点。

### 3. Web 与 Electron 首帧仍硬编码冷灰，运行时 token 不会覆盖加载前画面

| 文件 | 当前硬编码与用途 | 需要同步 |
|---|---|---|
| `apps/web/index.html:44` | `#15191f / #e8ecf1`，首帧根背景 | 与新深浅布局底一致，保留外观读取、data-theme、color-scheme。 |
| `apps/desktop/src/renderer/index.html:38` | 同上，桌面主应用 | 同步首帧底。 |
| `apps/desktop/src/renderer/setup.html:33` | 同上，首启选择页 | 同步独立入口。 |
| `apps/desktop/src/main/index.ts:175` | BrowserWindow backgroundColor 同上，按系统深浅判断 | 同步原生窗口加载底，避免旧冷灰闪现。 |
| `apps/web/index.html:11` | meta theme-color 仍是 `#1677ff` | 浏览器工具栏需跟随最终品牌/壳色决策。 |

`apps/desktop/src/renderer/setup.tsx:23` 已复用 MimirProvider；`TitleBar.style.ts:30` 用 colorBgLayout；`SetupPage.style.ts:16` / `:83` 用布局底/导航底。无需新增 Desktop 颜色桥。窗口关闭键 `WindowControls.style.ts:57` 的红色属于关闭语义，应保留。原生窗口按系统外观、页面按持久化偏好的差异是既有问题，本轮无需顺手重做状态协议。

### 4. Office 有确定的旧变量消费，换 token 后仍可能出现蓝色、紫色或透明底

扫描 `packages/` 与 `apps/` 未发现以下 `--me-*` 声明，现有宿主桥也未提供：

- `packages/office/src/editors/PptxCurveControls.tsx:95` / `:105` 用 `--me-primary-soft / --me-primary`，fallback 仍为 `#e8f0fe / #2563eb`。可在实施时接现有 `--me-accent-bg / --me-accent`，避免主题变绿而曲线选中节点仍蓝。
- `packages/office/src/editors/pptx-tools.css:90` / `:101` / `:192` 读 `--me-bg` 且无 fallback，`:196` 读 `--me-canvas`；`html-presentation.css:7` 同读 me-bg、有白色 fallback。需先判定是容器还是文档内容，再选 me-surface / me-stage-bg，不能无差别替换。
- `packages/office/src/editors/editors.css:615` HTML 图片对话框读已删除的 `--me-accent-hover`，fallback 紫色 `#5f48a0`；`shell.css:48` 注释称该变量已退役。需要清除此消费者或提供真实 hover 角色，否则绿色主按钮 hover 仍紫。

边界：`PptxFillControls.tsx:32` Office 调色板、`DocxEditor.tsx:364` 蓝色字体选项、`xlsx-table-styles.ts:95` 文档主题解析都属于可保存内容色，不能随品牌换色批量替换。`thumbnail-sidebar.css:91` 白色纸张预览也不同于应用壳。

### 5. Office 同时消费 --me-* 和 --ant-*，须验两条通道与状态属性

- `packages/office/src/shell/EditorShell.tsx:193` 仅传 componentSize="small"，不新传 theme；Office 工具栏仍以 Office for the web / Google Docs / GenOffice 为主要参考。
- `packages/office/src/shell/shell.css:391` 按下态使用 me-accent 描边、me-accent-bg 底、me-accent-text 字；`:739` 菜单当前值读 me-accent-text。保持现有 aria-pressed / aria-current 选择器。
- `packages/office/src/editors/compact-toolbar.css:70` Ribbon 选中下划线读 **ant-color-primary**，字色读 **me-accent-text**；`:76` 焦点环也直接读 ant-color-primary。必须保证 CSS 变量作用域和校准色都真实生效，不能只查配置。
- `packages/office/src/editors/thumbnail-sidebar.css:49` 当前页缩略图读品牌底/边框，`:112` 页码读强调文字，`:80` 焦点环用强调色。PPTX / PDF 缩略图区应纳入验收。
- Chat 同类关键处：`packages/chat/src/composer/Composer.tsx:81` 输入盒焦点描边，`:168` 发送/停止键主色填充，`:169` 浅字，`:176` hover。这些都会自动换色，绿色的文字/填充角色必须分开校准。

### 6. 测试中旧蓝色精确断言要更新；对比度门槛和真实渲染守卫应保留

主要位置均在 `packages/renderer/src/theme/design.test.ts`：

- **旧值断言**：`:449` 深色链接 #b6d8ff；`:478` 品牌 #245b9e；`:512` Tabs 字色 #b6d8ff / #1d4f8b；`:1213` tertiary 文本 #5c6875；`:1299` / `:1300` provider 注入；`:1344` 深色链接；`:1410` / `:1415` / `:1419` 真实 Tabs 变量与计算字色。按批准的新方案同步，而不是删除真实渲染测试。
- **继续守住**：`:183` 次要文字四底 ≥4.5，`:197` 正文 ≥7，`:207` 链接在容器/选中底 ≥4.5；`:263` 主按钮白字不低于约 4.10 的旧基线，`:278` hover 白字 ≥4.5；`:314` 焦点环、`:373` 选中描边，`:348` 深色质量不回归。
- **表面关系**：`:388` 列底与容器/布局底区分；`:815` hover 对列表底 ≥1.06；`:824` 行内代码、`:849` 语法高亮 ≥4.5；`:883` 选中底区别未选中底。如果新增中性导航 selected token，这里应测真实导航底，品牌浅底仍覆盖编辑器/引用组合。
- **热力图**：`:928` 活动首档区别空格，`:937` 相邻档 >1.15，`:953` 深浅模式按方向单调。换绿不能让“有活动”看似“无活动”。
- **架构守卫**：`:608` 字号扫描覆盖 Chat，`:1280` 内层 ConfigProvider 不改 cssVar key，`:1327` 起真实外观切换、变量替换继续保留。

行为测试继续复用：`packages/office/src/editors/CompactToolbar.test.tsx:45` 点击/箭头键、`:97` 快捷操作与滚动标签顺序、`:210` 实际宽度折叠；`packages/office/src/shell/EditorShell.test.tsx:320` aria-selected、`:1206` / `:1621` aria-current；`packages/renderer/src/theme/appearance.test.ts:69` / `:77` / `:86` 外观状态。Desktop 的 TitleBar.test.tsx / setup/SetupPage.test.tsx 本轮未发现绑定旧蓝色字面值。

后续实施按影响范围跑既有测试和 `pnpm check`，再实看浅/深色、主 Chat/侧栏、知识库导航、六种编辑器共用工具条、桌面首启与加载底色。本轮仅静态研究，未运行实现测试。

### 7. WeKnora 可参考主题组织；其鲜绿不可直接套到 Mimir 白字按钮

- 官网：<https://weknora.weixin.qq.com/>；公开源码：<https://github.com/Tencent/WeKnora>。本任务已有官网截图 `research/screenshots/06-weknora-official.jpg`。
- 已核对版本 **v0.8.3**，发布时间 `2026-10-14T07:53:24Z`，SHA **3e22822c1d2397be730c458c7539d0eb8c113a24**；证据 `research/weknora-release.json`、`research/weknora-source-index.json`；release <https://github.com/Tencent/WeKnora/releases/tag/v0.8.3>。
- 源码 `frontend/src/assets/theme/theme.css` 已保存为 `research/weknora-theme.css`：浅色品牌 `#07c05f`、品牌浅底 `#e9f8ec`、侧栏 `#f9f9f9`；深色品牌 `#06b04d`、侧栏 `#181818`。中性表面、品牌色阶和深浅两套值的组织方法适合 Mimir 知识库/Agent，能映射现有 provider。
- 其 TDesign CSS 变量不能直接替换 antd token。用 WCAG 相对亮度公式计算，白字 on **#07c05f = 2.41:1**，白字 on **#06b04d = 2.87:1**，低于 Mimir 现有约 **4.10:1** 基线。只能借鉴色相与层级，不能复制按钮字底色对。
- WeKnora Markdown 编辑器不作为 Office Ribbon 主参考；此次语雀视觉证据由 `research/yuque-design-study.md` 承担。

### Related specs

- `.trellis/workflow.md`：规划先于实现，研究落盘。
- `.trellis/spec/renderer/frontend/theme/conventions.md`、`pitfalls.md`：单一阶梯、受控外观、校准算法、嵌套主题、首帧与半透明对比度。
- `.trellis/spec/chat/frontend/conventions.md`：宿主变量、无独立主题、包边界、祖先变量与高度链。
- `.trellis/spec/office/frontend/shell/conventions.md`：共用外壳、Ribbon 快捷操作与窄区可达性。
- `.trellis/spec/desktop/runtime/conventions.md`：共享 renderer、独立首启 HTML、标题栏与公开包边界。

## Caveats / Not Found

- 仅调研，没有修改产品代码或据此声称页面验证、测试已经通过。
- 未定义旧变量的判断来自当前 apps / packages 扫描；若 vendor 运行时另行注入，应在真实 DOM 再核实，现有宿主桥确实没有提供。
- 若选择合并现有表面层级或调整圆角/字号，这是设计合同变化，应明确更新规范与验收，而不是删除质量测试。
- 不做全仓蓝色替换，原件内容色与应用 chrome 色需分开判定。
