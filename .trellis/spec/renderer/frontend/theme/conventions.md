# packages/renderer/src/theme —— 设计 token 与外观

`tokens.ts` / `customToken.ts` / `appearance.ts` / `MimirProvider.tsx` /
`design.test.ts` 的家。**写样式的全层规则**（antd-style 用法、十二条容易踩的）
在父层 `.trellis/spec/renderer/frontend/conventions.md` 的「样式」一节——仍然适用，这里只放 token
与外观自己的规则。

---

## 字号：走阶梯，不要写字面量

`theme/tokens.ts` 的 `FONT_SIZE` 是**唯一**的字号来源，九档、每档对应一个
角色（`body` / `item` / `excerpt` / `note` / `meta` / `badge` …）。

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
2. **深色不得弱于浅色。** 深色最常见的退化是「看着还行就用」，
   而单看深色的截图判断不出来——`design.test.ts` 有一条跨外观逐项比较
3. **与 seed 同名的 token 覆盖会被 antd 丢掉**（`colorLink`、`colorPrimary`
   这些）。需要精确控制时用 `tokens.ts` 的校准层，那是一个
   `MappingAlgorithm`，跑在算法链最后。**浅色下这条看不出来**，
   所以别用「浅色生效了」推断深色也生效

外观状态在 `theme/appearance.ts`，它把结果写到 `html` 的 `data-theme` 与
`color-scheme` 上。`index.html` 里有一段**等价的内联脚本**先跑一遍，
覆盖「脚本执行到样式注入」那段空白——改判断逻辑时两处必须一起改。

---
