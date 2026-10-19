# 技术设计与变更边界

基线46a2120，已有树干净。产品真相为office MarkdownEditor及renderer方言与主题，沿用现有布局和共享壳。

## 已有差距
选区BubbleMenu容器mimir-inline-bar没有任何CSS；slash用固定320估高，短窗口可能得到负top；[[候选只在query变化时定位。属性YAML与链接/插表面板缺可见字段标签。需要以真实组件、视口几何和键盘路径复核后精修。

## 责任边界
- packages/office/src/editors/MarkdownEditor.tsx与独立Markdown子组件：仅菜单定位、面板标记/可见标签和反馈布局；保存/Agent核心不改。
- packages/office/src/editors/InlineToolbar.tsx、NoteLinkPicker.tsx、MarkdownWritingPreview.tsx及editors.css：局部容器、长内容、状态语义与可访问性；BubbleMenu继续用官方实现。
- 共享shell优先不改；必要变化只能note variant作用域，不改变其他格式布局。renderer仅相关回归/规范；主文档阅读外观保持。

## 验证与存档
冻结基线源码到临时目录；gallery以相同入口运行基线与当前源码，固定fixture和模拟IO。浏览器通过实际UI操作捕捉普通/异常/等待/恢复；不在page.evaluate中修改应用状态。交互HTML绑定真实组件，前后HTML保存原图、尺寸、来源hash。

## 不做
不调整认证/模型配置/持久化/解析DSL；不修改vendor；不接真实付费模型；不把HTML模拟宣称原生或写盘验收。

## 全仓质量门的测试稳定性边界

沿用户既有“工程检查问题一并处理、完成全仓检查”授权，仅调整真实宿主/worker 冷启动用例的局部有界等待预算：PDF 原生替换保留真实完成与保存/重开断言；聊天附件非法输入矩阵保留实际 HTTP 返回、失败状态与清理。默认/全局等待和全部生产解析限制保持，禁止固定 sleep、跳过或弱化断言。服务端集成测试共用 data/.test，必须等现有完整运行结束后串行验证，不能并发另开一个会清空测试库的进程。
