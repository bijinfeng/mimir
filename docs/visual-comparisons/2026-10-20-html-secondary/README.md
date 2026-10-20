# HTML 二级面板 · 2026-10-20

- [2 组真实前后](comparison.html)：600×360 下 HTML 元素属性检查器的初始视图与滚到底视图。
- 前态：检查器 `overflow: hidden`，中段滚动区被压到 24px，标题和标签之后直接空白；程序化 `scrollTop` 只能移动 15px。
- 后态：`@media (max-height: 520px)` 让整块检查器滚动，`scrollTop` 可到 340（内容 512、视口 172），尺寸字段与“应用宽度/高度”可见。
- 固定原件 `mimir-html-toolbar-fixture`，选中 preview 中的 `h2`；没有执行真实保存或模型请求。
