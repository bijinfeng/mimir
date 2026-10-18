# 执行计划

## 本轮：规划与HTML

1. [x] 建立子任务、PRD与上下文。
2. [x] 源码/宿主/API完整盘点，稳定ID、归属和现有能力缺口。
3. [x] 固定WeKnora官网/公开源码版本和证据，参考Obsidian布局，保留语雀方向。
4. [x] 独立交互HTML完整呈现同内容、同尺寸当前/提案；覆盖映射全部ID。
5. [x] 独立原型审查、限定lint/format/type/build/静态映射检查。
6. [x] 主会话浏览器批量抽验及一轮集中修正，记录实际范围。
7. [x] 冻结HTML版本/哈希，更新父任务与审批台账，限定规划提交、记录journal。
8. [x] 用户“开始实施”认可revision2 A分支及整个第五模块。

## 产品实施（已授权）

1. 刷新源码与并发工作基线；确认获批哈希，task.py start。
2. 限定LibraryView与必要局部共享表单，保留模块2–4已认可合同；实现设计中的前端修复，不新增后端能力。
3. meaningful回归：异步单飞、草稿保留、关闭回焦、缺失子目录、标签空态、列表动作无冒泡、目录删除后果准确。
4. 逐项对照冻结HTML，实际产品浅深/390px/低高度与hover几何抽验，相关Renderer检查及适当全仓门；保留外部失败，不伪报通过。
5. 独立检查、自修复、规范记录、限定提交与journal。回退只撤本任务相关变更，保留他人工作。

## 规划验证命令

- node .trellis/tasks/10-18-interaction-library/prototype/build.mjs
- node .trellis/tasks/10-18-interaction-library/prototype/check-artifact.mjs
- 根node_modules/.bin/oxlint 和 oxfmt --check 限定原型源文件。
- 原型独立tsconfig的tsc --noEmit；不为纯规划重跑产品全仓测试。
- git diff --check 限定本子任务、父任务台账与本轮日志。

产品类型检查与全仓门的既有外部阻断沿用模块4记录，不归属于本轮原型验证。

## 规划内图标修订

- [x] 核实两套官方图标的固定版本、覆盖与许可，保存来源。
- [x] 保留v1，添加当前/A/B同格式同尺寸视觉比较及列表/卡片应用。
- [x] 限定检查和浏览器浅深/窄屏一次集中验收，冻结新版并提交。
- [x] 用户选择A（Phosphor双色）。
- [x] 用户“开始实施”确认最终范围，按A分支启动第五模块。

## 本轮实施收尾

- [x] 限定产品实现、16类A图标与两端许可。
- [x] 独立58组/299状态映射和源码复核。
- [x] 主会话真实UI浅深/窄屏/低高度/失败恢复抽验，最终537测试通过。
- [x] 局部规范及验收证据保存；Fetch/viewport清理并恢复真实页面。
- [ ] 全仓门：外部miniapp lint与Renderer既有TS2550阻断，保持任务进行中。

本轮结果见implementation-acceptance.md；限定提交与journal记录commit，后续模块仍须独立HTML及用户认可。
