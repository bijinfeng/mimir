# XLSX 原生形状生产浏览器验收

2026-10-17 root，localhost5180最新lifecycle生产构建，测试账号admin@example.com。文档PK4FilufzKIRoO1G，原件/tmp/mimir-xlsx-imported-shapes-20261017.xlsx。无模型/Desktop验收；测试件保留。

- 1280×800实际显示37°翻转圆角渐变、粗斜下划线混合行/两段、分离虚线轮廓，自定义三角+中线、透明ellipse。另75%滚动真实冻结首行/列，未知几何显示形状预览有限/保留原件，90°调整三角有真实native框，未用矩形代替。截图xlsx-preview-scroll-75.png。
- 选中渐变圆角，管理→填充蓝色→应用→保存。只读鉴权原件fetch至/tmp/mimir-xlsx-preview-browser-saved-20261017.xlsx（6310B）；ZIP仅drawing-preview.xml和既有gateway calcPr的workbook.xml变化。原生gradFill被明确solidFill4472C4替换，原transform/adjustment/轮廓/富文本及后续anchor保留，所有其他条目精确。
- Undo/save到/tmp/mimir-xlsx-preview-browser-undo-20261017.xlsx，所有原始非目录ZIP条目逐字节相同；Redo/save到redo文件，所有非目录ZIP条目与首次save逐字节相同。未声称压缩后的整件ZIP字节相等。
- 实测形状管理界面仍有明确短窗口问题，截图xlsx-manage-before-420.png：heading随body滚动、primary不固定、选中形状仍混空结构化表、渐变误选白色。已单独批准formal implement补片，见xlsx-manage-inspector-followup-20261017.md。不因V原生/预览通过而把管理交互也记通过。
- V checker文案补片已target9/9/types/static通过，尚待root下一构建；不混记本次浏览器已展示新copy。

V原生预览及保存/history已验；管理界面补片、后续R1/S/R2仍未完成，整体保持in_progress。
