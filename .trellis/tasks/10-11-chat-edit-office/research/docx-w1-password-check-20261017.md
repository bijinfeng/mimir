# DOCX W1 修改密码独立 check

2026-10-17，正式 trellis-check 子代理 `pdf_image_upload_ui_check`。范围为 `docx-protection-password-next-plan-20261017.md` 的 W1 与冻结 `docx-w1-password-implementation-20261017.md`。直接 review/fix，没有嵌套代理。原 forms/comments 实现与其他 owner 改动均保留；不改 vendor、不暂存/提交/归档/删除测试件。

复用方案中固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 与 WeKnora v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24` 的已核对缓存证据；本次是独立代码验收，不增加官网访问成功的声明。

## Findings (fixed)

1. `packages/office/src/docx.ts` 原生 `session.save` 仅入口检查权限，异步 ZIP 序列化期间结束修改密码会话后，仍可返回旧授权产生的修改字节。已用真实原生保存延迟复现；现固定入口保护 epoch，在最终返回前复查 epoch 与完整 `assertSave`。普通正文、受限 forms、受限 comments 分支统一覆盖。回归进一步验证结束后重新成功核验也不会复活旧保存。此最小 docx.ts 扩展由 root 明确授权，未引入 W2 settings writer。
2. `editors/DocxEditor.tsx` 在 `await session.save` 后直接调用稳定 `source.save`，而后者读取最新宿主 IO。实际 Editor A→B→A 会在锁定新会话后仍写出旧文档的保存结果；已先红后绿。现用提交期固定的 session/documentId/source bytes 绑定，写盘前核对绑定、当前 Agent handle 和保护 epoch；旧来源的迟到保存错误也不污染当前提示。没有用普通编辑版本阻止同文档保存，原 survivor/dirty 流程保留。
3. `editors/DocxProtectionControls.tsx` 的 busy“取消验证”仅传非 primary `ToolbarButton.label`，实际按钮文字为空。真实挂载 Editor 断言已先红后绿；补可见“取消”，并实际点击确认清空明文、终止真实 Worker、保持只读/零 dirty，再测试重新发起后关闭面板取消。
4. 浏览器夹具交接错误：原 `/tmp/mimir-docx-w1-password.docx` SHA256 `4cbc06d2697385e803f05c2e1c7b7f9decddd1b388848245d14b7c3e0e29999c` 实际是11 entries且没有 settings 或 settings relationship，不能用于 W1 浏览器验收。没有覆盖/删除旧件。已独立生成并验证新夹具，见下方。

## 独立复核的边界

- 私有按节点凭据、冻结 native/access、strict SID14/base64/hash/salt/spin/UTF16 长度预算、默认100000与明确0、真实 dedicated module Worker、终止与 promise settlement、错误/超时/取消/协议异常、控制器 token/epoch/原生身份 await 后复核均检查实际路径。
- Python hashlib 独立重新计算现有4个固定向量（spin0/1/1024中文+emoji/100000）全部一致。不是复用生产 hash 函数生成预期值。
- 新增两个原生 SHA512 节点使用不同密码的测试：documentProtection 的中文+emoji密码不能解除 writeProtection；仅实际修改密码 editor 能解锁该门，并保持 comments-only、正文只读和 no-op 完整原字节。
- 实际 PM raw transaction、Agent body/版本、保存后 native settings 和非目标 ZIP 保真、重开锁定、实际 protected comments Agent reply 与 forms UI 切换等已有路径独立再跑。源码/test fixture 确实 await `protectedAnchorsFixture`/`protectedFormsFixture`，插入真实 settings 与 relationship，再 await ZIP；没有使用那份错误浏览器夹具冒充单测数据。
- 现行唯一合同 `.trellis/spec/office/engine/conventions.md` W1 段最小同步了 native 最终保护复核与 Editor 写盘前身份检查。

## 新的有效浏览器夹具

- 文件：`/tmp/mimir-docx-w1-password-checked-20261017.docx`
- SHA256：`28165daee28e988d4b36fea31c0f306c52c5a57ccf21a0e7c41edf571a121417`
- 基底为 vendor kitchen-sink；12 entries，明确包含 `word/settings.xml`、真实 settings relationship 和 ContentType override。writeProtection SID14、spin0、recommended1；**测试密码 editor**。Python 独立按 UTF16LE/SHA512 写入和复核，不含 documentProtection。
- 对这个实际文件另跑生产 `openDocx` + 真实 Node Worker，**1/1 pass**：初始修改密码门、错误密码拒绝、正确解锁、no-op 完整字节、重开锁定、两个 Worker 终止。日志 `/tmp/docx-w1-check-browser-fixture-20261017.log`；临时 harness 位于 `/tmp/mimir-docx-w1-browser-fixture-check.test.ts`，不加入仓库全套或环境依赖。
- 临时 harness 初次用 `/tmp` 绝对 include 遇 Vitest 的 `/@fs/private/tmp` 路径失败，改用真实 `/private/tmp` root 后实际通过；这次通过才是夹具验收证据。没有上传或覆盖浏览器基线。

## Findings (not fixed)

本片未留已确认的代码问题。真实1280/420×500浏览器的 Inspector 几何、滚动与固定页脚、标准显隐、焦点及保存重开由 root 统一验收，不能从 DOM 测试推断完成。W2 原生保护设置、documentProtection 解除、强制修订及整文件加密继续按原方案后续实施，不属于 W1 完成声明。无真实模型/provider/Desktop验收声明。

## Verification

- Tests：目标 **8 files / 149 tests pass**，`/tmp/docx-w1-check-tests-20261017.log`；另外实际浏览器夹具生产解析/Worker **1/1 pass**。
- TypeCheck：Office `tsc --noEmit` exit0，`/tmp/docx-w1-check-types-20261017.log`。初轮短暂失败来自其他 owner 正在创建的 PPTX media 两个模块，最终文件补齐后实跑通过；未改它们。
- Lint：12个目标TS/TSX oxlint exit0且无诊断，`/tmp/docx-w1-check-lint-20261017.log`。
- Format：13个目标TS/TSX/CSS oxfmt check pass；保护控件 antd lint issues0、无skip/partial；`pnpm lint:styles`与`git diff --check` exit0。
- 红测日志：`/tmp/docx-w1-check-red-save-20261017.log`、`...-red-native-save-20261017.log`、`...-red-cancel-20261017.log`。
- 未跑全 Office/server suite、Web build 或真实浏览器，均交 root；未重复已知480条skill基线的全仓 pnpm check。

## 冻结

以上代码、目标测试和静态门禁完成后正式冻结。Root可跑统一门禁与真实浏览器；本代理不再并行修改 W1 文件。
