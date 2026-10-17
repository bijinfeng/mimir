---
name: mimir Web
description: 白灰工作面、中性导航与绿色操作的个人知识工作台
colors:
  primary: "#00834d"
  primary-hover: "#007846"
  primary-active: "#006b3e"
  primary-text: "#007a45"
  primary-soft: "#e8f5ee"
  primary-text-dark: "#6bdaa5"
  primary-soft-dark: "#173a2a"
  text: "#262626"
  text-secondary: "#595959"
  text-tertiary: "#6b6b6b"
  surface: "#ffffff"
  navigation: "#f7f8f8"
  navigation-selected: "#eff0f0"
  hover: "#e9ebeb"
  border: "#8a8a8a"
  border-subtle: "#e8e8e8"
  text-dark: "#eceeef"
  text-secondary-dark: "#b3b6bb"
  text-tertiary-dark: "#969ba2"
  surface-dark: "#18191a"
  navigation-dark: "#1f2022"
  container-dark: "#202225"
  elevated-dark: "#26282b"
  navigation-selected-dark: "#303235"
  border-dark: "#686e76"
  border-subtle-dark: "#3b3e43"
  warning: "#8a5700"
  warning-soft: "#fff3e0"
  error: "#b42318"
  error-soft: "#fef0ee"
  info: "#1a56c4"
  info-soft: "#e8f0fe"
  warning-dark: "#f3c46d"
  warning-soft-dark: "#352a17"
  error-dark: "#ffb4ab"
  error-soft-dark: "#3b2221"
  info-dark: "#9fc0ff"
  info-soft-dark: "#192b43"
