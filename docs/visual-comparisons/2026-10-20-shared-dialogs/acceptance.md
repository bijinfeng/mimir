# 共享任务弹窗验收

日期：2026-10-20。模块 25。

## 实际改变

- 新增 `useDialogRootGeometry`：任务弹窗统一顶部落点（56/36/24）和窄屏最大宽度。
- 创建知识库移除 `centered`，改用共享落点；容器最大高度改为 `calc(100dvh - 76px)`。
- 收集内容 top 58→56，≤700px 36，≤480px 24；容器最大高度与视口对齐。
- 文档命名/移动、未保存确认移除固定 `top:52`，改用文档弹窗样式的共享落点；窄屏断点统一到 700/480。
- 文件夹、替换原件继续使用 library dialog 的同一套 56/36/24 几何。

## 验证

- `KnowledgeBaseCreateModal`、`CaptureDialog`、`DocumentCommandModal`、`UnsavedGuard` 共 36 项定向测试通过；Renderer typecheck 通过。
- 5 组真实前后截图：创建知识库 1440/390，收集内容 1440/390/600×360；同内容同主题。
- 全仓 `VITEST_MAX_WORKERS=1 pnpm check` 退出 0，完整输出见 `full-check.txt`。

## 边界

- 未执行真实知识库创建、文件上传或收集写入；只验证真实路由挂载后的组件。
- 未在 390 重开文档命名/移动弹窗（入口需先打开笔记），代码路径由定向测试覆盖。
