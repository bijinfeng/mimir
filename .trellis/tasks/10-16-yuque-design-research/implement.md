# 执行计划：共享主题与页面整体迁移

状态：2026-10-17 用户明确指示“开始实施”，规划已批准，执行中。

## 规划交付

- [x] 用户批准建档并选择整体迁移范围。
- [x] 语雀公开页 / Mimir现状截图和样式采样、WeKnora v0.8.3固定源码、Obsidian布局对照完成。
- [x] 代码消费链研究完成，文件行号保留在 research/migration-code-map.md。
- [x] 三张浅色代表稿获用户认可，补齐三张深色与四张390px关键稿，见 drafts/README.md。
- [x] 浅深配色 / 状态 / 响应式契约与计划对比度计算落盘。
- [x] PRD按目标 / 要求 / 验收 / 范围 / 风险重写，design与执行清单收敛，实施 / 检查JSONL为真实spec和研究引用。
- [x] 最终摘要已展示，用户随后明确指示“开始实施”。

## 实施顺序（批准后激活）

1. **前置**：复核git状态与本任务相关现有改动，读取适用spec。运行task.py start进入实施。实现 / 检查默认由Trellis专用子代理承担，优先原生上下文注入，无法注入时由子代理加载对应JSONL；主会话协调、同步规范与验收。
2. **主题与基础组件（R1 / R7）**：建立独立UI / 阅读角色、中性导航选中、浅深状态与绿色校准；复用provider，修正首帧底色。保留品牌浅底用于真实语义状态。按新契约同步主题测试和设计规范。
3. **导航与知识库（R2 / R3）**：整合256px左栏，保留52px紧凑与偏好；窄屏覆盖和焦点；知识库信息 / 操作 / 网格 / 列表层级，保留上传 / 新建 / 目录 / 状态与用户视图偏好。
4. **文档与设置（R4 / R6）**：正文 / 大纲 / 问AI和直接编辑工具区；窄屏工具可达，表单堆叠 / 分区Select、保存和未保存保护。新建菜单只复用现有动作。
5. **跨包与平台（R5）**：Chat主视图 / 文档侧栏继承；Office --me-* / --ant-*、旧变量fallback / 缩略图 / 菜单；Web / Desktop / 首启HTML与原生窗口底色和控件。
6. **质量与规范（R7）**：Trellis检查子代理按check.jsonl核查并修复；主会话复核正式设计文档和spec、真实运行截图及AC1–AC9。每段使用有边界的变更，避免共享主题 / 路由文件并行冲突。
7. **交付**：报告实际检查结果与限制，按用户授权处理提交等收尾；本次规划不自动提交或发布。

## 验证计划

优先使用既有主题、导航、目录、文档、Settings、Chat与Office行为测试；仅为新增的必要行为补测试，不创建镜像色值的测试。旧精确蓝色断言按批准的新契约替换，保留真实DOM / CSS变量与对比度门。

- pnpm --filter @mimir/renderer test src/theme/design.test.ts src/theme/appearance.test.ts
- pnpm --filter @mimir/renderer test （受影响的导航 / Library / Document / Settings测试按文件筛选）
- pnpm --filter @mimir/chat test （受影响的主视图 / 侧栏继承测试）
- pnpm --filter @mimir/office test （CompactToolbar / EditorShell与受影响编辑器测试）
- pnpm --filter @mimir/desktop test （TitleBar / Setup相关测试）
- 最终完整质量门：pnpm check。

真实运行检查使用项目既有测试账号 admin@example.com / 用户名admin及AGENTS.md规定密码，不创建新账号。覆盖Web / Desktop、浅 / 深、390px、879 / 880 / 881px和宽屏：展开 / 折叠、长标题、空态 / 错误、弹层、键盘焦点、文件上传、直接编辑 / 保存 / 未保存保护、文档AI / 引用跳转及各格式共用工具区。

## 风险与回退

- 研究开始时有381项未提交变更，实施前重查；保护用户已有工作，禁止全仓reset或无差别蓝色替换。
- 单改antd Menu token不能覆盖导航本地 !important；不能把所有selected都改灰。
- Office内容颜色不同于应用壳，旧变量fallback须逐项判定；Chat / Office主题变量与高度链不能断开。
- 计划纯色对比度不替代antd算法与透明叠加后的实际颜色；静态稿不能证明交互或窄屏运行正确。
- 正式规范随实现同步，按主题 / 导航布局 / Office桥分段回退，不涉及用户数据。
- 目前只做规划与图片检查；上述产品测试和完整质量门均未在本轮执行，不能标记已通过。
