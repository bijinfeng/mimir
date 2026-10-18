# 基础表单视觉核查

日期：2026-10-17。范围：共享 Renderer 的表单字段，规划研究，未修改产品代码。

## 1. 用户反馈与实际根因

用户截图：`/var/folders/92/c09xsx4s6g34djybsfgz6byc0000gn/T/codex-clipboard-23051a8a-2c52-4c58-a0f2-656a5b41fed9.png`。

- `packages/renderer/src/theme/tokens.ts:18`：controlOutlineWidth=2；`:37`：controlOutline=#00834d（不透明）；`:54`：colorBorder=#8a8a8a。聚焦默认阴影由宽度和实色共同生成；不是边框本身突然改为3px。
- `packages/renderer/src/theme/tokens.ts:102`：只有 Button/Tabs/Menu 组件级定制，没有 Input/InputNumber/Select 独立角色；表单跟随主按钮深绿。
- `packages/renderer/src/theme/design.test.ts:302` 与 `.trellis/spec/renderer/frontend/theme/conventions.md` 将默认字段边界与复选框边界合并为 ≥3:1 的强边界，导致普通表单过重。
- `apps/web/DESIGN.md:159` 将全部输入焦点描述为2px+2px外圈。需与新方案同步，不能只改实现让规范和测试失真。

## 2. 语雀实测（主视觉参考）

URL：https://www.yuque.com/login 。在线Web，未公开可核实构建版本，以采样日期标识。未输入任何账号信息，未提交表单，未操作验证码。

浏览器读取可见输入及其外层样式，记录在 `yuque-form-samples.json`；截图 `yuque-focus.png`、`yuque-password-focus.png`。

| 项目 | 实测 |
| --- | --- |
| 手机号及密码默认边框 | 1px solid #e7e9e8 |
| 手机号聚焦边框 | 1px solid #00b96b |
| 密码外层聚焦边框 | 1px solid #0bd07d（再次读取稳定值一致） |
| 聚焦阴影 | none |
| 控件圆角 | 6px；手机号组合框只保留外侧圆角 |
| 登录大输入高度 | 约40px；密码框40.14px |

结论：语雀公开页也不是所有输入状态用完全相同的绿；借鉴单层细边、轻常态边界、无粗外圈的共同机制，Mimir 内统一同类字段。保留项目现有32px默认/40px大号与6px圆角，不将登录大号强推至所有设置。

没有实测 hover、错误态、深色或语雀私有设置页面，不把这些适配值描述为语雀官方token。

## 3. WeKnora 必查参考

再次检查官网 https://weknora.weixin.qq.com/ （`weknora-official.html`）及公开源码。官网仍有v0.8.3发布内容。固定研究版本v0.8.3，对应SHA `3e22822c1d2397be730c458c7539d0eb8c113a24`；release API证据 `weknora-release.json`。

源码：https://github.com/Tencent/WeKnora/blob/3e22822c1d2397be730c458c7539d0eb8c113a24/frontend/src/assets/theme/theme.css ，本轮重新下载 `weknora-theme.css`。196–202行明确规定输入和文本域聚焦 `border-color: var(--td-brand-color); box-shadow: none`，并排除错误、警告、成功状态。此证据支持“细绿边且无粗外圈”“状态优先”的机制；不复制其品牌色、不以其Markdown编辑器作为Office工具栏参考。

本轮不涉及知识库/Agent业务架构；WeKnora只提供基础字段交互的辅助证据。Obsidian布局与Office编辑能力不在本次重设计范围。

## 4. Ant Design 实现证据

实际安装antd 6.6.6（packages/renderer/node_modules/antd/package.json）。CLI同版本查询见本目录 antd-*-tokens.json、antd-input-api.json。

- Input/InputNumber有activeBorderColor、hoverBorderColor、activeShadow、errorActiveShadow、warningActiveShadow。内部 Input style/variants.js 的outlined机制共用于输入和带前后缀字段。
- Select 6.6.6 `style/select-input.js` 直接给外层绘边；不能套用旧版本 `.ant-select-selector` 覆盖方案。默认字段边界来自colorBorder；focused阴影来自controlOutlineWidth与activeOutlineColor，错误/警告另有自己的outline色。
- Cascader实际使用Select结构，Cascader组件token自身不提供输入focus角色，须验证Select继承是否真实生效，不能添加不存在的Cascader token。
- 组件级colorBorder使字段独立于全局关键边界；不全局改colorBorder，避免影响复选框、单选框、Office边界。

## 5. 拟定状态与可访问性取舍（待用户批准）

| 状态 | 浅色 | 深色 |
| --- | --- | --- |
| 默认字段边框 | #e7e9e8 | #454b47 |
| 悬停 | #bfc5c1 | #66736c |
| 聚焦 | #00a35f | #50c28f |
| 聚焦阴影 | none | none |
| 粗细 | 始终1px | 始终1px |

浅色focus选Mimir校准值#00a35f（白底约3.28:1），比按钮#00834d更鲜明；语雀原值#00b96b白底约2.58:1，不直接照搬。深色focus候选#50c28f在输入底#202225约7.18:1。新默认边界白底约1.22:1，**主动偏离旧规范默认边界≥3:1**；不能宣称默认低对比字段已满足非文本边界AA。将该取舍明确交最终规划评审，不静默降低现行标准/测试。聚焦绿色、文字、关键独立控件边界仍按角色守护；无边框控件保留现有键盘环，不全局清outline。

错误/警告仍由语义边框与可见文案表达，聚焦不变绿、不增加粗圈；禁用保留不可交互、灰底及现有文字角色。状态切换不改变盒尺寸。密码眼睛/清除按钮的可达性与独立键盘焦点保留。
