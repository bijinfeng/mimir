# 最小实施设计

现有载体及使用方式不变。缺口的归属是Desktop renderer：SetupPage在read pending直接return null；submit只从按钮消费禁用，Input Enter可绕过；普通状态没有播报；标题栏自定义toggle缺显式focus；关于长值没有换行边界。主进程与共享业务均不需要拦截。

## 文件与行为

- SetupPage.tsx：始终渲染现有窗口栏与品牌/表单壳；read pending仅显示真实读取反馈，不提前画首启表单。submit在同一个入口守空cloud URL与同步请求门闩，失败释放/保地址，成功保持等待activate。现有两阶段choose/activate及协议补全全部保留。进度在独立role=status区域，不与动作挤一行。
- SetupPage.style.ts：仅真实组件测量后收敛短高间距和长错误换行；保留主体滚动/窗口栏固定、选项命中区及主题token，不添加新卡片/横幅。
- TitleBar.style.ts：自定义toggle补token focus-visible，不动no-drag与平台留位/46×44窗口控件。
- routes/about.tsx：仅密度与value min-width/overflow-wrap，保留query重试与现有文案。压力长版本不是实际发布版本。
- SetupPage.test.tsx：真实挂载deferred read保留载体、空Enter、单请求/失败可重试/保留地址等必要回归。CSS布局由真实前后截图验证，避免镜像实现的样式断言。

## 不变合同与回退

不改main/preload/config/cloud/security、Session/token、原子持久化、原生窗口/菜单和共享设置。现有页面上选择两种模式、失败返回、原生no-drag和macOS红绿灯保持。无需依赖迁移。局部回退只恢复以上文件，归档证据独立保留。

## 证据

使用真实组件、导入前稳定模拟桥，冻结基线53285bb，之后冻结实际after。分别记录DOM/截图真实路径、模拟IO及原生限制，不将19来源流程当19次GUI验收。生产当前未设最小窗宽，验证1440×900默认、1100×760及800×480/390×400压力尺寸，绝不虚构生产最小值。macOS锁屏阻断原生UI验证；三段build和适用真实Electron启动自检提供单独证据，不能代替原生菜单点击。

## 授权与收敛

用户2026-10-19明确后续无需确认、直接实施并存档，覆盖本轮；无待决定的业务/风险事项。研究已查WeKnora和Obsidian固定证据，计划依源码与真实baseline收敛，不借本轮新增功能。实施前主会话看一次真实baseline，完成后批次核对与最多一轮修正。
