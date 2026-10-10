# 视觉基线与方向稿核对

## 基线

复用上一任务实际页面截图：`../../archive/2026-10/10-10-ui-ux-audit/audit/02-library.jpg`、`03-document.jpg`、`22-account-after.jpg`、`23-models-after.jpg`。现状是 200px 单侧栏 + 全白主区；知识库与设置在 1440×900 的上部形成小面积控件岛，文档顶部工具条密集且正文缺少工作区边界。用户在上一轮完成后仍明确认为整体布局和风格不好看，因此这次不能用组件边距修饰代替重构。

## 方向稿

范围扩展后的 `visual-full-surface.html` 补齐了入口、设置和浮层的整体构图，可用 `?view=login|signup|auth-error|account|appearance|stats|capture|search|confirm&theme=light|dark` 查看；`desktop=1` 才显示桌面标题栏和“更换使用方式”次入口。截图 `full-*.png` 共 10 张，已检查宽屏 1440、浮层 1100、窄屏 600；浏览器默认无装饰标题栏，所有截图没有横向溢出。登录由旧居中卡片改为安静的品牌面与聚焦表单，建号窄屏为单列；账号、外观和统计分别使用资料、主题选择、数据阅读的版式，收集、命令搜索、删除确认按任务使用不同浮层尺寸。统计数字与搜索结果是标注的示例内容，真实产品仍取服务端数据。方向稿深色主按钮白字 5.49:1、浅色 5.98:1，深色次文字/工作面 6.07:1。原型里的 `m` 图形仍是占位符，实现使用现有品牌标记。

补充方向稿 visual-expansion.html 可切换 chat-empty、chat-answer、models、models-empty、doc-guide、doc-edit 与浅深主题。六张浅色 PNG、doc-edit-dark.png、chat-answer-dark.png 和 600px 的 doc-edit-light-narrow.png 已渲染核对：会话历史先于知识库；回答的检索过程可折叠且引用跟随回答；模型配置态明确标注“示例配置”，空态突出添加供应商；文档助手完整保留快速上手指南；编辑态形成通栏工具区、下方格式画布、底部状态行，窄窗口保存动作保持可见。

补充核对 doc-guide-light-narrow.png 与 chat-answer-light-narrow.png：600px 时文档助手以可关闭的覆盖面板出现，指南和输入区可见；主对话输入区的范围、强度、模型入口及发送动作在同一视口内，没有横向溢出。

2026-10-10 查看 GenOffice 官网 https://genoffice.ai/ 的 Docs 产品图，确认其顶部文件/功能操作带、下方分组工具、灰色工作台里的白色文档页。本仓库只有编辑引擎 vendored，上游 Ribbon 与办公壳未引入；已有 EditorShell 的 toolbar、subbar、body、footer、status 槽位可以承接这种空间关系。方向稿的工具命令只示意已有能力的重新分组。

- `visual-direction.html`：静态布局稿，使用 `?view=library|document|settings&theme=light|dark` 切换；图标、内容和窗口控制是视觉示意，不是新增功能承诺。
- `library-light.png`：功能栏 + 库侧栏 + 文件工作台。主按钮和文件列表同轴，列表不包同质卡片。
- `document-light.png` / `document-dark.png`：正文与大纲分面，阅读区居中；浅深主题的区域关系相同。
- `settings-light.png`：设置分区独立占一栏，内容按表单行组织，不再把九个分区横排在窄内容列上。

## 检索与取舍

按用户指定的 `ui-ux-pro-max` 查询“personal knowledge library reading writing desktop productivity”设计系统。工具返回的是 Minimalism + 蓝橙 SaaS 落地页、Inter 字体，页面形态与产品不符，因此未采用。进一步的 style/ux 查询因 skill 包缺少 `data/styles.csv` 和 `data/ux-guidelines.csv` 而无法取得可验证结果；本稿采用用户给的 Obsidian 偏好、已有页面截图、项目功能契约及 skill 明示的对比度/响应式/焦点检查项。

## 方向稿待实施时复核

- 原型顶部三圆点只表示桌面客户端真实窗口控制的位置；网页不添加假的窗口控件。
- 首轮方向稿为体现结构省略了文档编辑工具条、保存/下载动作和部分设置分区内容；补充稿画出了编辑态、模型设置和阅读助手指南。实际实现仍须保留现有格式能力与各分区内容，不能把示意按钮当成新增功能。
- 文档阅读助手完整“快速上手指南”属于用户明确保留项；补充稿只调整版式，原文与四项说明不得删减。
- 方向稿的 `m` 方块是占位品牌记号，实际使用现有 mimir 标记并检查浅深色适配。
