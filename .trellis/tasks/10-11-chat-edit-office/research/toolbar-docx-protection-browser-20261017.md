# DOCX 原件保护 P0：浏览器验收

2026-10-17，root。先在 localhost5173 预验，再以 localhost5180 生产构建完成宽/420检查；P0 本片代码、独立检查与浏览器收口，整体仍 in_progress。

## 范围与环境

- 用户确认仅代码与浏览器验收，Desktop 自验；测试账号 admin@example.com，无真实模型调用。
- 保护 P0 仅尊重已有保护与推荐只读。comments/forms/trackedChanges 受限写入、密码设置/核验/移除仍未完成，不称完整原生保护。
- 研究、GenOffice 固定版本及 WeKnora 证据沿 docx-protection-refinement-20261017.md；能力门控适用，Office 样式不参考 WeKnora Markdown 编辑器。
- 合成夹具保留在「编辑器工具栏验收-20261016」：readOnly `kMQWI-WJnvXSe-gU`、recommended `be2QEIJigR1pJZ_w`、unknown-alt-prefix `-hwFLv9oeDPowibQ`。

## 已实际验证

1. readOnly 主编辑器与嵌套文本框 contenteditable=false；实际点击正文键入、双击文本框后键入均未改内容，保存禁用并显示原因。
2. 420×500 页面 scrollWidth=420，Inspector 320px，内部正文约210px/scrollHeight278、固定 footer 位于 y403.97–449.72；宽屏原先两组间巨幅空隙已通过局部 align-content:start 修正。
3. recommended 初始正文只读、公式按钮 disabled、文本框 aria-readonly。点击「仍然编辑此文档」不制造 dirty；最初复现公式/文本框未恢复，独立 checker 修复跨 plugin-view 生命周期属性快照后，真实浏览器重新验证公式 disabled=false/title 恢复、文本框 aria-readonly 移除、正文 contenteditable=true。
4. 开放编辑后实际在首标题末尾键入 ` QA`，保存/撤销启用。真实「导出当前副本」下载 `/Users/admin/Downloads/document-copy (10).docx`，独立 ZIP 读取确认 `概述 QA` 存在，`word/settings.xml` 与上传原件逐字节相同。未保存到库。
5. 点击一次「撤销 (Ctrl+Z)」恢复原首标题，无可撤销改动；随后重新加载丢弃会话选择，正确回到推荐只读。开发期 HMR 会重载组件，本次不据此声明生产会话丢失。
6. 修复后 420px 截图 `docx-protection-recommend-continue-420.jpg` 显示当前状态「可以编辑」、保留的只读建议、紧凑正文与固定 footer。

## 代码门禁

- 独立检查：docx-protection-p0-check-20261017.md，4 files109/109、Office 类型及目标静态通过。
- 根另修 DocxDesignPreview 的已销毁 editor effect 访问；真实 StrictMode before-red 与修后2files17/17，独立 checker 已只读复核逻辑与日志、两文件静态通过。
- 尚待最终 production5180 宽/420 与未知配置、无操作下载读回；不以预验替代最终构建或全 Office 回归。

## 生产构建最终验收

统一 Web build `/tmp/mimir-toolbar-protection-outline-signature-web-20261017.log` exit0。localhost5180：

- 1280×720 readOnly 保护面板状态准确、固定320px，工具条仍紧凑；添加批注和公式分别显示实际保护原因。真实导出 `/Users/admin/Downloads/document-copy (11).docx` 为3425 bytes，与上传原件**整文件逐字节精确相同**（SHA256836c552abaf8f15877606f92a19a87236689d28a8afa950ea904ce110d1a61e6）。
- 420×500 unknown-alt-prefix 明确「凭据无法可靠读取」「旧式、未知或异常保护凭据」，没有错误显示无保护；正文contenteditable=false，页面scrollWidth420，Escape回焦文档保护入口。
- 420×500 recommended 实际点一次「仍然编辑此文档」，正文editable=true、公式disabled=false且title恢复、嵌套textbox移除aria-readonly，保存仍disabled（选择本身零改动）。生产环境无HMR的同一会话恢复正确。
- 最终截图：`docx-protection-readonly-final-wide.jpg`、`docx-protection-unknown-final-420.jpg`、`docx-protection-recommend-final-420.jpg`，绝对目录 `/Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51`。
- 未修改库内fixture，未删测试件；受限批注/表单、密码及强制修订仍后续，不能据P0标全量保护完成。


## 本批最终统一门禁补记

2026-10-17 最终Webbuild exit0：`/tmp/mimir-toolbar-browser-ui-final-web-20261017.log`；全Office177文件1844/1844 exit0：`/tmp/mimir-office-full-toolbar-ui-final-20261017.log`。此为对比/拆分、保护P0、大纲与签名UI冻结后统一运行，取代此前未完成的全套状态，不删除历史失败记录。后续保护C1生产另片实施，不提前计入本批门禁。
