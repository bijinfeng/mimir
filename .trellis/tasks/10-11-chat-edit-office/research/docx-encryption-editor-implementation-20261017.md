# E1U：DOCX 本地打开加密与编辑保存接缝

2026-10-17，实施已冻结，待正式独立 checker。活动任务为 `10-11-chat-edit-office`。本报告不将 E1S 服务端密文索引闭环、浏览器验收或完整工具矩阵计为完成。

## 依据与边界

按已审 `docx-encryption-editor-integration-plan-20261017.md` 实施。沿用固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 的当前打开身份、下一保存意图和成功写入后推进密码的区分；WeKnora 仅沿用该计划记录的同日官方/公开缓存证据 v0.8.3、`3e22822c1d2397be730c458c7539d0eb8c113a24`，用于知识库能力门控，不声称进行了新的 HTTP 调研或其实现浏览器加密。

开始写码前，最小边界已写入 `/tmp/mimir-e1u-boundary.txt`。E0/P 前置独立检查已由 root 确认释放。没有修改 E0 算法、容器、XML scanner、P scanner、server、vendor、公共 Agent DSL 或 spec；没有上传、删除、提交或归档。

## 文件所有权与变更

新增：

- `packages/office/src/docx-encryption-state.ts`：只允许精确的根 UUID opaque token；精确移除这一根属性，保留其他根/嵌套未知属性。
- `packages/office/src/docx-encrypted-session.ts`：私有 WeakMap 会话适配器、真实 bounded CFB/EncryptionInfo 分类、密码意图有界映射、候选/缓存/ACK/取消。
- `packages/office/src/editors/use-docx-opening.ts`：每次加载独立的打开控制器；自身复制源字节，Worker 解密、实际 `openDocx` 验证和换源/取消/卸载失效。
- `packages/office/src/editors/docx-encryption.ts`：根属性扩展、原生保护检查、单一 PM history 事务、失败登记回收。
- `packages/office/src/editors/DocxEncryptionControls.tsx`、`docx-encryption.css`：本地打开表单及打开密码 Inspector；操作限定为新设/更改或显式移除，密码显隐使用 Antd Input.Password。Inspector 继承 320px 外壳，内部滚动、固定一个 primary，primary 只传图标避免重复 label；限制状态可读且复合控件显式禁用；密码草稿随版本/保护 epoch、关闭、Escape 清理。
- `packages/office/src/docx-encrypted-session.test.ts`：9 项真实 native 会话回归。
- `packages/office/src/editors/DocxEditor.encryption.test.tsx`：10 项真实 Editor/实际生产 Worker 回归。
- `packages/office/src/editors/docx-encryption-worker.test-helper.ts`：仅测试用的 worker_threads 浏览器桥，实际运行 E0 production worker，Buffer unavailable，不替换加密算法。

修改既有文件的限定接缝：

- `DocxEditor.tsx`：打开 hook、扩展、活文档绑定、审阅→保护→打开密码；保存/导出全程互斥、生成中停止、await 后到 IO/下载前的 source binding/session/version/保护复核；成功旧 IO ACK 当次字节但保留新意图 dirty；忙状态和准确禁用文案。
- `docx-protection.ts`：canonical comparator 仅投影精确根 encryption token；`docxFormFingerprint` 额外包含 token，使保护设置历史中的密码意图仍能 dirty。
- `editors/docx-protection.ts`：只读/强制修订拒绝 root token 变化，不放松正文、附加结构或原生保护检查。
- `editors/DocxEditor.privacy.test.tsx`：按 root 明确批准，将两项旧调度测试更新为更严格的 E1U 合同；其余既有测试保留。

`docx.ts` 无需修改：包装现有 native `save/assertSaveCandidate/acknowledgeSaved` 即可保留 P/W/T 的所有最终守卫及 metadata floor。

## 保存与密码边界

- `useSource.bytes` 始终是加载的原始 cipher/明文；本地 native session 使用解密的 ZIP 补丁基底；PM 只存 opaque token。没有用明文替换宿主原件。
- 私有映射最多 64 项（初始身份 + 63 次成功设置）；超限明确要求保存并重新打开。新源、A→B→A、卸载清映射并终止 Worker。未知、伪造或无效 token 拒绝。
- 密码不进入 SaveOptions、PM 正文、Agent context、IO target、URL、日志或浏览器存储。输入提交后清空；当前已验证打开会话才能更改/移除，无需向服务器传旧密码。
- 每次保存/导出都先运行 native 最终 P/W/T/原生包检查，再加密。文档和 options 在进入异步前复制；每次 await 后检查活文档、取消、保护 epoch，Editor 再检查完整 edit version 和 source binding。
- 原生包未变化且密码身份未变时原 cipher 整件精确返回；相同当前文档/options/保护 epoch/P scrub floor 的重复导出或保存复用最近 cipher。缓存只保留最近生成与真实持久化两项，仍每次执行 native 最终守卫；不会把失败 IO 或导出当作持久化 ACK。
- 成功 library IO 才推进 persisted cipher/key，并将该候选对应的真实 native candidate 交给 P ACK。旧 IO 期间的新密码/正文/false privacy 意图保留 dirty，已成功清理的 metadata floor 不丢失。
- 原生正文编辑仍遵循 vendor 已有的 `docProps/core.xml` 修改时间和 revision 更新。本轮保真断言仅允许正文以及该部件的既有 `dcterms:modified`、`cp:revision` 差异；core 其余 XML 及所有其他非目标 ZIP entry 精确。

