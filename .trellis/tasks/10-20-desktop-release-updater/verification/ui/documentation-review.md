# 更新界面设计记录核对

日期：2026-10-20。结论：本轮是既有 Mimir Operate 界面的普通扩展，沿用现行设计系统；无需新增全局视觉规则。只写本任务核对记录，未修改产品代码或 `.trellis/spec/project/design.md`。

## 现行权威与落地

现行产品权威为 `.trellis/spec/project/product.md` §5.16，视觉权威为 `.trellis/spec/project/design.md`，任务交互细节归属 `ux.md`。本轮没有批准稿，也没有新视觉世界或系统替换授权。`finish-review.md` 的 `ship` 仅适用于已捕获的 renderer 组件。

| 系统项 | 实现证据与判断 |
| --- | --- |
| 配色 | `UpdatePage.style.ts` 消费 `colorBgContainer`、`colorText`、`colorTextSecondary`、`colorBorderSecondary`、`colorErrorText`，按钮和开关继承生产 `MimirProvider`；未另造主题。浅色白底、深色容器底与既有 About 页连续，绿色只承担动作与状态。 |
| 字体 | 共享系统 UI 字体；新增窗口使用 `FONT_SIZE.pageTitle` 19px、`section` 16px、`body` 14px、`meta` 12px。版本与进度使用等宽数字；长版本与说明折行，不缩小正文。 |
| 空间 | 主体 24px gutter，≤420px 改为 20px/16px；分组采用细分隔线与 16/24px 间距。28px 的状态前间隔为当前层级安排，不提升为全局 token。 |
| 形状与深度 | 平整工作面、轻边界与 antd 6px 控件圆角；没有新增卡片堆叠、装饰阴影或展示字体。固定 footer 属于动作可达性，内容在其上滚动。 |
| 状态与动作 | 文字表达检查、下载、准备、可安装、保存阻塞与恢复；未知总量不画百分比，普通退出不暗示安装。标题栏低强调文字入口与 About 普通按钮符合既有主次关系。 |

## 五行系统摘要

- 调色：白灰/深灰工作面，绿色主操作，错误仅用于实际异常。
- 字阶：共享系统 UI 字体，新增窗口 19 / 16 / 14 / 12px。
- 内容优先：用真实状态、用户语言和就地下一步组织内容。
- 紧凑工作台：用位置、空白、细边界分组，继承 6px 控件圆角。
- 窄屏可达：先折行与滚动，保留底部动作，不缩小正文。

上述规则已有现行规范依据；更新窗口的布局及文案属于任务细节，继续留在 `ux.md` 与实现中，不重复扩充为通用规范。未生成根 `DESIGN.md` 或 sidecar。

## 已核对证据

- 源码：`apps/desktop/src/renderer/update/{UpdatePage.tsx,UpdatePage.style.ts,update-copy.ts}`、`apps/desktop/src/renderer/components/{TitleBar.tsx,TitleBar.style.ts}`、`apps/desktop/src/renderer/routes/about.tsx`。
- 系统：`packages/renderer/src/theme/{tokens.ts,customToken.ts}`、现行 product/design 规范，以及本任务 `ux.md`。
- 归档：本目录 `README.md`、`finish-review.md`、`layout-metrics.json`；独立核对 76 条记录，横向溢出为 0。
- 实际查看的 PNG：`before-light-920.png`、`after-light-920.png`、`after-dark-390.png`、`new-downloaded-light-360.png`、`new-cloud-dark-360.png`、`new-long-dark-360.png`。前后内容/主题/尺寸保持可比；新增窗口的说明明确标为验收示例，未冒充真实发布。
- 参考边界：已读本任务 `research/interaction-evidence.md` 与 `research/distribution-evidence.md`。其中记录 WeKnora 官网、稳定版 v0.8.3 和源码快照 `8dab7550f5069ef80877a65b52dc5483c45f7827` 的 `.github/workflows/app.yml` 证据，只支持桌面 CI 路径，不能成为 Mimir Electron 更新 UI 的直接模型；本次没有重新开展外部调研。连续工作区概念沿用既有 Obsidian 对照，视觉权威仍为当前 Mimir 规范。

## 未修复或未规范化的既有差异

根 `PRODUCT.md`、`DESIGN.md` 与 `.impeccable/design.json` 在本次检查时缺失；项目已明确使用 `.trellis/spec/project/` 的现行权威，普通扩展不触发迁移。About 标题继续使用 antd `Typography.Title level={2}` 默认字号而非显式 `FONT_SIZE` 角色，前后截图均存在；不将其默认字号提升为新系统阶梯。`TitleBar.style.ts` 原注释仍称页面头部同为 44px，而现行面板头部 token 为 48px；`tokens.ts` 的 badge 注释仍引用旧最小字号说明。这些既有差异只报告，不在本任务顺手修复，也不写成未来界面的规范。

原生通知是否只提醒一次且不抢焦点、原生菜单入口、窗口关闭后的实际焦点返回、真实调整尺寸、系统读屏表现与安装升级事务，均不能由这些 fixture HTML/PNG 证明；需保留独立 Electron 运行和真实发布升级验收。
