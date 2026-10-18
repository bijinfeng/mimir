# 真实浏览器验收

2026-10-17，主会话通过 Codex in-app browser 验证。仅使用项目指定测试账号，未提交创建知识库、设置或其他业务数据。产品页面、真实 MimirProvider 组件矩阵及原始 computed / geometry 证据一并保留。

## 已确认

- 登录普通框、密码框的点击 / Tab / 输入路径；浅深主题及 390px 窄屏。普通浅色焦点最终为 `#00a35f`，深色为 `#50c28f`。边框始终 1px，输入 / 密码框保持 32px 高，无外扩阴影或尺寸跳动。
- 登录校验错误保留语义边框与解释文案，不被普通绿色焦点覆盖；密码眼睛键盘焦点仍有独立 2px 环。
- 供应商设置 Select 弹层、知识库创建弹窗 TextArea 浅深主题；操作后取消，未保存。
- 补充真实组件矩阵验证 InputNumber、Cascader、错误 / 警告 / 禁用，以及无边框 Input / Select 的键盘焦点。独立复选 / 单选关键边界保持。
- 最终登录截图已替换为空间完整的 957×873 有效截图 `login-final-light.png`，另存聚焦细节 `login-final-detail.png`。本次重新读取密码 wrapper 的最终 computed 为 `1px / rgb(0,163,95) / box-shadow:none / height:32`。

## 证据边界

原始 `browser-evidence.json` 包括状态切换动画中的中间值；精确色值以标注 settled 的最终样本和减弱动画的矩阵为准。早期 CSS.forcePseudoState hover 后立即读取到的中间色不能用作最终 hover 色值的证明，已在原数据中标记。hover 的目标值另由真实 provider 变量与注入 CSS 守卫核对。

首次矩阵发现浅色 warning 焦点沿用 AntD `#faad14`，白底仅 1.90:1；主会话决定将其组件级校准为保持琥珀语义的 `#c47a00`，不降低字段聚焦 ≥3:1 契约。最终确认：浅色 Input / Password / TextArea / InputNumber / Select / Cascader 均为 `rgb(196,122,0)`、1px、无外扩阴影（白底 3.43:1）；深色 Input / InputNumber / Select / Cascader 仍为 `#d89614`（输入底约 6.30:1）。深色错误 `#dc4446` 保持，浅色禁用外层边框仍为 `#d9d9d9`。记录见 warning-final-evidence.json，最终矩阵截图见 controls-matrix-*-final.png。

浏览器 fixture 是临时入口，源码快照保留在 verification，产品入口在验收后删除。仅关闭本会话创建的标签及 5174 Vite；保留用户语雀与其他会话 5173 标签。
