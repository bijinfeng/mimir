# 执行计划

## 本轮规划交付

1. [x] 按用户“继续”创建第六模块子任务、PRD与基础上下文。
2. [x] 刷新文档源码/路由/API/测试合同及所有稳定ID、状态、归属。
3. [x] 固定WeKnora官网/源码、Obsidian阅读参考与适用边界。
4. [x] 独立HTML当前/提案对比，完整覆盖与可操作路径。
5. [x] 独立检查覆盖和源码真实性；限定lint/format/tsc/构建/检查脚本。
6. [x] 主会话真实浏览器浅深桌面、390px、低高度及代表路径抽验，集中修正一次并确认。
7. [x] 最终PRD收敛、冻结版本哈希、更新父任务/审批台账、限定规划提交及journal。
8. [x] 用户明确认可冻结v1，记录授权并进入实施。

## 计划验证

- node .trellis/tasks/10-18-interaction-document/prototype/build.mjs
- node .trellis/tasks/10-18-interaction-document/prototype/check-artifact.mjs
- 根oxlint/oxfmt --check仅本原型源；原型独立tsc --noEmit。
- git diff --check限定本子任务与父任务台账/日志。
- 覆盖完整性脚本验证所有ID/状态有定位，不把数量作为GUI通过数。
- 规划交付不重跑产品全仓门；模块5记录的范围外lint/TS2550阻断继续保留。

## 获批后实施顺序

刷新并发源码与批准哈希 → 限定共享文档组件及必要守卫实现 → 相关业务回归 → 同内容尺寸产品/批准稿核对 → 独立Trellis检查与全仓质量门 → 现行规范同步 → 功能提交与日志。若实质范围变化先改HTML重新认可；回退只撤本任务改动。

## 本轮实施检查表

- [x] 核验冻结哈希与当前基线，划分互斥文件所有权。
- [x] 核心读写/标题/整理/大纲/引用/跨篇导航实现与回归。
- [x] 阅读外观、头尾、媒体与助手宿主按批准稿还原。
- [x] 未保存保护、命令弹窗及键盘恢复对齐。
- [x] 78组422状态逐项产品落点与证据矩阵。
- [x] 相关Renderer回归、独立Trellis检查及全仓质量门。
- [x] 实际GUI与批准稿同内容尺寸对照，集中修正后确认。
- [x] 规范/验收记录、限定功能提交与journal。

实施边界：缺口位于共享Renderer文档宿主，不修改后端/Office内部编辑器/完整Chat；不重做全局主题、不添加分享/全局router blocker。允许必要文档局部辅助组件，禁止大规模搬迁或用整对象元数据响应覆盖活正文。预期修改DocumentPanel、document子组件/局部样式与相关测试，UnsavedGuard/lib unsaved仅在现有canSave与等待恢复合同处修改；保持并发未提交工作。

实施与抽验已完成；完整质量门存在范围外阻断，任务不归档。最终局部CSS去除窄屏默认8px上下margin，GUI确认top24；19项弹窗/守卫回归通过。详见implementation-acceptance.md。
