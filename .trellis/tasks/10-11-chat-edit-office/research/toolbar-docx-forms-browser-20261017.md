# DOCX forms-only：生产浏览器验收

2026-10-17，root，localhost:5180。最新构建 `/tmp/mimir-toolbar-ocr-forms-crop-web-20261017.log` exit0。文档 `rDr2OnMZsij2Ton3`，7107-byte原件 `/tmp/mimir-docx-protected-forms-20261017.docx`。

- 原件5控件：两相邻同名legacy、SDT、禁用legacy、锁定SDT；普通文字方框保持只读。选择器按实际顺序区分重复名称。
- 420×500保护Inspector320px，primary x113 y415.719 w101.688 h24，bottom439.719，面板bottom449.719。body内部滚动，按钮始终可见。截图 `docx-forms-final-420.jpg` 为最新生产构建实际420×500最终状态，已实际查看。
- 实际Space勾选第1和第3控件，保存；保存后Undo第3并保存，再Redo并保存。原生独立脚本三次均PASS：仅 `word/document.xml` 目标checked/glyph变化，settings与非目标ZIP、禁用/锁定/普通方框精确。
- 原件 `/tmp/mimir-docx-forms-browser-original-20261017.docx`；应用/undo/redo分别 `/tmp/mimir-docx-forms-browser-{applied,undo,redo}-20261017.docx`。应用状态[true,false,true,false,false]，Undo[true,false,false,false,false]，Redo回应用；Redo所有ZIP entry payload与应用精确相同（容器时间戳可不同）。检查器 `/tmp/mimir-docx-protected-forms-inspect-20261017.py`。
- 最新1280×800，Escape回live“文档保护”，真实DOM contenteditable=false。纸面点击第二相邻glyph只改变第2，Undo回保存态；点击禁用glyph提示具体原因。原生键盘x没有输入正文或dirty；Playwright对只读textbox.press会拒绝，之后用真实键盘输入验证，未把驱动拒绝当产品失败。
- `docx-forms-saved-1280.jpg` 记录最终保存状态与只读内容。实际离开至PDF/裁剪文档后重新打开forms，纸面第1/3为☒、第2/4/5为☐，保存/Undo/Redo均disabled，保护面板仍显示正文只读；密码与forced tracked changes仍另片，不声称全部保护完备。

统一账号，无Desktop/模型调用。独立7files166/166见 `docx-protected-forms-independent-check-20261017.md`。全Office首轮失败与root补mock、旧copy断言记录在implement，最终全套仍待统一重跑。
