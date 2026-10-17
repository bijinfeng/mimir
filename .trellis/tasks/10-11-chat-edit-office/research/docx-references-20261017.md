# DOCX 引用工具 · 2026-10-17

## 实施前范围与证据

固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`（本次git rev-parse已核）：`apps/docs/src/renderer/components/ribbon-references-tab.tsx` 提供目录插入/按当前标题更新、SEQ题注、来源创建、citation/bibliography、XE标记/INDEX；源码citation/bibliography本身为普通缓存文字。`App.tsx:2200`字段通过instrField原生mark，插入DATE/TIME/PAGE/NUMPAGES/FILENAME；ai/field-ops另给原生字段/更新规则，本片不拓宽Agent白名单。vendor现有generateCaptionXml/generateIndexFieldXml/generateTocFieldXml、docXeMark、instrField、SourceInfo与原生sources customXml写入，直接复用。

WeKnora站点本次HTTP200，快照`/tmp/mimir-references-weknora-site.html`；固定v0.8.3 commit `3e22822c1d2397be730c458c7539d0eb8c113a24`工具定义按同版本重新核对HTTP200，快照`/tmp/mimir-references-weknora-tools.go`。知识检索/沙箱工具门控不含Word字段/引用UI，不作为本片Ribbon主模型。

缺口位于DocxEditor没有引用分类，已有目录仅插入，其他入口/事务缺失。预计修改DocxEditor.tsx与新ReferencesControls/helper/CSS/tests；新私有reference-save适配和docx.ts最小接缝由root明确授权，sources通过PM doc私有attr与字段在同一transaction进入history/dirty/version，save读取此attr并沿native source保存。修改现有来源时须保留未编辑的原XML字段；不写vendor、shared/schema、其他编辑器或全局CSS，不接原生Electron Zotero桥，不构建/提交/归档。

采用现有320px Inspector、内容滚动/固定主动作、当前来源/冻结实际选区和doc身份、过期拒绝、Escape由既有Inspector回焦。目录更新仅替换可靠识别的原生字段区域，不删旁边正文；原生页码缓存明确交Word重算。一般字段显示真实提供/可计算的缓存，dirty要求Word更新，不能将字段缓存宣称为已重算。

## 实施与代码验收

- 新“引用”页五个具名入口：目录与更新、题注、引文与来源、索引、原生域。Inspector八模式可切换管理来源与参考文献；所有动作明确应用，内容滚动/独立固定footer，来源当前值可读、可新建/编辑。已有“插入→目录”保持原入口。
- 目录按当前标题生成原生TOC，安全更新完整保护字段，保留分页符；支持域内超链接，拒绝域外正文/tab、书签/批注/对象和残缺字段。SEQ题注支持图/表/公式，重开后识别中文标签。NodeSelection题注准确紧跟选中图片。
- 来源以运行时PM根属性进入原生history/dirty/version；来源+新CITATION仅一个docChanged事务。原生sources部件通过私有save适配写入，不改vendor；修改标题/年份保留其他来源XML、root属性、DOI/Volume/多作者。兼容导入的未列举SourceType与安全标点tag，CITATION tag必要时引用。已有标签只读防止断开引文关联。
- 参考文献为原生BIBLIOGRAPHY及缓存文字；索引为XE/INDEX；通用字段使用instrField及dirty。DATE/TIME提供当前本地缓存，其余由用户明确填写缓存，Word负责实际更新；外部内容/宏/addin域不从该入口插入。未提供Zotero原生桥或APA等样式重算，不冒充浏览器已计算页码。
- 两个新增测试文件12/12（helper9+真实Editor组件3），连既有图片/表格/打开保存目标合计6文件31/31。覆盖全部原生字段、两次保存、逐ZIP entry undo/save/redo/save恢复、未知源字段保真、最后输入首击应用、真实Ribbon五入口、当前值/取消/Escape实际回焦、手动变化所有Select禁用、切文档关闭旧面板。日志`/tmp/mimir-docx-references-test.log`。
- 目标oxlint无警告、oxfmt、Antd lint、styles与diff通过，日志`/tmp/mimir-docx-references-{lint,format,antd,styles}.log`。Office tsc最终结果另随根会话收口；并行worker的暂态错误不当作本片通过。全仓check先前已实际因480项bundled技能脚本lint失败，本片不冒报全仓green。

## 浏览器交接

根会话唯一构建与真实视觉验收。本片不构建/提交/暂存/归档。使用`/tmp/mimir-docx-references-native-fixture.docx`（4928 bytes，基于本地kitchen-sink生成，不修改vendor）：首段为带超链接和页分隔的真实TOC缓存，其后既有CITATION Legacy2024与SEQ图1；customXml包含双作者/DOI/Volume/root sentinel。新题注“图”预览应为2；编辑Legacy2024标题不应丢其他原始来源内容。应验宽/420布局、内部滚动/固定footer、Escape实际入口，以及HTTP保存/undo/redo原件。真实模型无配置未验，Desktop用户自行验收。
