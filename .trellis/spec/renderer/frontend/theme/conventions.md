# packages/renderer/src/theme —— 设计 token 与外观

`tokens.ts` / `customToken.ts` / `appearance.ts` / `MimirProvider.tsx` /
`design.test.ts` 的家。**写样式的全层规则**（antd-style 用法、十二条容易踩的）
在父层 `.trellis/spec/renderer/frontend/conventions.md` 的「样式」一节——仍然适用，这里只放 token
与外观自己的规则。

---

## 字号：走阶梯，不要写字面量

`theme/tokens.ts` 的 `FONT_SIZE` 是**唯一**的字号来源，每档对应一个
角色（`body` / `reading` / `item` / `excerpt` / `note` / `meta` / `badge` …）。
`body=14` 用于界面，`reading=15` 与 `READING_LINE_HEIGHT=1.9` 用于连续阅读，
不要靠全局放大 UI 字号改变文档排版。控件圆角种子为 6px。

```ts
// ✗ 随手写一个值 —— 全仓曾散落过 11 个不同的 font-size
font-size: 13px;

// ✓ 先找角色
font-size: ${FONT_SIZE.excerpt}px;
```

`design.test.ts` 会扫源码拦下字面量（**扫描根含 `packages/chat/src`**——
对话包的组件不在 `src/` 下，不加进那条守卫就把它们静默漏掉了）。
唯一的例外是**图标字形**，必须在行内标注 `非文本` 才放行
（`font-size: 9px; /* 图标字形，非文本 */`）。

包**不能** import 这个模块（它不认识宿主），所以包内写的是
`var(--mimir-chat-font-note, 12.5px)`——值由 `ChatThemeBridge` 从这个
`FONT_SIZE` 填下去。改阶梯时改这里，包里的回退值跟着对齐即可。

理由见 `.trellis/spec/project/decisions.md` D-017：字号最容易被随手改，而同一个角色在不同
页面用不同值不会报错，只会让整页看起来不整齐。

---

## 外观（浅色 / 深色）

两套外观是**并列**的，不是「浅色 + 一个滤镜」。加任何颜色前先读
`.trellis/spec/project/design.md` §3.8。

三条硬约束：

1. **需要两套值的东西用 `useAppearance()` 分支**（如徽标色对），
   而不是在样式里散落 `appearance === 'dark' ? … : …` 判断。
   样式层拿 token 就够，`customTokenFor(appearance)` 已经按外观选好了
2. **两套外观守同等可读性下限。** 普通文字 ≥4.5:1、正文 ≥7:1、
   字段聚焦及独立关键控件边界 ≥3:1。新中性主题不再要求深色每项比值大于浅色，
   也不要求五种表面互不相同；`design.test.ts` 分别检查实际组合，
   保留 provider / DOM / CSS 变量守卫。
3. **与 seed 同名的 token 覆盖会被 antd 丢掉**（`colorLink`、`colorPrimary`
   这些）。需要精确控制时用 `tokens.ts` 的校准层，那是一个
   `MappingAlgorithm`，跑在算法链最后。**浅色下这条看不出来**，
   所以别用「浅色生效了」推断深色也生效

外观状态在 `theme/appearance.ts`，它把结果写到 `html` 的 `data-theme` 与
`color-scheme` 上。`index.html` 里有一段**等价的内联脚本**先跑一遍，
覆盖「脚本执行到样式注入」那段空白——改判断逻辑时两处必须一起改。

## 应用表面、导航与语义状态

主内容使用 `surfaceContent`（白 / `#18191a`），卡片和输入用 `colorBgContainer`
（白 / `#202225`）。导航与列表共用辅助面；浅色主面、卡片、浮层可以共用白色。
装饰性分隔线取 `colorBorderSecondary`，不能把 ≥3:1 的独立关键控件边界用作每条列表分隔线。

导航当前项使用 `navSelectedBg` / `navSelectedText`（中性灰底与正文色）并保留
字重、`aria-current`。`colorPrimaryBg` 仍为绿色语义浅底，供引用定位、编辑器按下态
与真实状态使用；不要为导航灰底全局覆盖它。

主按钮填充 `#00834d`、hover `#007846`、pressed `#006b3e`；浅色链接 `#007a45`，
深色链接及焦点 `#6bdaa5`。自定义焦点用 `focusRing`，2px 环和2px offset。
Chat 继续继承宿主颜色，Office 通过 `editor-theme-bridge.ts` 的 `--me-*` 与
已有 `--ant-*` 继承；不增加第二份 provider，也不更换文档内容调色板。

---

## 表单字段状态

`tokens.ts` 的组件级 Input / InputNumber / Select 覆盖统一字段颜色；Password、Search、TextArea 继承 Input，Cascader 复用 Select。浅色默认 / hover / focus 为 `#e7e9e8` / `#bfc5c1` / `#00a35f`，深色为 `#454b47` / `#66736c` / `#50c28f`。Outlined 字段始终 1px，Input / InputNumber 的普通与语义 activeShadow 为 none，Select 的组件级 controlOutlineWidth 为 0；错误 / 警告 / 禁用仍由 antd 状态规则处理。浅色字段的 colorWarning / colorWarningBorderHover / colorWarningHover 仅在这三个组件内校准为 `#c47a00`，使默认、hover、focus 的警告边界均 ≥3:1；Input / InputNumber 实际消费 colorWarningBorderHover，Select 消费 colorWarningHover，不能只改其中一个。深色语义值与全局警告色对保持。不要全局修改 colorBorder、lineWidthFocus 或清除 outline，以免弱化复选 / 单选边界、无边框字段及独立按钮的键盘焦点。

轻默认字段边界是已批准的外观取舍，不能宣称其达到非文本边界 AA；聚焦边界与输入底 ≥3:1。`design.test.ts` 同时守住真实 provider 的字段变量 / 状态与全局关键边界，不能只测配置对象便推定组件实际生效。
