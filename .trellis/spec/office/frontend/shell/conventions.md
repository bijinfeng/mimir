# packages/office/src/shell —— 六种编辑器共用的外壳

工具条 / 状态行 / 高度链 / 弹层都在这里（`EditorShell.tsx`、`shell.css`、
`.mimir-editor` 与 `.me-*` 类）：markdown、html、pdf 与三种 Office 格式
共用同一份实现，外观一致不靠约定（D-054）。父层 `.trellis/spec/office/engine/index.md`
与[项目规则](../../../project/rules.md)仍然适用。

宿主侧的边界（不要在共用界面里盖这棵子树的 `.ant-*`、`--me-*` 变量由
主题桥填）见 `.trellis/spec/renderer/frontend/index.md`「样式」一节。

---
