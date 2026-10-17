# DOCX comments-only 原生锚点：浏览器与文件证据

2026-10-17，root；本报告保留开发预验收记录，下方补最新生产构建烟测。统一账号 admin@example.com；Desktop 由用户自行验收，无真实模型调用。

## 实际操作

验收目录「编辑器工具栏验收-20261016」（KY635Y）。上传 rich `aIPAxhlK7cBFWIOY` 与 empty `R0Q5KcthyWEKdzUz`；文件均保留，没有删除。

- rich 第一段选中“可以”，新增“浏览器新增锚点 QA”（ID3），保存。`/tmp/mimir-docx-protected-anchors-browser-added-20261017.docx` 4459B，仅 document/comments/commentsExtended 改变；正文、settings、未知属性和非目标部件保留。
- 稳定构建再选“格式”，新增“稳定构建连续保存 QA”（ID4），保存至 `/tmp/mimir-docx-protected-anchors-browser-two-added-20261017.docx` 4532B。
- 删除 root0 连同 reply1，界面显示已删除2条；未保存时撤销结构操作。真实下载 `/Users/admin/Downloads/document-copy (17).docx` 与上述双新增基线的全部非目录 ZIP entry 精确一致。压缩包整体字节因 ZIP 元信息不同，不声称整体相同。
- 单删 reply1 后保存：`/tmp/mimir-docx-protected-anchors-browser-delete-reply-20261017.docx` 4488B，仅 comments/commentsExtended 改变，document 精确不变。
- 再删 root0 后保存：`/tmp/mimir-docx-protected-anchors-browser-delete-root-20261017.docx` 4412B，document 仅去掉 ID0 的三个锚点元素，正文/其它部件保留。
- hyperlink 复杂 root2 删除禁用，并显示“该原生批注锚点尚不支持安全修改；请选择普通单段文字”。
- empty 第四段选“格式”再 Shift+End 跨 bold/italic run 选中“格式 中文🙂 尾部”，首次新增“首次跨run中文🙂批注”；未保存时撤销。真实下载 `/Users/admin/Downloads/document-copy (18).docx` 与空批注原件整个文件字节相同，SHA256 `051e4daca09f0e1a0016a03824ca7ed20865a109696be08843dda1ba3904efe8`。
- 再次相同选区新增并保存：`/tmp/mimir-docx-protected-anchors-browser-first-20261017.docx` 3960B，ID1，仅 document、新 comments、关系与 ContentTypes 必要部分改变；原格式/emoji/settings/未知属性保留。

原生比对脚本 `/tmp/mimir-docx-protected-anchors-inspect-20261017.py` 支持 add/delete0/delete1/noop。独立代码检查见 `docx-protected-anchors-independent-check-20261017.md`。

## 交互及视觉

420×500 实际视口，页面 scrollWidth420；新增 Inspector x100、宽320、y145、bottom449.72，固定主动作 y415.72–439.72，内部滚动。截图 `docx-protected-anchors-420.jpg` 位于本任务 visualization 目录。下拉 Escape 先关下拉，再 Escape 关 Inspector，焦点回到“管理批注”。独立检查补正删除回复确认文案与结构撤销提示；最新生产构建已实际新增临时回复并打开删除确认，明确“删除这条回复？”、“删除回复”及“保存前可通过撤销结构操作恢复”。取消删除，再撤销上次结构操作回到原保存状态，未写库；截图 `docx-comments-reply-confirm-1280.jpg`。

## 边界与时点

验收初期跨模块热更新曾出现保存后版本显示重置；模块冻结后连续新增、保存、再管理、删除可正常完成，组件真实 io.save 父级重渲染测试确认句柄稳定。该过程不能作为已确认的保存缺陷。后续原件/history 验收使用配置冻结的生产预览。

DOCX 手动结构轮次在保存后按既有合同清除。本报告只证明未保存结构撤销，不声称保存后可撤销/重做批注结构。正文继续只读，C2 只允许已证明身份的普通单段批注 mark 差量；复杂容器保守拒绝。当前切片通过不表示所有编辑工具已经补齐。
