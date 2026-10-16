# 会静默出错的地方

| 症状 | 原因 |
|---|---|
| 状态色看不清 | 换了 antd 的**种子色**，派生色跑偏；或用了 `Tag color="green"` 预设色（对比度不由我们控制） |
| 界面颜色不对但不报错 | 内层 `ConfigProvider` 又传了一次 `theme`——`cssVar` 的 key 被重算，`--ant-*` 变量名换了，引用处静默失效。主题只由 `ThemeProvider` 传；内层 `ConfigProvider` 只放 locale（`theme/MimirProvider.tsx`） |
| 改了深色的链接色但没生效 | 与 seed **同名**的 token（`colorLink`、`colorPrimary`）会被 antd 的 `formatToken` 丢掉，值由算法重新派生。要用 `tokens.ts` 的校准层（`MappingAlgorithm` 跑在算法链最后）；当前深色链接显式校准为 `#6bdaa5`，并由 `design.test.ts` 守住对比度 |
| 深色下焦点环看不见 | antd 默认派生可能把 `colorPrimaryBg` 与 `colorPrimaryBorder` 设成同一个值，焦点落在选中项上消失。当前深色显式校准 `#6bdaa5`；自定义控件从 `focusRing` 取色，检查环与表面 / 选中底 ≥3:1 |
| 深色下露出白色 | `html` 上没画底色，或没写 `color-scheme`——滚动条与原生下拉不受 CSS 管辖。`html` 上画 `colorBgLayout`，外观写到 `color-scheme` 上；`styles/global.ts` 那条 `html { background }` 带 `!important` 压的是 `index.html` 内联背景（内联样式优先于样式表，压不住它「运行时切换外观后底不变」），`design.test.ts` 守着 |
| 深色用户看到一下白闪 | 外观状态没在首帧前算出来。antd-style 的 `themeMode='auto'` 首次系统匹配走 `setTimeout(…, 1)`，第一帧按浅色再翻深色。自己持有外观状态（`theme/appearance.ts`）并把 `appearance` 作为**受控 prop** 传进去；`index.html` 内联一段等价脚本覆盖样式注入前的那段空白 |
| `localStorage` 在隐私模式下把整个应用壳干崩 | 隐私模式下读取**抛错**——一个渲染偏好不该有这种能力。`try/catch` 包住读写（`appearance.ts` 与 `routes/_app.tsx` 同一条） |
| 外观控件显示空白且没有任何报错 | 存了不认识的外观值，控件匹配不上任何一项。读回来时收敛到 `auto`（`MODE_SET.has()`），不当合法值传下去 |
| 半透明 token 算出的对比度是假数字 | 直接对半透明 token 算对比度，等于把黑色当底色（`colorFillSecondary` 算出 2.86:1，实际 4.93:1）。先用 `composite()` 合成到所在底色再算（`design.test.ts`） |
| `createGlobalStyle` 里取不到 `--ant-*` | 变量注入在 antd 组件 DOM 子树上，全局规则里取不到。用 `${(p) => p.theme.xxx}` 读主题值 |
| 导航改灰后引用与编辑器按下态也灰了 | 导航使用独立 `navSelectedBg` / `navSelectedText`；不要覆盖绿色 `colorPrimaryBg`。Menu token 与 `NavSidebar.style.ts` 本地强覆盖、库树、最近笔记和设置当前项需要一致 |
| 深色阅读面变成输入框底色 | 阅读 / 工作面取 `surfaceContent`，卡片 / 输入取 `colorBgContainer`，二者在深色分别为 `#18191a` 与 `#202225` |
| 换主题后 Office 曲线节点或图片对话框仍蓝紫 | 消费现有 `--me-accent` / `--me-accent-bg` 角色，检查退役的 `--me-primary*` / `--me-accent-hover` 与无声明的 `--me-bg` / `--me-canvas`，按应用壳 / 文档内容语义逐项处理，不能全仓换色 |
