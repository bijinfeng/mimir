# 会静默出错的地方

这几类问题**不报错**，只在你以为没问题的时候悄悄地错。改外壳前先扫一遍。
新坑记到这里（跨区域的记[项目坑表](../../../project/pitfalls.md)）。

| 症状 | 原因 |
|---|---|
| 编辑器只有内容高、下面一大片空白 | 高度链缺了一环。整条链是 `scroll(min-height:0)` → `cols(min-height:100%)` → `innerWide(align-self:stretch)` → 主题变量层(`flex:1;min-height:0`) → `.mimir-editor(flex:1)`。实测断过两次：`cols` 的 `align-items: flex-start`、主题变量那一层是默认 `block` |
| 工具条不粘（滚走了） | `.mimir-editor` 用了 `overflow: hidden`——它会让元素成为滚动容器，里面的 `sticky` 相对它定位而它与内容同高。要用 `overflow: clip` |
| **窄窗口下状态行右端的「保存」看不见** | 宽度链缺了一环：`.mimir-editor` 是 flex 子项，`min-width: auto` 让它不会缩到比内容更窄（里面有一张 900px 的 pdf 页面），于是整块外壳比视口宽（实测 420px 窗口里量出 932px）。它看起来像「底部操作被裁掉」，其实是外壳的宽度下界。`min-width: 0` 即可——注意 `overflow: clip` **挡不住**它（Chrome 只对 `hidden`/`auto`/`scroll` 把自动最小尺寸算作 0），而 `clip` 又是 sticky 那条必需的 |
| **工具条标签写了快捷键但它不存在** | docx 的「查找和替换 (Ctrl+F)」曾只弹浏览器自带的页面查找——**按钮上的标签是一份承诺**，写着就得真有。修法是外壳的 `useFindHotkey` + 查找框统一挂 `data-find-input`（标记不看类名/aria——那两样会被无关调整改掉，而改掉的那一刻快捷键静默失效） |
| 菜单面板里的下拉「点一档什么也不会发生」 | 面板里的 antd `Select` 打开后弹层 **portal 到 body**，而关面板的 `pointerdown`（capture）只认「面板或触发按钮内部」——按下瞬间面板被关、选项随面板卸载，之后的 `click` 落空，界面不报错。`useToolbarPopup` 的 `insidePanel()` 要用 antd 自己写的 `aria-controls` / `aria-owns` 把「面板里控件拥有的弹层」也算作面板内（`EditorShell.tsx`）。**测试也要按真序列驱动**（pointerdown → click）：只派发 click 时 React 会批处理，`onChange` 照样发出，这个 bug 会被测成通过 |
| 图标档的按钮读屏只念「单选按钮 1 of 3」 | antd `Segmented` 把 `title` 挂在内层 label 的 div 上，而可聚焦的是 `<input type=radio>`——两者不关联，`title` 在这里根本不当名称用（真 Chromium 的 AX 树实测 `name: ""`）。文字要用 `.me-sr-only`（`clip-path`，**不是** `display:none`）塞进 label 元素里 |
| 确认弹层在 DOM 中却不可见 | `Popconfirm` 的触发器若是包装组件，必须把 `ref` 透传到真实按钮；否则 rc-trigger 拿不到定位元素，弹层会被放到屏幕外。检查 `ToolbarButton` 的 ref 与弹层实际位置，不能只断言 DOM 里有弹层 |
| 输入框比同排的按钮小一号 | `.me-input` 那套手写观感（height / padding / border / 字号）挂在 antd 的 `Input` 上，与 antd 的 `:where(…).ant-input` 特异性相同而项目样式更靠后——实测同一排里输入框 12px / 按钮 14px、圆角 4 对 8。控件观感一律归 `--ant-*`，这个类已删（只剩宽度/弹性类） |
