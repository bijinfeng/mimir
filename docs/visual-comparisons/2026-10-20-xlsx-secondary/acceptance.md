# XLSX 二级面板验收

日期：2026-10-20。模块 22。

## 实际改变

- `xlsx-tools.css` 新增 `@media (max-height: 520px)`：检查器整块 `overflow-y:auto`；内容、表单、fieldset 不再参与弹性压缩；对象动作条 `position: sticky; bottom: 0`。
- 覆盖 chart/image/table 模式以及新对象创建面板；常规高度和 390×400 既有固定动作合同不变。

## 验证

- 真实 600×360：前态 fieldset 可视 24px / 内容 332px，动作底部 354 超出面板 333；后态检查器可滚 509px，动作 sticky 底 333，滚到 220 后字段可见。
- `pnpm --filter @mimir/office typecheck` 通过。
- 2 组真实前后截图；比较页可离线打开。
- 全仓 `VITEST_MAX_WORKERS=1 pnpm check` 退出 0，完整输出见 `full-check.txt`。

## 边界

- 未执行真实图表插入/保存；只验证面板可达性。
- 未重截所有 XLSX 模式；共享 inspector 结构由现有测试和前一轮归档覆盖。
