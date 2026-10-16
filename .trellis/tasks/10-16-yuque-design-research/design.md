# 技术设计：语雀风格整体迁移

状态：2026-10-17，用户已批准最终浅深色、窄屏和完整实施范围，进入实施。

## 架构与边界

复用 packages/renderer 的共享Web / Desktop界面及antd-style，保持单一MimirProvider。基础颜色 / 表面 / 字体角色由 theme/tokens.ts 与 customToken.ts 提供，Ant Design 6.6.6的派生值需用实际CSS验证。静态稿附带的Stitch自动设计系统不是正式token来源。

将导航中性选中与品牌语义浅底分开：新增或复用专用导航角色，不能把 colorPrimaryBg 全局改灰。NavSidebar.style.ts 的本地 !important、FolderSection树当前项、最近笔记、设置选中需要一起迁移，保留 aria-current 与层级语义。

UI约14px、阅读约15px独立定义，正文宽度以760px起步；避免全局body字号变化放大工具条和表单。正式配色 / 状态 / 窄屏契约见 research/appearance-responsive-contract.md。

## 主题消费与数据流

1. 受控 auto / light / dark 与现有持久化入口继续驱动共享provider，不创建第二份主题真相。
2. Chat继承宿主颜色，ChatThemeBridge只负责字号与gutter；主Chat与文档侧栏均纳入验收，保持宿主祖先变量与高度链。
3. Office沿用 editor-theme-bridge.ts 的 --me-* 协议，并检查直接消费 --ant-* 的工具栏；不能把桥移到编辑器兄弟节点。旧变量 / 蓝紫fallback逐个按容器或内容语义修正。
4. Web、Desktop主窗口与首启HTML底色、Electron BrowserWindow加载色同步；保留外观首帧读取与color-scheme。关闭窗口的红色、文档纸张与内容调色板不跟品牌批量替换。
5. 详细消费点、风险文件行号与已有测试入口保留在 research/migration-code-map.md。

## 导航、页面与响应式

- 展开态整合全局栏与任务侧栏为约256px一栏；复用现有路由、FolderSection、对话与最近笔记，不新增服务或聚合接口。
- 约52px紧凑态继续保存用户偏好；<=880px由单一NAV_NARROW_BREAKPOINT派生，强制紧凑不回写用户偏好。
- 窄屏导航按约280px覆盖打开，必要时限制在视口内；X / 遮罩 / Escape关闭，管理焦点与滚动锁，关闭或选择后回内容。未保存保护优先。
- 知识库保留卡片 / 列表偏好，按内容可用宽度适配网格。窄屏“新建”菜单仅收纳现有文件 / 文件夹动作；scope=all继续进入首个知识库。
- 文档继续直接编辑，正文、大纲、问AI复用现有面板；窄屏隐藏大纲，工具条用现有折叠 / 分组 / 局部滚动策略，既有命令仍可达。
- 设置宽屏保留页内分区，窄屏用现有Select，URL section与平台可见性不变；字段与模型行堆叠，保存 / 取消不变成自动保存。

## 兼容性、权衡与回退

- 不改API / 数据库 / 认证 / Agent协议 / 文件格式，不迁移用户数据或内容颜色。
- 本任务是一套共享视觉系统，按主题、导航 / 页面、跨包继承顺序分阶段实现和验证，不拆成可独立批准的皮肤项目。
- 先建立状态契约，再更新精确旧值断言；保留真实渲染、对比度、行为与继承守卫。可读性校准由计划值进入实际CSS验证，不能直接套工具生成色阶。
- 回退按主题 / 页面布局 / Office桥区分；已有工作保持不动，不使用全仓reset或无差别换色。
- 同步 apps/web/DESIGN.md、对应设计sidecar与 .trellis/spec/project/design.md 以及实际受影响的包级主题规范，明确语雀优先于此前Obsidian视觉方向的本任务例外；通用安全与可读性规则继续适用。

## 已知限制与后续验证

语雀登录态工作台 / 实际编辑器 / 深色缺实测，这些部分明确作为Mimir适配设计。已确认的宽屏浅色、深色及390px关键图只证明静态方案可评审；运行中的焦点、断点、保存、引用与主题继承需在实施后验证。

用户已明确批准 final-review.md 并指示“开始实施”；共享主题、导航、内容与跨包适配已实施，正式设计文档与规范同步中。当前以真实运行与测试结果判断验收。
