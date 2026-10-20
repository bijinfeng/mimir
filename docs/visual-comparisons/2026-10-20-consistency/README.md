# 跨模块一致性复核 · 2026-10-20

模块 27。基于前 26 个模块的归档与源码检查，确认没有需要再做产品改动的跨模块漂移。

## 复核项

| 项 | 结果 | 证据 |
| --- | --- | --- |
| 任务弹窗落点 | 创建知识库、收集、文档命名/移动、未保存确认统一 56/36/24 | `2026-10-20-shared-dialogs`，`useDialogRootGeometry` |
| Office 工具条弹层 | 共享 `useToolbarPopup` 限制在 `.mimir-editor` 内并按视口限高；颜色层保留既有 CSS 高度合同 | `2026-10-20-markdown-secondary`、`EditorShell.test.tsx` 122 项 |
| 短窗检查器 | HTML 元素属性整块滚动，XLSX 对象面板整块滚动 + sticky 动作，DOCX/PDF 正文滚动 + 固定动作 | `html-secondary`、`xlsx-secondary`、`docx-secondary`、`pdf-secondary` |
| 390px 笔记分类条 | 四档标签收窄内边距后完整落在 205px | `narrow-workspace` |
| 对话框无残留旧落点 | `centered`、`top:52/58` 在任务弹窗中已清零（仅剩 DOM 加载占位 class） | 源码 grep |
| 主题与字号 | Renderer `design.test.ts` 109 项继续通过；主题只由 `MimirProvider` 注入 | 全仓 check |
| 空/加载/错误 | 文档、对话、知识库、设置各自保留真实状态；本轮没有为统一而删状态 | 各模块验收 |

## 结论

没有新的产品代码改动。剩余工作只有小程序 7 页；Web / Desktop / Office 的模块级打磨已全部有归档。
