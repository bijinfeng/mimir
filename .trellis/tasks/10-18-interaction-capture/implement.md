# 执行计划与审阅门

## 已完成规划轮：独立HTML（历史阶段）

1. 刷新CaptureDialog/UploadPanel/LibraryView/App/Server合同与场景矩阵；查WeKnora官网及固定公开源码。
2. 采集真实空/有效链接/上传/窄屏界面作为当前列依据，不做真实抓取与导入写入。
3. 为全部场景交付HTML前后对比，内置主题、尺寸、目录导航、模拟响应和恢复动作。每项覆盖可追溯至来源与入口。
4. 独立检查覆盖和前后真实性；构建、类型、lint/format与真实浏览器检查，发现问题集中修正。
5. 冻结版本、SHA256、截图和未验证边界；限定提交任务材料，等待用户认可HTML。不得task.py start或改产品代码。

## 实施阶段（已获用户批准）

根据冻结版本配置implement/check上下文，启动任务，Trellis implement/check完成前端精修、必要回归、实际产品浅深/窄屏/键盘/hover采样。若涉及新后端能力或语义变化先返回提案，不借精修扩大范围。保留现有Server落盘顺序与原件成功语义。

质量门按项目要求执行，外部任务失败如实记录，不改别的会话WIP，不宣称全仓通过。按功能提交，不推送。

## 已批准实施轮：变更边界

行为缺口由CaptureDialog（输入/等待/布局/锁/交接）和UploadPanel（串行与结果）负责；LibraryView整页drop目前另走toast队列，须接入同一上传面板。AppShell宿主回调目前直接跳文档，须在成功后导航前使用既有runGuarded并保留结果。

预计修改CaptureDialog.tsx及其局部样式/子组件、UploadPanel.tsx及其局部样式/子组件、LibraryView.tsx、routes/_app.tsx、lib/app-shell-context.ts，及相应行为测试。OfficeSourceEditor仅在注册既有保存回调时显式声明不可由guard代存，setSave第三可选能力参数向后兼容；不改Office工具栏。按独立关注点拆分长组件，不整体重构知识库或守卫。主会话负责唯一归属规范、审批记录、浏览器与提交。Server/Shared合同、全局主题及其他会话WIP不改。

1. 对照冻结main.tsx/review.css/coverage.json按91项核对，在行为拥有者实现视觉与状态；不把原型评审工具带进产品。
2. 单请求完整URL校验、IME、同步锁、settling/timer；上传单批次/查询刷新/目录保留/网络不确定文案；接通统一drop与guard。
3. 必要可控promise/timer组件回归覆盖竞态、失败保留、guard取消、批次与URL边界；限定lint/format/tsc及Renderer完整测试。
4. 独立check自修；主会话真实浏览器同状态浅深/390px/低高度、hover/焦点/长内容并保存对照证据。原生边界如实区分未验。
5. pnpm check及差异质量门；记录外部阻断。限定提交并写journal，不推送。
