# Markdown 二级浮层验收

日期：2026-10-20。模块 19。属性面板与共享工具条弹层收口。

## 实际改变

- `useToolbarPopup`：弹出层先按最近的 `.mimir-editor` 外壳左右边界收窄（保留 8px），再按视口可用高度写 `maxHeight`；外壳尚未布局时回退视口。390px 下不再压到 52px 导航轨；600×360 下不再越过底边。
- Markdown 属性面板：把“保存笔记属性”放入 sticky 底栏；YAML 文本域在短窗口内滚动，动作常驻面板底部。
- 没有改属性读写、Markdown 方言、agent 合同或保存语义。

## 验证

- `EditorShell.test.tsx` 122 项通过，新增 390px 外壳边界断言（left 60px、width 322px）。
- `pnpm --filter @mimir/office typecheck` 通过。
- 真实产品前后：390 面板由 x=27/宽 350 变为 x=65/宽 312；600×360 保存按钮由 y=347–371（视口外）变为 y=301–325（可见）。
- 全仓 `VITEST_MAX_WORKERS=1 pnpm check` 退出 0（Office 2778、Renderer 等全部通过），完整输出见 `full-check.txt`。

## 边界

- 未执行真实属性保存；截图用固定本地笔记。
- 其它编辑器只验证共享定位代码与单元回归，没有逐格式重截菜单。
