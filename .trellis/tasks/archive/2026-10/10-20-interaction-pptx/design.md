# 最小变更设计

## 证据与归属

冻结3b5d912真实PptxEditor在390×400下，公式Inspector下沿373.36，而插入按钮510.78–534.78；图示按钮658.86–682.86。整块body虽可滚动，操作随表单离屏。现有图表、段落、主题、图片等专用布局成熟，保持原样。

旧控件缺失显式Select busy，原生fieldset不锁Antd复合触发器；候选来源见research/select-busy-audit.json，逐项审阅而非全量机械禁用。只读视图缩放、取消入口维持可用。

## 方案和边界

PptxControlPanel增加可选actions槽，仅公式、图示、导入三个长Inspector opt-in，表单body内部滚动、操作与忙态位于固定footer。页尺寸/链接/艺术字/动态字段等短菜单结构保持，不给所有legacy模式强加footer。对应data-panel CSS限定三种模式，不覆盖成熟布局。

审阅候选旧控件所属busy/locked并显式传Select；ChartEditControls把busy传PptxChartAppearance的可选disabled。保留已有额外禁用原因。无其他协议或运行层变动。

产品改动限PptxControlPanel、PptxInsertControls、PptxAssetControls、pptx-tools.css及实际缺失busy的PPTX控制组件和必要回归。没有vendor/引擎/server写入合同变化。不改文字范围、持久选择、XML/关系/保存/Agent/历史与dirty语义。

## 验证

相同原件/主题/尺寸冻结before与最终after真实构建，桌面1100/690、390×400与浅深，长表单滚动、动作可见、忙态和键盘焦点；既有成熟面板代表路径另验。隔离helper调用实际PPTX宿主，仅固定原件/内存保存，明确区分原生字节修改和产品持久化。所有入口来源索引完整，source-only不能计作GUI通过。定向行为回归、独立检查、完整pnpm check后限定提交和归档。
