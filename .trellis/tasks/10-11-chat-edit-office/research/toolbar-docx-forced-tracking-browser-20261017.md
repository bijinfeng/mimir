# DOCX 强制修订生产浏览器验收

文档 `xRKP9sTzE_-JenoQ`，夹具 `/tmp/mimir-docx-forced-tracking-20261017.docx`。

## 实际操作与原生结果

- 选首段五字符Alpha后输入Gamma。画布显示新增Gamma与删除Alpha；DOM分别为doc-ins/doc-del，不是错误重复插入。保存产生原生w:ins Gamma及w:del Alpha。
- 应用只改word/document.xml；已有第二段修订、第三段未知扩展与settings精确保留。
- Undo+保存所有ZIP条目等于baseline；Redo+保存所有ZIP条目等于applied（ZIP容器时间/压缩封装不要求逐整件相等）。
- 通过普通Unicode键盘输入“验收中文”，保存为原生ins；两次Undo+保存最终整文件恢复3178B baseline，SHA256 `7fc3ed934051eccf81f76c0aea253d5e5e7f38978a1ed044a20334a66b9c9b46`。
- 审阅→文档保护准确显示“强制修订·段内文字可编辑”、修改密码未设置、只读建议无及段落/格式/接受拒绝限制。420面板x100/y145/w320/h328.36，scrollWidth420。Escape关闭并回折叠保护按钮。

原生文件：`/tmp/mimir-docx-tracking-browser-{baseline,applied,undo,redo,chinese,restored}-20261017.docx`。

## 限制

IAB不支持Input.imeSetComposition，该调用在变更前报不支持。因此仅普通中文键盘输入有浏览器证据，不宣称真实输入法composition通过。E1U后最新构建仍需烟测，不重新扩大有界正文编辑资格。

E1U/R2b正式新构建 `/tmp/mimir-toolbar-r2b-cfb-web-20261017.log` 后root已补只读烟测：原件恢复Alpha、已有修订和未知扩展段都准确载入；审阅→文档保护显示“强制修订·段内文字可编辑”及结构/格式/接受拒绝限制。1280→420面板可达，Escape回焦折叠保护入口，保存/Undo/Redo始终禁用，无新修改。最终截图 `docx-forced-tracking-final-420-20261017.png`；这项新构建烟测已结清，不重复宣称IME通过。

截图：

- `/Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51/docx-forced-tracking-browser-1280.png`
- `/Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51/docx-forced-tracking-protection-420.png`

## 环境与证明范围

2026-10-17 root，统一账号 admin@example.com。浏览器为生产预览5180，1280×800及420×500；本轮沿用包含T/P/S的已服务构建，尚未包含后续E1U、管理短高、PDF取消修复及排序按钮去重的新构建，不将其混称最新源验收。无真实模型执行、无Desktop验收、未删除夹具。依据固定GenOffice 480548fd55f1be3593ee0d8e316a734751d58309；WeKnora沿已有v0.8.3 / 3e22822c1d2397be730c458c7539d0eb8c113a24缓存证据，适用于知识库/Agent门控，非Office工具栏语义依据；本次不是新增竞品调研。
