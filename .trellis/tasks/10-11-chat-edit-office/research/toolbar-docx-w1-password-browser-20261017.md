# DOCX 修改密码 W1：生产浏览器验收

2026-10-17 root，localhost:5180统一Web build exit0后的生产资源。账号admin@example.com；真实文档5Bcq9mDvq-zKrRgP。Desktop用户自验，无模型调用。

## 样本纠正

旧`/tmp/mimir-docx-w1-password.docx`实际无settings，不能作为密码验收证据，已上传旧件未删除。独立checker新建`/tmp/mimir-docx-w1-password-checked-20261017.docx`，3822B，SHA256 28165daee28e988d4b36fea31c0f306c52c5a57ccf21a0e7c41edf571a121417，真实settings关系/CT/writeProtection SID14 spin0，既有样本密码editor。实际UI上传新件，再只读下载SHA与本地文件精确一致。

## 已完成真实动作

1. 打开显示只读、等待修改密码验证、原件建议只读；编辑与保存/历史未启用。
2. 输入既有测试错密wrong，Enter触发真实module worker，busy/取消按钮可见；最终“密码不正确，请重试”，仍只读、零dirty/history。
3. 输入既有测试正确密码editor，Enter后当前状态“可以编辑/本次会话已验证”，输入框消失；解锁本身保存/撤销仍disabled、原件字节未改变。
4. 真实正文尾段插入` W1验收`，保存后尾段`尾段 W1验收。`；只读下载原生仅word/document.xml改变，word/settings.xml与全部非目标entry精确一致。
5. 保存→PM Undo→保存，全部ZIP entry与原件精确一致；Redo→保存，全部ZIP entry与首次编辑保存精确一致。
6. 浏览器重开后正文改动保留，但editorEdit重新disabled，保护面板“已设置，等待验证”，密码输入空，临时验证未持久化。
7. 420×500面板宽320，页面scrollWidth420；错误红框/文案可在内部滚动区看到，底部验证主动作固定可达；1280与420截图已存并实际查看。Escape关闭并activeElement为真实`BUTTON aria-label=文档保护`。

## 原生证据

`/tmp/mimir-w1-browser-before-20261017.docx`，`...-saved-...`，`...-undo-...`，`...-redo-...`。before=checked原件SHA；settings各次精确，Undo与原件所有entry精确，Redo与saved所有entry精确。下载是本地read-only fetch脚本证据，不冒称browser download。

截图：本会话visualizations目录的`docx-w1-password-error-visible-production-420.jpg`（主错误态，实看）、`docx-w1-password-error-production-420.jpg`（滚动前状态）、`docx-w1-password-relocked-production-1280.jpg`。

## 尚待

spin0验证太快，root尝试点击取消时已完成且按钮消失；该工具超时不构成产品bug，也不算实际取消通过。已请求独立checker补max合法spin的新独立夹具，再做真实取消/迟到验收。combined限制/源切换/worker终止的代码与原生回归已在W1独立149/149，不把它们冒称本次浏览器逐项执行。W2/T/E/P仍分别排队或实施中；本报告不称整体DOCX保护齐全。

## 高迭代取消追加

独立checker新夹具`/tmp/mimir-docx-w1-cancel-1000000-20261017.docx`（8044B，SID14/spin1000000，既有测试密码editor），实际UI上传doc tnHOqm9nFJKTbJ0w。SHA256 58a317498e24f31b01a506eac508451759adc109bd32ea1003c9905852f1b54e，生产parser/ZIP关系CT独立验证通过。

第一次root截图busy后下一工具调用点击取消时计算已经完成，正确状态“本次会话已验证”；按钮消失不是产品bug，该尝试不算取消。重新加载新会话，再同一次动作批次Enter→点击真实“取消验证”，实际成功取消：输入清空、重新验证主动作disabled、仍只读、无history/dirty。跨原计算耗时后无迟到解锁；只读下载`/tmp/mimir-w1-browser-cancel-20261017.docx`与新fixture整个文件SHA精确相同。

420×500实际busy与cancel截图分别`docx-w1-password-cancel-busy-production-420.jpg`和`docx-w1-password-cancelled-production-420.jpg`。显式取消后焦点落BODY，已交正在改同Controls的W2 owner补回当前修改密码输入并测外部不抢焦点；本条界面细节需最新构建重验，不能记完全通过。