### 两项经 root 批准的调度合同收紧

1. native generation 期间版本/意图已变：旧候选完成后零 IO，当前 false intent/dirty 保留；重试只发布当前 false。因为从未成功保存 true，floor 不推进，原姓名仍保留。
2. generation + library IO 全程互斥：IO pending 时导出禁用，零下载、零第二次 generation；IO 成功后 false 导出仍保留已清理姓名，不 ACK、不清 dirty。原 native stale-candidate/floor 晚到拒绝证据仍保留在 `docx-privacy.test.ts`，未删除。

## 实际验证与日志

- 相关 9 文件 **219/219 PASS**：`/tmp/mimir-e1u-focused-final.log`。覆盖 E1 native9、真实 Editor10、P UI18，以及 native P/原生保护/强制修订、Editor W1/W2 兼容。此 checkpoint 在最后的 source-byte 自身复制、导出准确禁用提示和额外 source binding 复核之前。
- 最终上述小接缝后的真实 Editor + P UI：**2 文件 28/28 PASS**，`/tmp/mimir-e1u-ui-frozen.log`。没有将两个 checkpoint 拼称全仓门禁。
- 最终 Office `tsc --noEmit`：exit0，`/tmp/mimir-e1u-types-frozen.log`。
- 最终限定 12 TS/TSX 文件 oxlint：exit0、零 warning，`/tmp/mimir-e1u-lint-frozen.log`。
- 最终 13 文件 format：PASS，`/tmp/mimir-e1u-format-frozen.log`。
- Antd CLI Input API/demo 已查询；最终控件 lint 零 issues，`/tmp/mimir-e1u-antd-frozen.json`。
- 样式反引号门、`git diff --check`：PASS，`/tmp/mimir-e1u-style-frozen.log`、`/tmp/mimir-e1u-diff-frozen.log`。
- 没有运行 Server 测试、全仓 `pnpm check` 或扩大至完整 Office suite，没有启动常驻进程。

真实 Editor 测试包括：官方 Standard/Agile 原件、错误密码与取消、提交后字段清空、原 cipher 导出精确、不创建 dirty/history；新设/更改/显式移除和 Undo/Redo；实际正文两次保存；旧 IO/new key、失败 IO/导出不 ACK；原生 P 清理后的 old IO/new key/false flag；实际 Worker 停止/重试/换源；A→B→A；options-only version 变化拒绝 IO；原始传入 byte 被外部改写也不改变打开快照。所有加密/解密使用真实 production Worker，不把这些测试称作浏览器验收。

## 第三方密码与 HMAC 互通

使用已缓存官方 `msoffcrypto-tool==5.4.2`、已有 Codex Python runtime，未安装依赖。冻结后重新执行 `verify_password=True` 与 `verify_integrity=True`，完整解密结果与对应预期 plain 逐字节相同。日志 `/tmp/mimir-e1u-interop-frozen.log`，exit0：

| 文件 | cipher | plain | plain SHA256 |
| --- | ---: | ---: | --- |
| native 正文编辑 | 14336 B | 10496 B | `6927e3a1a3ce38f57183b4326fe6134054ec8ed032912889a18a41f6239ea7ea` |
| 实际 Editor production Worker 两次正文保存 | 6656 B | 3218 B | `550023e5383685a53b8450d9196689bf5373a85cb3072ad680b3ffbb9ed1fb24` |

复查夹具均为合成/官方测试资料，未上传：

- `/tmp/mimir-docx-e1u-edited-20261017.docx`，现有测试密码 `Password1234_`；对应 `...-edited-plain-20261017.docx`。
- `/tmp/mimir-docx-e1u-editor-20261017.docx`，合成测试密码 `Synthetic body key`；对应 `...-editor-plain-20261017.docx`。正文含 `Second protected draft First protected draft `。
- 原始 Standard/Agile 夹具仍在 `packages/office/tests/fixtures/docx-encryption`，密码 `Password1234_`。

## 待 root/独立 checker

- 正式独立复核私有候选/缓存、floor/ACK、密码边界、保护根投影及上述调度合同；本轮未自行 dispatch 子 agent。
- E1S 另行实现/检查前，不得宣称加密原件写库已完成正文/切块/索引清除闭环。
- root 的统一新 web build 与 1280×800、420×500 浏览器验收尚未进行；本轮无截图、无 Desktop 验收。新设/更改密码必须在具体可运行 UI 由用户最终接手填写和提交，不在浏览器代填。
- 当前没有 provider，不声称进行了真实模型编辑或自动发送解密正文给 provider。
- E0 既有限制保留：Standard 没有 Agile 的 MAC，预算不是操作系统硬内存上限；JS 字符串清引用不等同可证明的内存零化。
