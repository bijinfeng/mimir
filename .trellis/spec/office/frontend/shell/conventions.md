# packages/office/src/shell —— 六种编辑器共用的外壳

工具条 / 状态行 / 高度链 / 弹层都在这里（`EditorShell.tsx`、`shell.css`、
`.mimir-editor` 与 `.me-*` 类）：markdown、html、pdf 与三种 Office 格式
共用同一份实现，外观一致不靠约定（D-054）。父层 `.trellis/spec/office/engine/index.md`
与[项目规则](../../../project/rules.md)仍然适用。

宿主侧的边界（不要在共用界面里盖这棵子树的 `.ant-*`、`--me-*` 变量由
主题桥填）见 `.trellis/spec/renderer/frontend/index.md`「样式」一节。

---

## Footer 与状态行

`EditorShell` 的 `footer` 是可选的辅助操作区；未传入时不渲染 `.mimir-editor__footer`。底部 `.mimir-editor__status` 独立承载页码、未保存状态和保存按钮。PDF 编辑器只在操作失败等临时事件中传入可关闭的 `ToolbarNotice`；正常浏览时不放常驻技术说明段落，以免压缩画布。

```tsx
footer={notice ? <ToolbarNotice>{notice}</ToolbarNotice> : undefined}
```

删除页的“没有撤销，只能靠不保存退出”保留在 `ToolbarConfirm`，裁剪和纸型的简短行为说明保留在对应菜单。验证正常状态无 `.mimir-editor__footer`，触发失败提示后该区出现且可关闭，同时 `.mimir-editor__status` 中的页码与保存按钮始终可见。PPTX 段落编辑与 XLSX 单元格编辑等实际输入控件继续使用各自的 `footer`。
