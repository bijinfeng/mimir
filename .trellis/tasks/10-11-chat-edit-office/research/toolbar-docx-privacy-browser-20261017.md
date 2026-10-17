# DOCX 个人信息设置生产浏览器验收

文档 `oTEQUcPq6FiE0jGd`，夹具 `/tmp/mimir-docx-privacy-20261017.docx`。原件removePersonalInfo=true但含未清理署名，正文Alice、批注正文Bob、页眉、修订日期、未知namespace属性与自定义属性用于保真验证。

## 实际流程

1. 初始面板当前/已保存均开启，应用禁用。导出当前副本后库原件逐整件等于baseline，无history/dirty。
2. 关闭Switch未应用时保存仍禁用；应用后dirty。首次以false保存仅settings变化，原始署名保留，证明导出没有ACK库清理floor。
3. Undo恢复true并保存，6个已知metadata部件清理：document/comments/header、properties/core-custom/app-custom/people-custom。作者变Author、initials A、creator/lastModifiedBy及Manager/Company清空、已知person删除；正文/日期/id/未知属性与其余ZIP条目精确保留。
4. Redo恢复false并保存，相对true-clean文件仅settings变化，旧署名没有恢复。重新读取准确提示当前会话已保存清理及不可恢复。
5. 1280与420实查；420面板w320/y145/h328.36，body client224/scroll339，primary y431.36/h24，scrollWidth420。切on但不应用，Escape关闭、保存禁用且焦点回BUTTON。
6. reload再打开个人信息，当前/已保存均明确关闭、应用与保存禁用。未应用草稿未被持久化。

## 原生证据与出口边界

`/tmp/mimir-docx-privacy-browser-{baseline,after-export-library,false-first,true-saved,false-after-cleanup}-20261017.docx`。baseline与after-export-library整件4381B/SHA256 `ba2092ffac26322f02b573f170c51d45449fed7d65299bd4b4dbb26096fb126d`。false-first只改settings；true-saved清理上述6部件加settings；false-after-cleanup相对true只改settings，其他条目exact。夹具现在保持false且已清理，未试图恢复旧署名，未删除。

导出下载`/Users/admin/Downloads/document-copy (19).docx`最初检查清理正确；后来同一文件出现CWM自定义属性及XML封装重排，仓库无该来源，不能归因产品或将其最终字节称为出口逐条目精确证据。库保存工件具有明确原生保真证明；出口需要在后续新构建使用即时固定副本复核。

### 最终即时固定导出：已通过

root使用 `/tmp/mimir-toolbar-inspector-encryption-web-20261017.log` 对应5180新构建，把同一原始合成夹具复制为 `/tmp/mimir-docx-privacy-export-final-20261017.docx` 并正常chooser上传至原验收文件夹（新文档 `-aaXvL8HmIPv1bG4`，原件4381B/SHA256 ba2092ff…126d）。不编辑，视图→导出当前DOCX副本，下载 `document-copy (21).docx` 后立即固定 `/tmp/mimir-docx-privacy-export-final-fixed-20261017.docx`，4445B/SHA256 `5aff11383c536fcdbb2286fe0e894731971cc8cf0e9f91d51214f03d973d0d79`。

逐条目精确断言：恰6个已知metadata部件只做预期作者/initials/creator/lastModifiedBy/Manager/Company/person最小替换；正文Alice/Bob、日期、id、未知namespace属性、XML其他字符与所有非目标ZIP部件均精确保留，未出现CWM或额外非目录部件。随后真实点击下载原件并即时固定 `/tmp/mimir-docx-privacy-export-final-library-20261017.docx`，SHA256仍逐整件等于原始ba2092ff…126d；保存、Undo、Redo持续禁用。因此导出没有ACK库清理floor或修改原件/history。截图 `docx-privacy-export-final-1280-20261017.png` 在本会话绝对visualizations目录。新样本保留，未删除。

旧下载文件后来的外部变化仍不归因产品；出口缺证已经由这份即时固定工件结清。

截图：

- `/Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51/docx-privacy-saved-floor-1280.png`
- `/Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51/docx-privacy-saved-floor-420.png`

## 环境与证明范围

2026-10-17 root，统一账号 admin@example.com。浏览器为生产预览5180，1280×800及420×500；本轮沿用包含T/P/S的已服务构建，尚未包含后续E1U、管理短高、PDF取消修复及排序按钮去重的新构建，不将其混称最新源验收。无真实模型执行、无Desktop验收、未删除夹具。依据固定GenOffice 480548fd55f1be3593ee0d8e316a734751d58309；WeKnora沿已有v0.8.3 / 3e22822c1d2397be730c458c7539d0eb8c113a24缓存证据，适用于知识库/Agent门控，非Office工具栏语义依据；本次不是新增竞品调研。
