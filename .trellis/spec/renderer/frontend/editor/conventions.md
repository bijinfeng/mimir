# packages/renderer/src/editor —— Markdown 笔记的编辑器

Tiptap 扩展配置与保真测试。父层 `.trellis/spec/renderer/frontend/index.md` 仍然适用。
编辑器外壳（工具条 / 状态行 / 高度链）**不在这里**，在 `packages/office/src/shell`
——`NoteEditor` 只是适配层：把保存包成 `onSave`、注入方言与排版类、
把「立即保存」交给 `lib/unsaved` 的守卫。

---

## 往返保真：不无损，但幂等

Tiptap 的 markdown 往返**不是无损的，但是幂等的**——首次保存会把内容整理成
编辑器的规范形，之后不再变化。改 `editor/extensions.ts` 后必须跑
`pnpm test`，`drift.test.ts` 会验证幂等性没被破坏。

工具条行为测试要用本目录的 `createExtensions()` 挂真实方言，再断言
`getMarkdown()` 的正文结果；现行例子是
`packages/renderer/src/editor/MarkdownEditor.test.tsx`。Office 包内的
`packages/office/src/editors/markdown-controls.test.ts` 只守控件结构，
不另造一套扩展配置。

---

## 扩展不要重复引入

`StarterKit` 已经内置 `codeBlock` 与 `link`。重复引入会触发
`Duplicate extension names` 警告，且配置会被其中一份覆盖——不报错，
只是行为不对。要配链接就在 `StarterKit.configure()` 里配，不再单独 import。

---

## 实例管理交给 `@tiptap/react` 的 `useEditor`，不要 `new Editor()`

它把每个回调都包一层、从 `options.current` 读，所以回调里直接用最新的
props/state 就行；手写版需要三个「靠注释提醒自己」的约束（ref 承接回调、
ref 声明顺序、初始值用 state 而非 ref），用它之后全部消失。
`deps` 传 `[]` 时它只 `setOptions` 不重建实例，所以保存回写不会丢光标。

---

## 内联工具条用官方的 `BubbleMenu`（`@tiptap/react/menus`）

跟随选区、滚动重算、边缘翻转、点工具条不取消选区都是它处理的。

---

## Tiptap v3 的 `useEditor` 默认不在事务上重渲染

（`shouldRerenderOnTransaction: false`，为性能）。所以工具条里**不能**在渲染期
直接读 `editor.isActive(...)`——它会停在「打开文档那一刻」的值，按钮不亮也
不报错。要用 `useEditorState` 订阅（`MarkdownEditor` 的 `MarkdownToolbar`
就是这么写的）。
