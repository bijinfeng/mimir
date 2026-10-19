# DOCX 实施结果

## 改动

- `DocxAdvancedControls.tsx`：为旧表单增加可选同级动作槽；Chart、Textbox、Page、Watermark、Note 的表单独立滚动，最终操作移至固定动作区，保留既有字段、参数、校验、确认及真实执行器。当前任务以单一 primary 强调。
- `DocxStyleControls.tsx`：紧凑固定样式选择、独立滚动定义、固定操作和有界结果反馈。保留原 state key 与打开时选区语义。既有样式未变时突出应用到选区，修改后突出更新定义；全部 Select 显式绑定同一 busy。
- `docx-tools.css`：DOCX 局部面板的 flex/min-height/scroll/footer 布局，沿用 `--me-*` 角色，无共享 Shell 和控件观感覆盖。
- `DocxEditor.tsx`：任意 advanced Inspector 入口先关闭其展开具名组，沿用 live trigger/折叠组/tab 回焦。Find 的查询 Escape、替换 Escape、关闭按钮、再次切换在卸载后回唯一原 PM；focusin 来源记录避免共享按钮预先 blur 外部原生 input 后误抢焦点。补齐停止生成副本的可见文字。
- `DocxPrivacyControls.tsx` 补齐重新读取设置可见文字；`DocxDesignControls.tsx` 明确应用设计为 primary，避免重复 label。

产品文件已冻结。父会话 QA 后仅收紧 Style 选择器重复分组标题；最后一次非功能变化是 closeFind 的局部变量改名为 focusSource，以消除 no-shadow。

## 回归测试

- `DocxEditor.views.test.tsx`：四种 Find 关闭回焦路径、外部 button/input 焦点不被抢占、窄栏插入组 → 图表 Inspector → Escape 回当前组。保留唯一 EditorContent、内容、版本、dirty、undo/redo；窄栏尺寸为几何 mock，只用于逻辑回归，不作为视觉证明。
- `DocxAdvancedControls.test.tsx`：真实样式创建/应用/更新过程的 primary 转换；用可控 promise 等待真实执行器，验证全部 Select 忙态锁定和解锁；文本框数字草稿在 mousedown → click 分开的第一击提交正确数值且执行一次，并保存独立重开。
- `DocxDesignControls.test.tsx` 更新应用设计的可见文案断言。
- `DocxEditor.privacy.test.tsx`、`DocxEditor.encryption.test.tsx`：恢复/停止按钮必须有可见文字，沿原真实生命周期断言。

## 已运行

1. 六组定向 Vitest：`DocxEditor.views`、`DocxAdvancedControls`、`DocxDesignControls`、`DocxEditor.privacy`、`DocxEditor.ink`、`DocxEditor.encryption`，共 **74/74 通过**。
2. `pnpm --filter @mimir/office typecheck` 通过。
3. 作用域 `oxlint`：六产品文件及五测试文件中的 TS/TSX，共十文件，零输出通过。
4. 作用域 `oxfmt --check`：六产品文件及五测试文件，共十一文件通过。
5. `pnpm lint:styles`、`git diff --check` 通过。

## 边界与交接

未修改 vendor、引擎、共享 Shell、保存/保护/加密/Agent 协议或依赖。没有提交或暂存其他会话文件。

实际浏览器验收、真实同尺寸/主题 before-after HTML 图像存档、独立 check 与最终全仓 `pnpm check` 由父会话负责。本结果不把逻辑挂载测试表述为浏览器验收，也不宣称完整 DOCX 所有安全/导入原件端到端通过。