typography:
  display: { fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif", fontSize: "28px" }
  headline: { fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif", fontSize: "19px" }
  settings-title: { fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif", fontSize: "22px" }
  title: { fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif", fontSize: "16px" }
  body: { fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif", fontSize: "14px" }
  reading: { fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif", fontSize: "15px", lineHeight: 1.9 }
  item: { fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif", fontSize: "13.5px" }
  excerpt: { fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif", fontSize: "13px" }
  note: { fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif", fontSize: "12.5px" }
  label: { fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif", fontSize: "12px" }
  badge: { fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif", fontSize: "11.5px" }
  mono: { fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace", fontSize: "12px" }
rounded:
  small: "4px"
  control: "6px"
spacing:
  compact: "4px"
  small: "8px"
  medium: "16px"
  large: "24px"
  xlarge: "32px"
components:
  button-primary: { backgroundColor: "{colors.primary}", textColor: "{colors.surface}", rounded: "{rounded.control}" }
  button-primary-hover: { backgroundColor: "{colors.primary-hover}" }
  button-primary-active: { backgroundColor: "{colors.primary-active}" }
  button-secondary: { backgroundColor: "{colors.surface}", textColor: "{colors.text}", rounded: "{rounded.control}" }
  input: { backgroundColor: "{colors.surface}", textColor: "{colors.text}", rounded: "{rounded.control}" }
  navigation-selected: { backgroundColor: "{colors.navigation-selected}", textColor: "{colors.text}", rounded: "{rounded.control}" }
  navigation-selected-dark: { backgroundColor: "{colors.navigation-selected-dark}", textColor: "{colors.text-dark}", rounded: "{rounded.control}" }
  semantic-selected: { backgroundColor: "{colors.primary-soft}", textColor: "{colors.primary-text}", rounded: "{rounded.control}" }
  card: { backgroundColor: "{colors.surface}", textColor: "{colors.text}", rounded: "{rounded.control}" }
  badge: { textColor: "{colors.text-secondary}", rounded: "{rounded.small}" }
---

# Design System: mimir Web

## Overview

**Creative North Star: "安静的知识工作台"**

mimir 让笔记、资料与可核对来源的回答占据视觉中心。白灰工作面、单一左侧导航、清楚的文字层级与少量绿色操作，形成安静、清晰、紧凑的工作环境。阅读画布保留宽松行距，操作区保持便于扫读的密度。

本次已批准的语雀方向取代此前冷灰蓝视觉系统。语雀公开知识库与阅读页有实测证据；私人工作台、实际编辑器、深色及窄屏采用 Mimir 适配设计，不宣称精确复刻。正式令牌来自共享 renderer 主题，优先于静态稿及 Stitch 自动生成的默认设计系统。Web 与 Desktop 共用产品身份和工作区主题。

**Key Characteristics:**

- 中性表面与细分隔线建立连续工作区，正文拥有更宽松的阅读节奏。
- 当前导航用灰底、加粗和语义标识；绿色用于主操作、链接与真实语义状态。
- 浅深外观分别校准，共享字体、控件形状、响应式事实与现有操作行为。

证据入口：`.trellis/tasks/10-16-yuque-design-research/research/yuque-design-study.md`、`appearance-responsive-contract.md` 与任务目录的 `final-review.md`。研究已检查 WeKnora 官网与公开源码（v0.8.3，SHA `3e22822c1d2397be730c458c7539d0eb8c113a24`）：主题角色组织和知识库 / Agent 来源语义适用；其 Markdown 编辑器不作为 Office 工具栏模型。文件编辑继续遵循 Office for the web、Google Docs、GenOffice 领域参考及 Mimir 的现有能力。

## Colors

**工作台绿**承载明确操作，**白灰中性色**承载结构。前置令牌为规范值，组件从 `packages/renderer/src/theme/tokens.ts` 与 `customToken.ts` 消费真实角色；Ant Design 派生状态由实际主题算法校准。

### Primary

- **工作台绿**：`primary`、`primary-hover`、`primary-active` 分别对应白字主按钮的默认、悬停和按下。深色下也沿用这组三档填充，不能把明亮链接色直接用作白字按钮底。
- **阅读绿**：`primary-text` 用于浅色链接、成功文字和语义选中；深色使用 `primary-text-dark`。焦点环分别跟随主绿和深色阅读绿。
- **语义浅底**：`primary-soft` / `primary-soft-dark` 用于用途选择、引用与编辑器按下态。成功状态复用这组绿底和对应阅读绿，警告、错误、信息有独立的文字 / 背景色对。

### Neutral

- **纸白工作面**：`surface` 用于浅色主内容、卡片和输入；`navigation` 用于侧栏、列表辅助区和大纲。
- **中性当前项**：`navigation-selected` 配正文色；悬停采用 `hover`。深色当前项与悬停共用 `navigation-selected-dark`，由字重和 `aria-current` 继续区分当前项。
- **夜间工作面**：`surface-dark` 是主内容，`navigation-dark` 是辅助区；卡片 / 输入用 `container-dark`，浮层用 `elevated-dark`。
- **文字与边界**：正文、次文字、元信息各有浅深角色。`border` / `border-dark` 说明输入等必要边界；`border-subtle` / `border-subtle-dark` 只负责装饰分隔，不能代替关键控件边界。

**The Separate Selection Rule.** 导航选中使用专用中性角色；用途选择与编辑器按下使用品牌语义角色。不得把全局 `colorPrimaryBg` 改灰来实现导航外观。

**The Content Color Rule.** Office 原件纸张、正文、调色板与文档中的用户颜色保留内容语义，深色外观不全局反转内容。界面品牌迁移只改变工作区和控件角色。

## Typography

**Display Font / Body Font:** 使用前置令牌中的系统 UI 字体栈，中文按 PingFang SC、Hiragino Sans GB、Microsoft YaHei 回退。**Mono Font:** 路径、模型标识和代码使用系统等宽栈。

层级来自唯一的 `FONT_SIZE`：display 对应文档与知识库标题，settings-title 对应设置及供应商表单标题，headline 对应其他页面标题，title 对应小节标题，body 对应界面正文与控件，reading 对应文档连续阅读。item 用于列表和导航，excerpt 用于摘要 / 表格 / 代码，note 用于短说明，label 对应元信息，badge 只用于有底色的短徽标。字号与外观无关。

**The Reading Rhythm Rule.** UI 保持紧凑，连续阅读使用独立 reading 角色及 `READING_LINE_HEIGHT`；不能通过放大全局 body 改变工具条与表单密度，也不能为压缩列表而降低正文可读性。

## Layout

工作台宽屏使用单一左栏（256px），手动折叠保留紧凑入口（52px）。工作区、文档与问 AI 面板共享头部高度（48px）；Desktop 窗口标题栏使用独立高度（44px）。主内容及其网格子列保持 `min-width: 0`，知识库卡片按可用宽度降到两列 / 一列，保留用户卡片 / 列表偏好。

共享 `NAV_NARROW_BREAKPOINT`（880px）同时驱动布局和组件状态：在该宽度及以下，导航强制紧凑、设置分区改为 Select、正文隐藏右大纲。临时窄屏不覆盖用户保存的折叠偏好。导航按需展开为覆盖层（`min(280px, 100vw)`），由遮罩、关闭按钮或 Escape 关闭；打开管理焦点，关闭恢复触发点并清理滚动锁。内容切换只在未保存守卫允许后关闭导航；取消时保留抽屉及原入口焦点。

Markdown 正文由 `CONTENT_WIDTH` 收在阅读列（760px）；唯一可编辑大标题与真实更新时间位于同一阅读滚动区，顶部是紧凑路径和实际保存状态。文档工具区复用 CompactToolbar 的折叠 / 分组策略：分类标签可横滚，命令组以 44–72px 宽度与折行标签适配，390px 下命令带无横滚；极端宽度小于 44px×分组数时保留命令区局部滚动，正文和页面不随之溢出。窄屏问 AI 沿用已有面板与返回 / 关闭机制，保留引用回原文。

设置宽屏使用独立分区栏（176px）和左对齐内容列（最大 760px），只渲染当前分区。内容区是 `settings-content` 容器，在容器可用宽度不超过 620px 时，标签与控件、模型行、标题动作自动折行或堆叠；这是内容容器规则，不是另一套全局窄屏断点。窄屏内容左右留白（16px），控件宽度不得超过所在列，表单尾部保存 / 取消通过正常滚动可达。

间距遵循前置 scale。紧密相关控件相邻，跨组留出较大间距；正常表单和卡片用边界与空白组织，避免嵌套容器增加视觉噪声。以 390px、879 / 880 / 881px 及宽屏检查页面溢出、焦点和动作可达性。

## Elevation & Depth

常态工作面保持平整，主内容与辅助区靠明度、细边界和空白分层。菜单、弹窗、悬浮控件使用 Ant Design `boxShadowSecondary`；Office 纸张使用更轻的 `boxShadowTertiary`。两者经现有主题桥进入编辑器祖先，随宿主外观变化。

**The Flat Workspace Rule.** 普通列表与内容卡片不叠加重阴影；阴影只说明元素确实浮在其他内容之上。

状态反馈使用短过渡：用途 chip 沿用约 120ms 的颜色 / 边界变化，账号行约 200ms。动效不能延迟输入、保存和关闭反馈；不以位移或阴影放大普通导航 hover。

## Shapes

常用控件、菜单当前项和标准浮层统一使用 control 圆角。小型静态徽标保留 small 圆角；现有特殊图表或内容几何按自身语义保留，不把每个子容器都套成大圆角卡片。

品牌继续使用仓库已有 `BrandMark` / `BrandLockup`：32×32 视框、圆角工作页外框与小写 m 镂空字形，颜色跟随 `currentColor`。导航标记约 20–23px，登录约 28px；保留既有路径、字形比例和 mimir 小写名称，示意稿不构成重画品牌图形的授权。

## Components

### Buttons

主按钮使用品牌填充、白字和 control 圆角；hover / pressed 使用对应状态角色。次要按钮使用当前容器、正文色与轻装饰边界；输入仍保留独立的关键边界。loading 保持尺寸与明确状态，disabled 阻止触发。触控目标按现有粗指针适配可达 40–44px，图标不必同比放大。

### Inputs / Fields

输入框有可见标签、容器表面、关键边界与 control 圆角。键盘焦点环（2px）与边界留距（2px），浅深分别使用当前 focusRing。错误同时给出错误文字和状态；不得仅依赖红色或清除 outline。普通 UI 文字对比目标至少 4.5:1，正文保留至少 7:1 的现有守卫，焦点与关键边界目标至少 3:1；计划配色不能替代运行时验证。

### Navigation

中性图标与文字默认退后，当前项用灰底、正文色、约 600 字重和 `aria-current` 标识。普通导航行沿用共享 `NAV_ITEM_HEIGHT`（36px）及侧边距（6px）；窄屏与粗指针目标至少 44px，保持图标尺寸。账号与设置分行，搜索提示平台快捷键。目录父位置与当前文档保留层级区别，hover 不产生持久选中。全局入口、目录、最近笔记与账号区遵循同一状态语言。

### Lists / Cards

名称、摘要、来源 / 处理状态、更新时间保持可扫读，保留卡片 / 列表偏好。知识库以 display 标题、body 描述与 body/500 卡片名称形成层级，窄屏长库名允许折行。“添加文档”是主操作；空间不足时，现有新建文件 / 文件夹可收纳进“新建”菜单，目录归属不变。上传、失败重试和处理状态必须保留文字或图标提示。

### Badges / Tags

来源类型和状态在有辨识价值时显示。知识库的常态就绪使用 meta 绿色文字，异常仍保留有底色徽标。来源徽标保持中性，成功 / 警告 / 错误按语义选择色对。用途 chip 使用 control 圆角，选中采用语义绿底、边界与阅读绿，并通过 `aria-pressed` 表达；不能套用导航灰底。

### Settings

分区保留 URL `section` 和平台可见性语义。供应商表单以连接和模型的留白分组、可搜索预设选择器组织；密钥草稿明确待保存，重复添加空模型会回到现有空输入。供应商表单继续明确“保存 / 取消”，不引入自动保存承诺；既有单设置保存、布尔开关即时提交、密钥清除与未配置提示继续按真实实现工作。未改动保存按钮禁用而非隐藏，避免布局跳动。

### Chat / Office

主 Chat 与文档 Chat 继承宿主主题，现有 ChatThemeBridge 只桥接字号与 gutter，不创建第二套配色。Office 的 `--me-*` 变量桥挂在编辑器祖先，工具控件继续消费共享 `--ant-*`；保留高度链、工具命令、保存反馈、未保存保护与引用定位。图标沿用现有共享映射，同一动作跨页一致。

## Do's and Don'ts

### Do:

- **Do** 让 renderer 真实令牌统领 Web / Desktop、Chat 与 Office，并同步维护本文和 `.impeccable/design.json`。
- **Do** 用中性导航与绿色语义角色分别表达位置和操作状态。
- **Do** 保留搜索、收集、上传、新建、直接编辑、保存、AI 范围与引用等真实行为。
- **Do** 检查浅深外观、关键断点、容器折行、键盘焦点和窄屏关闭 / 返回路径。

### Don't:

- **Don't** 重新引入旧冷灰蓝品牌色或直接套用生成稿的自动色阶。
- **Don't** 为外观覆盖用户内容颜色、移走主题桥祖先或新增独立主题 provider。
- **Don't** 用缩小正文、隐藏命令或固定宽度撑破页面来换取紧凑。
- **Don't** 把来源参考和静态图当作新增团队、发布、仪表盘或读写模式切换功能的依据。
