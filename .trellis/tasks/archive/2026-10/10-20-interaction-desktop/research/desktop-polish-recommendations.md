# Research: Desktop 最小打磨与可复现验收

- Query: 现有桌面载体有哪些确定的细节缺口？怎样在最小范围内修正并留存真实证据？
- Scope: internal
- Date: 2026-10-20

## Findings

### 已由源码确定，需组件/原生复现的缺口

1. **读取模式时整页空白、窗口控件一起消失。** `SetupPage.tsx:143` 的 `if (!loaded) return null` 发生于 shell 之前。受控 bridge.mode.get 返回未决 Promise 即可稳定重现；重试读取也一样。建议始终渲染 44px 窗口栏，正文显示简洁带状态语义的读取反馈；仍不提前画首启/切换表单。Windows/Linux 原生确认此时最小化/关闭可操作；macOS 原生红绿灯本来就由系统保留，不能描述为它也随 React 消失。
2. **键盘 Enter 绕过空地址的 CTA 禁用。** `SetupPage.tsx:256` 直接 submit；`:112` 只检查 bridge，没有检查空 cloud URL，也没有 pending 守卫。选择服务器，保留空白，在地址输入框按 Enter；目前会走 choose（主进程仍拒绝）。建议在入口一致检查 `pending` 和 trimmed empty URL；如需禁止同帧重复调用，用稳定 ref 门闩配合 pending；保持服务器默认协议行为。用未决 choose + 空地址、连续请求测试验证，不靠时序碰运气。
3. **状态只用普通 Typography.Text。** `SetupPage.tsx:297` 未声明 live region。建议 `role=status`/polite + pending aria-busy；读取及请求失败仍提供明确下一步。失败保留 URL，恢复 CTA，不自动返回 local。
4. **标题栏侧栏按钮没有明确焦点样式。** `TitleBar.style.ts:73` 自定义 button 只有 hover，窗口控件和 setup option 已有 token focus-visible。补相同视觉体系的焦点环；保留 no-drag。须实际 Tab 验证全局 UA/重置后的前后效果，不能仅凭缺一条 CSS 声称“此前完全看不见焦点”。

### 需先截图测量，避免制造不存在的裁切

- Setup 已有 `body overflow:auto` 和 `min-height:0`，不是完全不能滚动。390×400 时上方品牌 pane 加 40px/56px 表单 padding 消耗大量空间（`:85`、`:97`）；800×480 仍为左右双栏，form padding 48px。先测 CTA/错误/地址是否能通过局部滚动到达，再按短高断点减少品牌和表单空白，保持常规字号与可点击区域。
- 长 URL 保留 Input 的原生横向编辑与完整 value，不截断数据。长连续 error（如本地构建缺失路径）在 Alert 处验证 `scrollWidth/clientWidth` 和 CTA 可达性；若确有横溢，局部 `min-width:0; overflow-wrap:anywhere`，不全局改 antd。
- `about.tsx:27` 42px 顶部/80px 底部偏疏；`:48` value 未明确 min-width/换行。使用长版本号压力 fixture + 390×400 实测；建议跟随现有设置紧凑节奏，修复真实横溢。真实发行版 `0.1.0` 不会自然触发超长字符串，压力 fixture 必须标识。
- 窗口未设 minWidth/minHeight；极窄 <约 260px 下品牌、toggle、自绘 138px 控件不可收缩。若要设最小窗宽是产品行为变更，优先通过正常窄宽布局与原生命中区验证，本轮无需扩展到任意 1px 宽。

### 建议最小范围

`SetupPage.tsx/.style.ts`：保留壳加载态、一次提交/键盘守卫、状态语义、短高密度/长反馈。
`TitleBar.style.ts`：键盘焦点；如真实窄宽有问题再动布局。
`routes/about.tsx`：紧凑密度及长值边界。`WindowControls` 只验证订阅、omit、平台、点击桥与命中区，无证据不重写。
主进程/preload/config/cloud 保持原合同，无新增权限、模式、后台驻留、更新器或其他功能。

### 真实组件 HTML 归档矩阵

用完全相同内容、主题、视口捕获 baseline/after；保存两个构建与源哈希，禁止把一个静态手绘页面叫产品组件。建议从这些不同状态选真实 8 对，不把笛卡尔积算成通过数量：首启 local 宽屏、cloud 窄短、cloud 长失败窄短、mode.get pending、读取失败重试、cloud pending、about 暗色长版本、TitleBar 键盘焦点。390×400、800×480、1100×760；浅/深都覆盖。额外记录失败保稿、Enter 空值、快速重复动作、loading 与 close/minimize。受控 Promise 的结果只证明接线，不证明真实 IO。

### 必须独立进行原生验证

使用一次性 userData，避免读取或迁移日常资料。至少在当前平台运行真实 Electron：file setup 首启（含 preload）、拖动/双击、原生控件、菜单快捷键进入 setup、从 setup 返回原模式、local 启动与 Session、cloud 失败框三条出路、关闭退出。为数据型回归继续跑 config/cloud/security/host/artifacts 现有测试。

若当前机器仅 macOS，Windows/Linux 自绘控件可用真实 React + 受控桥测渲染和调用，但**不得宣称系统窗口动作已跨平台实测**。原生菜单、消息框、标题栏拖动和 packaged 路径不能由 HTML ACK 证明。无需为了截图错误处理而破坏正常用户配置。

相关 specs：desktop/runtime/index、conventions、pitfalls；project/design §7.2/7.6、quality。

## Caveats / Not Found

本研究只完成源码定位、外部证据与可执行验收设计，尚无浏览器几何测量/原生通过结果。主会话应把实际捕获和未能运行的检查分别写进 acceptance，不能直接把建议复制为“已通过”。
