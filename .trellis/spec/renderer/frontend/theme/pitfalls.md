# 会静默出错的地方

| 症状 | 原因 |
|---|---|
| 状态色看不清 | 换了 antd 的**种子色**，派生色跑偏；或用了 `Tag color="green"` 预设色（对比度不由我们控制） |
| 界面颜色不对但不报错 | 内层 `ConfigProvider` 又传了一次 `theme`——`cssVar` 的 key 被重算，`--ant-*` 变量名换了，引用处静默失效。主题只由 `ThemeProvider` 传；内层 `ConfigProvider` 只放 locale（`theme/MimirProvider.tsx`） |
| 改了深色的链接色但没生效 | 与 seed **同名**的 token（`colorLink`、`colorPrimary`）会被 antd 的 `formatToken` 丢掉，值由算法重新派生——浅色下看着像生效了（浅色阶把输入色放在第 6 阶），深色下不达标注（`#0958d9` 派生值在选中底上只有 3.97:1）。要用 `tokens.ts` 的校准层（`MappingAlgorithm` 跑在算法链最后）；深色链接显式校准为 `#79b8ff`（容器底 8.74:1） |
| 深色下焦点环看不见 | antd 深色把 `colorPrimaryBg` 与 `colorPrimaryBorder` 设成**同一个值**，而后者是焦点环——焦点环落在选中项上完全看不见（实测 1.00:1），那是键盘用户唯一的线索。深色单独校准了描边；`design.test.ts` 断言「环与选中底 ≥ 1.5:1」 |
| 深色下露出白色 | `html` 上没画底色，或没写 `color-scheme`——滚动条与原生下拉不受 CSS 管辖。`html` 上画 `colorBgLayout`，外观写到 `color-scheme` 上；`styles/global.ts` 那条 `html { background }` 带 `!important` 压的是 `index.html` 内联背景（内联样式优先于样式表，压不住它「运行时切换外观后底不变」），`design.test.ts` 守着 |
| 深色用户看到一下白闪 | 外观状态没在首帧前算出来。antd-style 的 `themeMode='auto'` 首次系统匹配走 `setTimeout(…, 1)`，第一帧按浅色再翻深色。自己持有外观状态（`theme/appearance.ts`）并把 `appearance` 作为**受控 prop** 传进去；`index.html` 内联一段等价脚本覆盖样式注入前的那段空白 |
| `localStorage` 在隐私模式下把整个应用壳干崩 | 隐私模式下读取**抛错**——一个渲染偏好不该有这种能力。`try/catch` 包住读写（`appearance.ts` 与 `routes/_app.tsx` 同一条） |
| 外观控件显示空白且没有任何报错 | 存了不认识的外观值，控件匹配不上任何一项。读回来时收敛到 `auto`（`MODE_SET.has()`），不当合法值传下去 |
| 半透明 token 算出的对比度是假数字 | 直接对半透明 token 算对比度，等于把黑色当底色（`colorFillSecondary` 算出 2.86:1，实际 4.93:1）。先用 `composite()` 合成到所在底色再算（`design.test.ts`） |
| `createGlobalStyle` 里取不到 `--ant-*` | 变量注入在 antd 组件 DOM 子树上，全局规则里取不到。用 `${(p) => p.theme.xxx}` 读主题值 |
