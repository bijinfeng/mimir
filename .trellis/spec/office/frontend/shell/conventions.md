# packages/office/src/shell —— 六种编辑器共用的外壳

工具条 / 状态行 / 高度链 / 弹层都在这里（`EditorShell.tsx`、`shell.css`、
`.mimir-editor` 与 `.me-*` 类）：markdown、html、pdf 与三种 Office 格式
共用同一份实现，外观一致不靠约定（D-054）。父层 `.trellis/spec/office/engine/index.md`
与[项目规则](../../../project/rules.md)仍然适用。

宿主侧的边界（不要在共用界面里盖这棵子树的 `.ant-*`、`--me-*` 变量由
主题桥填）见 `.trellis/spec/renderer/frontend/index.md`「样式」一节。

工具栏与画布的分隔由共用 `.mimir-editor__chrome` 底边承担。深色模式下工作台与工具栏填充接近，可用主题边框色稍微提高一档对比，但保持单条 1px 线，不叠加明显阴影或额外高度；浅色和深色都要在真实文档页检查。

---

## Footer 与状态行

`EditorShell` 的 `footer` 是可选的辅助操作区；未传入时不渲染 `.mimir-editor__footer`。底部 `.mimir-editor__status` 独立承载页码和未保存状态；保存按钮在上方 Ribbon 标签左侧的固定快捷操作区。六种格式正常浏览时都不放常驻操作教程或能力清单，以免压缩画布；选择对象后出现输入控件和上下文操作，失败与原件风险在相关时刻提示。PDF 编辑器只在操作失败等临时事件中传入可关闭的 `ToolbarNotice`。

```tsx
footer={notice ? <ToolbarNotice>{notice}</ToolbarNotice> : undefined}
```

删除页的“没有撤销，只能靠不保存退出”保留在 `ToolbarConfirm`，裁剪和纸型的简短行为说明保留在对应菜单。验证正常状态无 `.mimir-editor__footer`，触发失败提示后该区出现且可关闭，同时底部页码、未保存状态与顶部保存按钮均可见。PPTX 段落编辑与 XLSX 单元格编辑等实际输入控件继续使用各自的 `footer`。

## Ribbon 快捷操作合同

1. **范围**：六种编辑器共用 `CompactToolbar` 的标签行；`EditorShell` 仍提供底部状态槽，不从底部复制第二个保存按钮。
2. **签名**：`CompactToolbar({ quickAccess?: ReactNode, tabs?, sections, activeTab?, onTabChange? })`。格式编辑器将 `ToolbarButton` 放入 `quickAccess`，共享组件只布局，不执行格式操作。
3. **行为**：快捷操作固定在 `.mimir-compact-toolbar__quick-access`；`.mimir-compact-toolbar__tabs` 单独横向滚动，标签的左右/Home/End 键导航不变。保存沿用各格式的 dirty、加载中和保存中判据及回调；历史按钮只调用当前画布的真实撤销栈。
4. **禁用与错误**：没有未保存修改或正在保存时禁用保存并给原因。DOCX、HTML、Markdown 用实际历史深度控制撤销/重做；XLSX、PPTX、PDF 尚无完整手动历史时禁用并说明原因。Agent 的 `undoRound` 和 PPTX 单对象回退不能绑定到通用撤销按钮。
5. **用例**：改动后保存写回同一原件；干净文档保存禁用；尚无历史的格式即使发生过 Agent 写入也不显示可用的全局重做。
6. **测试**：断言快捷区位于标签前、窄栏下不随标签滚走、标签键盘导航仍可用；各格式点保存后核对 dirty 与保存读回，检查禁用原因及无底部重复按钮；有历史的格式各测一次撤销和重做。
7. **错误做法与正确做法**：不要用 `undoRound` 填补全局历史，也不要另造保存回调；把现有 `ToolbarButton` 与回调移入 `quickAccess`，由格式引擎决定可用状态。
