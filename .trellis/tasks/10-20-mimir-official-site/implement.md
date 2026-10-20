# Mimir 官网实施计划

## Planning gates

- [x] 用户同意创建任务与进入规划。
- [x] 用户确认 Web 公开 `/` 首页接入范围。
- [x] 核查产品边界、现有品牌、路由和两端共享规则。
- [x] 检查 WeKnora 官网及 v0.8.3 tag commit，检查 Obsidian 官网；留存证据与适用边界。
- [x] 用户在方案页选择“问题带路”（question）。
- [x] 收敛 PRD / design / implement 与官网 surface brief。
- [x] 用户批准最终规划摘要（“开始实施吧”），允许激活与实施。

## Implementation sequence

1. 加载 renderer、theme、web 与 desktop 路由规范。配置 curated implement/check manifests，以原生 Trellis implement/check 子代理执行与复核。
2. 保存真实现有首页/登录/工作区基线。官网是新增页面，记录旧 `/` 为工作区重定向，不伪造不存在的旧官网。
3. 添加显式 Web 公开首页配置；官网 `/` 不请求会话，其他路由仍经会话检查。补充路由访问、API 失败、桌面默认行为和 basepath 行为测试。
4. 按选定结构实现营销组件、真实能力文案、页内导航、示例与 CTA；复用品牌，不改动工作区视觉合同。
5. 同批更新产品/Web 页面与路由合同、官网 surface brief，以及必要的现行规范；不记录无实质变化的决策条目。
6. 通过质量门后执行一次批量桌面/390px/浅深主题检查；对缺陷集中修复，最多再确认一轮。
7. 归档相同内容、主题和尺寸的真实渲染 HTML 对比、截图、覆盖清单与验证结果；旧对比保留。
8. 审阅任务相关差异、提交代码/测试/现行规范与任务记录；记录 commit，按用户要求决定是否推送。

## Validation

- 路由行为：公开首页无 session 请求；未登录受保护地址进入登录并保留目标；已登录进入工作区；连接失败恢复页仍工作；桌面默认入口不变；basepath 路径可用。
- 真实登录验证只使用 `admin@example.com` / `12345678` / `admin`。
- `pnpm check`（全仓 lint、样式、格式、类型与测试）。
- `pnpm --filter @mimir/web build` 与 desktop 构建/类型校验按涉及范围执行。
- 真实浏览器检查：1440px / 390px；导航、CTA、引用演示、锚点、键盘焦点、reduced-motion、滚动与主题。

## Rollback

变更限于官网目录、入口配置、根/索引路由及相关测试与规范。移除 Web 的 publicHome 注入即可恢复原入口；不涉及后端、数据库或文件迁移。

## Execution record

- [x] 保存旧入口真实截图；完整 HTML 从未改动的登录组件补采。
- [x] 实现 Web 显式 publicHome、精确根路径公开与共享路由回归测试。
- [x] 实现选定官网、真实工作台预览、引用交互和内容边界说明。
- [x] 同步产品、Web 与 renderer 现行规范。
- [x] Trellis check、Impeccable finish reviewer 与 documenter 完成复核。
- [x] 批量检查 1440/390px 浅深主题、键盘、认证与 reduced-motion；一次集中修复并最终确认。
- [x] 保存 15 组真实截图与完整 HTML、尺寸/哈希、覆盖说明。
- [x] 最终全仓质量门、Web/Desktop 构建，结果见 verification/acceptance.md；随后按任务范围提交并归档。
