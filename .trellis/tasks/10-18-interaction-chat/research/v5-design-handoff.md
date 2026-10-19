# v5 design handoff · ordinary extension

2026-10-19。仅对已建 HTML 候选做文档与样式来源审查；没有重新运行 detector、设计世界选择或浏览器验收。本报告唯一写入文件为本文件。

## 结论与保留范围

这是 Mimir 现有设计世界内的普通扩展（ordinary extension），不是 new world，也不需要另建 comp。保留 `apps/web/PRODUCT.md`、`apps/web/DESIGN.md` 及 `.impeccable/design.json`；本次未改写或再生成它们。`document.md` 的创建 / 刷新设计系统流程不适用于本次限定的原型交付。

候选方向是 **TanStack AI React + 自有组件**，Mimir 视觉保持，v4 是交互基线。源码 `thread-app.tsx` 确实导入 `@tanstack/ai-react` 的 `useChat` 与 `chat.css`；详情页也使用该组件体系。该事实不能扩展成产品已迁移、真实 API 已接通或原生宿主已验证。用户认可具体 HTML 前不得进入产品实现。

## 与现有体系一致

核对 `apps/web/{PRODUCT,DESIGN}.md`、`packages/renderer/src/theme/{tokens,customToken}.ts` 与 `prototype/v5/{chat,review,interactions}.css`：

- 白灰工作面、中性导航、绿色操作延续“安静的知识工作台”；详情导航当前项为 `#eff0f0`、600 字重及 `aria-current`，没有引入新的品牌方案。
- `chat.css` 的系统中文字体栈、14px UI / 15px 阅读正文、6px 常用控件，以及浅色 `#262626/#595959/#6b6b6b` 与深色文字角色都来自既有体系。
- Composer 使用 `#e7e9e8 → #bfc5c1 → #00a35f`，深色使用 `#454b47 → #66736c → #50c28f`；聚焦维持单层 1px 且无 halo。按钮、链接和 summary 的独立键盘 outline 被保留；“1px 无 halo”是字段合同，不能解释为全局取消焦点环。
- 发送按钮固定 `#00834d`，没有直接把深色亮绿当作白字按钮底。菜单 / 对话框才使用浮层阴影，正文工作面平整。
- Operate / Read 按现有操作区紧凑、连续阅读舒展的角色理解，不新增产品“读写模式”开关。只读模型角色、全库 / 单篇范围、引用回原文及 Agent 守卫仍由现有业务合同约束。

## 本轮有意适配与原型边界

独立 `interactions.html` 是评审目录和事件检查工作面：搜索、稳定深链接、数据检查区与本地组件沙盒用于逐项核对，不是产品新增调试页或常态流程卡。详情页的 260px 目录、700/1050px 断点属于评审工具；不能取代产品 256px 导航、880px 断点及主题桥。

403 条比较路由、126 条目录项及 v4 交互来源是覆盖清单，不是全量 GUI 通过数。`v5-interaction-parity.md` 将行为合同与官方组件默认样式明确分开；README 也正确标明本地 ConnectionAdapter、附件政策提案、fixture 标识及能力门控。协议数据、活动、审批、多媒体输入、子 Agent 和通用 UI 沙盒不构成已有产品能力。

`verification/v5/browser-qa.md` 记录了真实操作过的代表路径，并明确原生 IME / picker / clipboard、200% 浏览器缩放、OS 减少动态、读屏、Electron、真实服务 / Office 待验证。审查时其“最终确认”仍写待最终构建补截图及恢复 / 新草稿保护；不能据此出具全状态验收通过声明。本报告不增加浏览器实测结论。

## 已存在差异与文案精度

以下只记录，不擅修，也不更新规范去迁就原型：

- **继承 v4 的 review 壳差异**：`review.css` 的 5px 按钮 / 输入圆角、`#edf7f1/#20392c` soft 色、1px offset 键盘 outline、部分非规范中性色，及文字 `m` 的 `.mimir-logo` 在 v4 已存在。它们不是本轮新设计令牌，更不是重新绘制 `BrandMark` 的授权。目录绿色选中是评审壳既存行为，不应传播为产品导航规则。
- **需实施时映射的近似值**：新 Chat 将链接与主操作共用 `--green`（浅色 `#00834d`，而现有 `colorLink` 为 `#007a45`）；正文行高 1.85 相对规范 reading 的 1.9、深色 `--nav:#202225` 相对导航角色 `#1f2022` 也未完全一一映射。这些不证明产品主题已变更，实施时应消费真实 token 并验证，不能照抄形成第二套配色。
- **真实误称**：`review.css:1923` 的 “full official Thread” 与 `:1996` 的 “independent official document” 是 v4 遗留注释，在 v5 自有组件方向下不准确；`official-*` 类名本身也不能作为仍执行 assistant-ui 的证据。README 关于自有组件的说明与当前入口源码一致。
- **README 表述需限定作用域**：其“6px controls, 1px focus borders without halo”对新 Chat 字段成立；若理解为整个 review 壳 / 所有键盘焦点则不准确，因为上述继承样式和 2px 按钮焦点环仍在。README 已明确 planning candidate 与审批前边界，没有发现声称产品已迁移或真实 API 全量通过的文字。

## 参考证据与用途

本次复核沿用同日固定证据 `research/vendor-full-thread/weknora-reference-recheck.json`：官网 <https://weknora.weixin.qq.com/> HTTP 200、展示 v0.8.3；[公开源码](https://github.com/Tencent/WeKnora/tree/2c0d8384398ca756ee414eef01b71caf91e2caa6) commit `2c0d8384398ca756ee414eef01b71caf91e2caa6`、frontend 0.8.3。证据摘录 `AgentStreamDisplay.vue:421` 在完整 / done / 非空回答后显示动作，`:448/:452` 提供复制与加入知识库，适合交叉核对 Mimir 完成态动作及保存边界。其 Vue/TDesign、定制 thinking/tool 事件不证明 TanStack / AG-UI 兼容性，也不作为本轮视觉或 Office 工具栏模板。

视觉权威仍是现有 Mimir token / DESIGN；v4 固定源码为行为证据。本轮没有重新研究页面风格或文件编辑器，不借研究引用引入新功能。

## 最终 checkpoint

以下为主会话完成最终复核后的更新，取代上述初审时尚未关闭的事项；本次仅更新报告，不新增问题搜查：

- `review.css` 两条过时 official 注释已改为 custom；README 已将 6px 控件 / 1px 无 halo 字段焦点限定在 Chat，避免泛指 review 壳。旧 `official-*` 类名仅为继承命名，不表示执行 assistant-ui。
- 最终复核唯一需要实质修正的视觉项已处理：proposed 直接复用产品 `BrandLockup(markSize={20})` 与小写 `mimir`，current 保留旧 glyph 以维持比较来源；`review.css` 中品牌 `b` 延续原 `strong` 的 `flex: 1` 布局。旧文字标记不再作为 proposed 品牌候选。
- 四张截图已重捕，`browser-qa.md` 最终确认已补齐；这关闭了初审记录中的待补项，不扩展为全部 403 路由 / 126 项或真实宿主验收通过。
- 产品 `DESIGN.md` / `PRODUCT.md` 保持不变。其余已记录的颜色、阅读行高与 review 壳近似值仍是原型限制；获批实施必须消费真实 Mimir tokens 并验证，不能复制原型值建立第二套主题。

最终分类仍是 ordinary extension；本轮交付范围仍为 HTML 候选与证据，具体 HTML 获用户认可前不进入产品实现。
