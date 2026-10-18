# 技术方案

## 共享主题边界

以tokens.ts的COMPONENT_TOKEN为单一入口，为Input、InputNumber、Select配置独立字段颜色及阴影。颜色矩阵以 `research/form-controls-study.md` §5为准。全局colorBorder、主按钮色、focusRing和lineWidthFocus不整体改浅/归零；默认32px/大号40px与6px圆角保持。必要时提取同文件内的共享字段角色，避免三种字段复制漂移。

Input覆盖同时作用于Password、Search、TextArea与affix wrapper，核查前后缀、清除和Search组合。InputNumber共享边框/activeShadow策略。Select使用当前6.6.6外层结构与组件级controlOutlineWidth=0处理普通及语义状态外圈；Cascader继承Select的字段结构，实际验证后才决定是否有必要增加适配。不得向Cascader塞未支持token。

## 状态与键盘

Outlined字段以1px聚焦边界本身表达focus，不叠粗外圈；浅绿#00a35f白底3.28:1，深绿#50c28f在输入底7.18:1。保留Input/Select无边框变体的原有focus-visible机制，以及密码眼睛/自定义按钮独立focusRing。状态覆盖优先：disabled、error/warning、normal。错误/警告保持语义色与文案，去掉输入外扩阴影后仍有明确细边状态。不能用全局outline:none或宽泛.ant-*覆盖。

## 契约与质量守卫

默认字段边界采用轻灰，明确从旧的“全部字段边界≥3:1”改为分角色约束：轻字段默认边界、≥3:1聚焦边界、≥3:1复选/单选关键边界。此取舍需用户批准，不宣称默认字段AA。修改design.test.ts时保留文字和关键边界的门槛，新增/调整真实provider覆盖检查，防止组件token未生效而只测全局绿色。不得删测试或通过排除产品代码使检查变绿。

同步`.trellis/spec/project/design.md`、renderer主题规范、`apps/web/DESIGN.md`及其已有sidecar（如该格式需要）。只更新本次改变的规则，不覆盖并行Office文档。

## 兼容与回退

只有视觉与测试契约变化，不改数据、接口、持久化或交互语义。Chat/Office沿用单一宿主主题和现有桥；全局关键边界保持，降低传播风险。若某无边框/组合字段回归，修正具体继承范围，不关闭其键盘焦点。可按本任务精准diff回退，不能重置共享工作树。
