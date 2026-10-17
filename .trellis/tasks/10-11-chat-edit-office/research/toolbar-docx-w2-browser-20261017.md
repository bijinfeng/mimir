# DOCX W2 保护设置生产浏览器验收

2026-10-17 root，localhost5180 lifecycle生产构建；代码+浏览器，无Desktop/model。测试件保留。

## 无密码限制设置

文档d_YM_rX8-cbfA238，fixture no-password-readonly.docx。打开readonly正文不可写，保存/Undo disabled；审阅→文档保护→更改保护设置，四模式真实可选。选择comments→应用产生一次dirty/history；save回读/tmp/mimir-docx-w2-browser-comments-20261017.docx，仅word/settings.xml变，w:edit readOnly→comments；opaque/zoom/comments及非目标所有条目精确。

保存后Undo/save整件cmp原始3748B逐字节相等；Redo/save所有非目录ZIP条目与第一次save精确；reload显示仅批注/正文只读。

420×500 Inspector宽320、应用bbox x113/y415.72/w101.69/h24，footer可达；但原有两项“保留当前密码”无可见字段标题，无法区分限制密码和修改密码。截图docx-protection-settings-labels-before-420.png；已交正式T implementer顺带最小可见标签修正，需下次构建复验。不把该界面标已通过。

## 双密码限制原件

文档2ZS9BxWsf3IWErOD，fixture password-readonly.docx。现有修改密码editor验证仅解当前会话，仍readonly零dirty；更改保护模式还需独立原件restriction密码。输入editor作为限制密码明确报错、保存仍disabled；输入restriction后comments成功、密码输入清空、再次要求修改密码会话验证。

save回读/tmp/mimir-docx-w2-browser-password-comments-20261017.docx，所有非settings条目精确，两组原hash/salt/spin原样保留。额外发现未改变只读建议时仍在writeProtection添加recommended=0，不符合最小untouched字段原则，已批准T owner在docx-protection-settings.ts做布尔意图无变化时保留原始attr spelling/absence修正，并补native回归。新密码创建/修改没有通过浏览器自动输入，按工具规则需用户接手，代码/native测试仍按独立W2报告。

## W1 高迭代取消复验

文档tnHOqm9nFJKTbJ0w，既有1000000spin样本。第一次间隔tool回合已完成验证，未误称取消通过。reload后同一次调用真实click验证→click取消，返回readonly、保存/Undo disabled、密码清空、焦点INPUT且DOM“修改密码 [active]”。截图docx-password-cancel-final-420.png。此为此前BODY焦点缺陷的新生产复验通过；无权限/原件/history副作用。

W2原生模式/保存history及W1取消通过；W2标签及recommended最小补丁待独立check/新build浏览器。强制修订T、整文件加密E、隐私P仍另片，不宣称工具齐全。

## 最新构建标签复验

root在 `/tmp/mimir-toolbar-inspector-encryption-web-20261017.log` 对应5180新构建打开d_YM_rX8-cbfA238（持久化仅批注），审阅→保护→文档保护→更改保护设置。两处选择框可见且可访问标签分别为“编辑限制密码操作”“修改密码操作”，不再只有难以区分的相同值。1280完整面板与420内部滚动/固定footer实查；420面板x100/y145/w320/h304.72，body211/551，可Tab到下方字段而主动作可达，page scrollWidth420。Escape关闭回焦保护入口；全程保存/Undo禁用，无新增密码输入或保护更改。

截图 `docx-protection-settings-labels-final-{1280,420}-20261017.png` 在本会话绝对visualizations目录，使用指定区域原始截图避免IAB缩略缩放。recommended原生最小补丁已由T专项独立检查覆盖；此只读复验不冒称再次执行双密码写入。标签界面待验已结清，整体加密E另片仍开放。
