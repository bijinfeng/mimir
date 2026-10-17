# 会静默出错的地方

这几类问题**不报错**，只在你以为没问题的时候悄悄地错。改外壳前先扫一遍。
新坑记到这里（跨区域的记[项目坑表](../../../project/pitfalls.md)）。

| 症状 | 原因 |
|---|---|
| 编辑器只有内容高、下面一大片空白 | 高度链缺了一环。整条链是 `scroll(min-height:0)` → `cols(min-height:100%)` → `innerWide(align-self:stretch)` → 主题变量层(`flex:1;min-height:0`) → `.mimir-editor(flex:1)`。实测断过两次：`cols` 的 `align-items: flex-start`、主题变量那一层是默认 `block` |
| 工具条不粘（滚走了） | `.mimir-editor` 用了 `overflow: hidden`——它会让元素成为滚动容器，里面的 `sticky` 相对它定位而它与内容同高。要用 `overflow: clip` |
| **窄窗口下快捷保存或状态行被裁掉** | 宽度链缺了一环：`.mimir-editor` 是 flex 子项，`min-width: auto` 让它不会缩到比内容更窄（里面有一张 900px 的 pdf 页面），于是整块外壳比视口宽（实测 420px 窗口里量出 932px）。它看起来像「顶部操作或底部状态被裁掉」，其实是外壳的宽度下界。`min-width: 0` 即可——注意 `overflow: clip` **挡不住**它（Chrome 只对 `hidden`/`auto`/`scroll` 把自动最小尺寸算作 0），而 `clip` 又是 sticky 那条必需的 |
| **工具条标签写了快捷键但它不存在** | docx 的「查找和替换 (Ctrl+F)」曾只弹浏览器自带的页面查找——**按钮上的标签是一份承诺**，写着就得真有。修法是外壳的 `useFindHotkey` + 查找框统一挂 `data-find-input`（标记不看类名/aria——那两样会被无关调整改掉，而改掉的那一刻快捷键静默失效） |
| 折叠分组打开后键盘进不了控件，或 Escape 关闭子菜单后焦点丢失 | 自定义面板内是普通按钮/输入框，不能只按 menuitem 导航或在首次 Tab 时关闭；应允许进入和遍历真实可用控件。嵌套组菜单的 Escape 只由最近一级菜单处理，保持父菜单和子触发器存在。查找展开与聚焦沿用 setTimeout，不能依赖隐藏 webview 可能停发的动画帧。 |
| 属性数字框显示新值，直接点“应用”却保存旧值 | 动作按钮无条件 preventDefault 会阻止数字框失焦，而数字框在失焦/Enter 才提交草稿。按钮 mousedown 须先对当前原生表单输入框显式 blur，再保护正文选区；只按已提交值判断 dirty 也会让按钮持续 disabled，数字草稿聚焦时须保持动作可达，否则其 mousedown 无法触发。用独立 mousedown→click 序列检查仅改数值时首击取得最新值，不能只测输入框 blur 或第二次点击。 |
| 菜单面板里的下拉「点一档什么也不会发生」 | 面板里的 antd `Select` 打开后弹层 **portal 到 body**，而关面板的 `pointerdown`（capture）只认「面板或触发按钮内部」——按下瞬间面板被关、选项随面板卸载，之后的 `click` 落空，界面不报错。`useToolbarPopup` 的 `insidePanel()` 要用 antd 自己写的 `aria-controls` / `aria-owns` 把「面板里控件拥有的弹层」也算作面板内（`EditorShell.tsx`）。**测试也要按真序列驱动**（pointerdown → click）：只派发 click 时 React 会批处理，`onChange` 照样发出，这个 bug 会被测成通过 |
| Ribbon 里的 Select 能展开，却只看到字体名的第一个字 | 默认 `popupMatchSelectWidth` 把 body portal 的弹层压成触发器宽度（DOCX 字体触发器实测约 63px），选项被省略。`ToolbarSelect` 的触发器保持紧凑，弹层单独设置 `popupMatchSelectWidth={false}` 和可读的最小宽度；检查真实弹层宽、完整选项文字和窄栏边界，不能只断言 DOM 有选项 |
| 图标档的按钮读屏只念「单选按钮 1 of 3」 | antd `Segmented` 把 `title` 挂在内层 label 的 div 上，而可聚焦的是 `<input type=radio>`——两者不关联，`title` 在这里根本不当名称用（真 Chromium 的 AX 树实测 `name: ""`）。文字要用 `.me-sr-only`（`clip-path`，**不是** `display:none`）塞进 label 元素里 |
| 确认弹层在 DOM 中却不可见 | `Popconfirm` 的触发器若是包装组件，必须把 `ref` 透传到真实按钮；否则 rc-trigger 拿不到定位元素，弹层会被放到屏幕外。检查 `ToolbarButton` 的 ref 与弹层实际位置，不能只断言 DOM 里有弹层 |
| 输入框比同排的按钮小一号 | `.me-input` 那套手写观感（height / padding / border / 字号）挂在 antd 的 `Input` 上，与 antd 的 `:where(…).ant-input` 特异性相同而项目样式更靠后——实测同一排里输入框 12px / 按钮 14px、圆角 4 对 8。控件观感一律归 `--ant-*`，这个类已删（只剩宽度/弹性类） |

## RGB 子弹层的 Escape 不能穿透 Inspector

仅让 `useToolbarPopup` 识别最近 `data-toolbar-popup` 并关闭还不够：document capture 完成后，React Inspector 的 Escape handler 仍会收到原事件并关闭整个属性面板。新 opt-in 自定义 RGB 层关闭时须同时 `preventDefault` 和 `stopPropagation`，保留旧非 opt-in 行为。回归必须挂实际 `PptxEditor`，验证子层关闭、图表 Inspector 保留、焦点回取色触发器且没有宿主写入；只包一层 `ToolbarMenu` 的原语测试无法发现这个问题。见 `PptxChartColors.test.tsx`。

RGB层增加输入与动作后，旧240px估高可能让弹层向下越过视口。opt-in RGB使用独立估高选择上/下方向，并按实际锚点限制可滚动高度；只设60vh不保证低处触发器的底部动作可达。验证420px及短视口，量取弹层和“使用颜色”按钮边界，内部滚动不得触发外部dismiss；旧普通色板保持原定位语义。
