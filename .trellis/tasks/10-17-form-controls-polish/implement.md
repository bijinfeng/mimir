# 实施与验证计划

## 开始前

- [x] 用户已明确批准实施，已运行 task.py start。
- [x] 实施/检查代理按jsonl→prd→design→本计划读上下文；UI编辑前读Impeccable craft-floor，context已运行勿重跑。
- [x] 记录本任务路径的git基线；共享树存在大量Office/技能变动，不覆盖/暂存其他会话文件。

## 实施顺序

1. 更新本次改变的设计规范，明确轻默认字段边界与关键控件边界/焦点的分工。
2. tokens.ts按浅深状态矩阵加Input/InputNumber/Select组件token，保留全局关键边界、按钮色和无边框键盘焦点。
3. 核查Password/TextArea/Search/Cascader的真实继承。仅有实际缺陷才补最小作用域适配。
4. 调整已有design.test.ts有效provider断言，验证字段、语义状态和关键边界隔离；不新增镜像实现的脆弱测试。
5. 同步apps/web/DESIGN.md与现有sidecar（如需）；提交前清单只含本任务改动。

## 自动检查

- 使用antd 6.6.6 CLI先查API/token，修改后限定antd lint。
- 相关oxlint/oxfmt、Renderer测试与Renderer/Web/Desktop typecheck。
- 最后一轮按质量规范跑pnpm check，保留日志与输入范围；不得代修未知并行变动或降低规则。

## 真实页面批量验收

单独临时本地标签页，不动用户/Office会话5173页。仅用admin@example.com / 12345678登录。

- 桌面与390px窄屏一次批量：登录普通/密码/校验；设置数字与选择/模型级联；创建知识库弹窗多行字段（取消，不创建数据）。浅/深，鼠标/Tab/输入、disabled及error/warning。
- 读取computed border/shadow/outline与矩形，截图保存verification/；核实尺寸不随focus变化、前后缀无双框、密码眼睛及无边框控件键盘焦点仍在。
- 一次集中修复发现的问题，最多再一轮确认；禁止无限视觉微调循环。
- 清理自建标签/服务与viewport，只停止本任务创建的进程。

## 收尾

Trellis check代理全任务审查→spec更新判断→精确提交计划由用户确认→提交本任务代码与文档→归档/日志。不得夹带并行Office工作。

## 本轮执行结果

- [x] 共享字段主题及继承实现，设计规范同步。
- [x] Provider / 状态回归守卫，主题109项通过。
- [x] Renderer完整独立397项通过；警告局部修正后专项与真实浏览器通过。
- [x] 桌面 / 窄屏、浅深实际验收，集中修复后一次确认，临时资源清理。
- [x] 独立检查代理最终限定审查及全仓pnpm check已执行。
- [ ] 全仓质量门通过：最终lint / styles / format / typecheck均通过，Office / Server并行测试失败；详情verification/final-summary.md。
- [ ] 用户确认本轮具体提交范围后提交与归档。
