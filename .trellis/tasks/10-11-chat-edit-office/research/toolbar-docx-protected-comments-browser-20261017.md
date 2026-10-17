# DOCX 仅批注 C1：浏览器验收

2026-10-17，root。实现及独立检查已冻结，最终5180构建完成下述浏览器验收。历史预验与发现保留。

测试账号admin@example.com，代码与浏览器验收；Desktop用户自验，无模型。

## 样本

已通过真实上传对话框上传5个合成 /tmp/mimir-docx-protected-{comments,readonly,modern,modify-password,empty}-20261017.docx 至「编辑器工具栏验收-20261016」。主comments ID `s2-xJkj0v9jwC19U`。原文件3018bytes/8个ZIP部件，富格式根0（粗体/345678/双空格/超链接/未知透明属性）+reply1+复杂域目标2，settings有已识别SHA512测试结构（不是密码核验测试）。修改密码变体单独writeProtection；现代扩展/无批注/只读分别保留明确拒写/空态。

固定参考与适用性沿docx-protection-p1-next-20261017.md，不开展新的竞品研究。

## 待验收

- 真实管理批注编辑/回复/解决/重开与结构撤销，正文始终不可编辑。
- 实际保存/重开及原生只改comments部件、settings/document/其他部件字节保持，no-op/Undo精确。
- 当前值/逐目标拒绝/空态、320px内部滚动/固定动作、1280/420×500/Escape回焦。
- 不支持新增/删除锚点/表单/密码/强制修订；整体保持in_progress。


## 开发预验（非最终构建）

localhost5173：1280/420×500 管理批注body内部滚动/footer可见；填入“富格式  中文 Link QA”点击修改后，真实导出document-copy (15).docx固定证据 `/tmp/mimir-docx-protected-comments-browser-edit-preflight-20261017.docx`，仅word/comments.xml变化，原run粗体/色彩/双空格/未知属性与hyperlink保留；document/settings/其他parts精确。一次“撤销上次结构操作”后保存恢复disabled，真实导出(16)固定证据 `/tmp/mimir-docx-protected-comments-browser-undo-preflight-20261017.docx` 与3018byte原件整文件精确。未保存到库。

发现编辑草稿后修改按钮仍与次要动作同为纯文字，已交独立checker作为本轮UI批次改单一primary；最终构建待复验。检查者另追manifest/未知writeProtection资格和切目标清回复草稿，不能把预验写成最终全绿。


## 最终构建验收

Web `/tmp/mimir-toolbar-c1-pivot-source-web-20261017.log` exit0，localhost5180。

- 正文实际点击/键入 BODY-MUST-NOT-CHANGE 后内容保持不变，保存禁用，主contenteditable=false。管理批注可用，其余写正文入口保持禁用。
- 富格式根讨论改为 `富格式  中文 Link QA`，新增回复 `浏览器回复 QA`，解决后真实保存到库；reload后根讨论为已解决、回复仍在，再重新打开并保存。
- 已保存原生证据 `/tmp/mimir-docx-protected-comments-browser-resolved-20261017.docx` 与 `...-reopened-20261017.docx` 均3178bytes。相对3018bytes原件只有 word/comments.xml、word/commentsExtended.xml 变化；document/settings/其余所有条目精确。讨论文字映射0=QA根、1=已有回复、2=复杂域、3=QA回复。解决done=1、重开done=0；两次保存之间仅ext变化，comments.xml精确。
- 复杂域讨论显示“这条原生讨论结构尚不支持安全修改，原件完整保留”，文字、回复、解决均禁用；删除有单独保护限制原因。
- 空讨论样本 UiZhKmU2ZpPo-Mzh 显示“当前没有可管理的已有讨论。受保护原件新增批注尚未支持。”，没有伪造新增动作。
- 现代扩展样本 Qr6pteZ2aTr3R3we 的管理面板可只读查看，明确已有讨论结构尚不支持安全修改，所有写操作禁用。modify-password样本同样显示旧式/未知/异常凭据只读原因，保存禁用。没有尝试解保护或验证密码。
- 1280与实际420×500同次窗口切换保留草稿；面板320px、内部滚动、唯一primary“保存批注修改”，窄屏按钮y383.72–407.72，page scrollWidth420。Select Escape先关闭选项，第二次关闭Inspector并回焦当前可见“修订与拼写”。
- 最终截图统一目录 `/Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51`：docx-protected-comments-confirmed-wide.jpg、docx-protected-comments-confirmed-420.jpg。

独立检查134/134与Office类型/目标静态通过，见docx-protected-comments-check报告。最新全Office1868pass/1fail：PPTX动画测试在第二次异步响应之前断言，仅该同步问题另行复核，不标全绿。

C1仅支持已证明结构的已有讨论编辑/回复/解决/重开。新增/删除锚点、表单checkbox、密码核验、强制修订继续未齐。无真实模型/Desktop验收，不删除测试件、不暂存提交归档，整体in_progress。


最终统一门禁补记（2026-10-17）：全Office **178文件1869/1869，exit0**，日志 `/tmp/mimir-office-full-c1-pivot-source-final-20261017.log`（143.52s）。先前1868/1869失败保留为历史；PPTX仅测试同步修复，生产未改。最终Web构建 `/tmp/mimir-toolbar-c1-pivot-source-web-20261017.log` exit0；此后只改PPTX测试/spec/报告，无需重建生产。Server沿前次最终default737/local10/fnos4/backup2全绿，本片生产未改，新增跨表宿主专项11/11。无模型/Desktop自验、全仓480技能lint基线与整体in_progress边界不变；本轮未暂存、提交、归档或删除测试文件。
