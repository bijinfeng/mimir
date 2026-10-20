# HTML 二级面板验收

日期：2026-10-20。模块 20。HTML 元素属性检查器短窗口。

## 实际改变

- `html-inspector.css` 新增 `@media (max-height: 520px)`：检查器整块 `overflow-y: auto`，内部 `.mimir-html-inspector__scroll` 改为不参与弹性分配、`overflow: visible`，避免头部/标签/底部动作把字段区压成 0。
- 宽屏与常规高度不受影响；字段、color、tab、保存/撤销语义未改。

## 验证

- 真实产品 600×360：前态检查器内容 187px、可视 172px、内部滚动区 24px；后态内容 512px、可视 172px、整块可滚到 340px，尺寸字段和动作可见。
- `pnpm --filter @mimir/office typecheck` 通过；定向 CSS 无格式问题。
- 2 组真实截图与 HTML 快照；`comparison.html` 可离线打开。
- 全仓 `VITEST_MAX_WORKERS=1 pnpm check` 退出 0，完整输出见 `full-check.txt`。

## 边界

- 只验证短窗口滚动可达；未执行真实保存、外部图片、模型或原生文件选择。
- 未重截其它格式；共享弹层定位由模块 19 的测试覆盖。
