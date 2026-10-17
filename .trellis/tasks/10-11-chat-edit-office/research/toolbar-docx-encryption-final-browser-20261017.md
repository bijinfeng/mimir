# DOCX 整文件加密：修复后正式浏览器验收

2026-10-17 root，统一测试账号，5180生产预览。构建 `/tmp/mimir-toolbar-r2b-cfb-web-20261017.log` exit0，1091源码/配置输入起止一致；包含正式cfb@1.2.2精确补丁。独立检查 `docx-browser-worker-cfb-independent-check-20261017.md` 已PASS，Office9文件200/200；root随后联网frozen install真实exit0，1264条supply-chain检查通过、下载0、版本未升级，最终lock/workspace SHA不变。日志 `/tmp/mimir-toolbar-cfb-frozen-install-network-20261017.log`。旧offline缺元数据失败保留，现已结清安装门。

## 旧失败与修复证明

原构建Standard、Agile都能打开/no-op，但正文编辑保存返回损坏。真实ESM浏览器Worker定位CFB导出为空：原包用typeof require门控module.exports，Node CJS错误地掩盖。精确移除require门控后，独立真实Vite产物.mjs红→绿；root在5184隔离诊断中实际encrypt core与生产Worker入口均返回8192bytes。该诊断只是根因证明，以下才是实际产品验收。

## Standard

文档`8vpGQjoevJ18VAsh`，官方fixture `packages/office/tests/fixtures/docx-encryption/office-standard-password.docx`，现有密码Password1234_。从原件重开，正文插入“ 浏览器Standard保存验收”，实际结果为“ 浏览器Standard保存验收lorem ipsum”（键盘Home/End平台差异使文字位于前端，按真实结果核验）。点击保存成功，无损坏提示，保存按钮禁用。

- 下载立即固定 `/tmp/mimir-docx-standard-browser-saved-20261017.docx`，8192B，SHA256 `4c13c28da268314e5be57fa4cc8d11b5ade84f3fe2a123e4626bdad7b3839527`。第三方msoffcrypto-tool5.4.2验证原密码和新Agile HMAC，解密正文准确；仅word/document.xml及正常core revision1→2变化，全部其余非目录原生部件精确保留。
- Undo→保存→下载 `/tmp/mimir-docx-standard-browser-undo-20261017.docx`，解密后的**完整3939B明文ZIP逐字节等于官方原始明文**。重新加密使用新随机参数，密文不要求等于原Standard容器。
- Redo→保存→下载 `/tmp/mimir-docx-standard-browser-redo-20261017.docx`，所有原生ZIP部件等于首次saved；ZIP封装时间可变，未声称整个ZIP或随机密文逐字节相同。
- reload重新要求打开密码；原密码打开后正文持久化，保存/Undo/Redo禁用。视图→导出当前DOCX副本，立即固定 `/tmp/mimir-docx-standard-browser-reopen-noop-20261017.docx`，与库redo**整个密文逐字节相同**，SHA256 `87ee1096209db15a8a27c727e57517420adbd462a28aff15246db8408b1f06d0`。

## Agile 与小屏

文档`yQIEB_BfADYSqyJ5`，官方Agile夹具、同一现有密码。丢弃的是修复前保存失败的合成测试草稿；库原密文保留后重开。420×500插入“浏览器Agile保存验收 ”，实际两段结构保留，保存成功。

- `/tmp/mimir-docx-agile-browser-saved-20261017.docx`，14336B，SHA256 `f6b54e08fb024ee7a76de49c308dd396a098a9ed69030f41fb724bc2cf665618`。第三方原密码+HMAC通过，正文准确；仅document及正常core revision/modified时间变化，其余所有原生部件精确保留。
- Undo/save/download `…-undo-20261017.docx`解密后的**完整11995B明文ZIP逐字节等于原始**。Redo/save/download `…-redo-20261017.docx`原生部件除正常保存modified时间刷新外均逐字节等于首次saved；初次过严“Redo连modified时间也完全相同”断言失败，检查证明仅该正常时间变化，没有掩盖为随机密文相同。
- reload重新要求密码，原密码打开显示保存文字，所有历史和保存禁用；420折叠“视图→导出”可用。立即固定 `…-reopen-noop-20261017.docx`与库redo整件密文相同，SHA256 `05ad081a73804dfd23904fb285879c29d452c194d8b72a385b63ffa6b1aa5d5b`。
- 无模型/Agent真实调用、无Desktop声明。知识库持续提示加密原件不进正文索引、“问AI”禁用；E1S原子索引由独立SQLite/PG证据覆盖。

## 样式/交互与边界

截图目录 `/Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51/`：`docx-standard-saved-final-1280-20261017.png`、`docx-agile-reopened-final-420-20261017.png`。使用指定区域原始CDP截图避免IAB缩略缩放。当前库两份样本保持已保存的重做文字，未删除。

打开过快的首次截图实际已经是编辑器，不能当opening取消按钮证据。受控CPU20倍慢速下实际AX观察到“正在本地解密…”与可见“取消本地打开”，随后成功打开；已立即恢复CPU rate1。opening阶段空按钮的最小children修复及取消正确性按独立组件检查，不冒称已截到该短暂阶段。新建/更改密码的浏览器输入仍须用户接手，未自动填入新密码；已有夹具密码只用于打开。总任务保持in_progress，R2b/R3及最后统一门仍开放。
