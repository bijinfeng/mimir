# E1U：DOCX 加密编辑接缝正式独立检查

## 当前权威结论：完整性返工正式复查 PASS（2026-10-17）

**E1U 代码接缝限定检查通过；前次候选完整性 P1 与两个独立红项均已修复。** 以下首次检查的红项、日志与历史结论保留，仅作为返工前证据，不代表当前状态。本结论不包含 E1S、Web build、浏览器、Desktop 或真实供应商执行，也不代表完整打开密码工具已交付。

### Findings (fixed)

- 原 owner 在 `docx-encrypted-session.ts` 的共同私有 `own` 路径，以未暴露的 `candidate.cache.bytes` 发起全长度、逐字节比较，再执行 native guard；公开输出和共享 buffer view 的首、中、末字节变异现在均拒绝 assert/ACK。比较从私有 TypedArray 发起，不信任公开对象的遍历方法；没有新增 digest、额外快照或公共接口。
- ACK 只从私有 snapshot 复制 `persistedBytes`，保持原 native candidate 与 key/plain/floor 一致。未新增当前文档/当前 key 条件，因此旧 IO 成功仍确认自己的真实快照，后续新意图保持 dirty。
- 原 6 个独立回归及两个真实红项完整保留。owner 新增 plain/generated/persisted 三路径回归，分别通过共享 buffer view 改中段/末字节，验证拒绝发布与 ACK、persisted 状态不变、私有 cache 未污染、恢复真实原字节后同一自有候选仍可合法 ACK；本次 checker 未修改生产或测试。

### Findings (not fixed)

本次复查未发现新增 E1U 生产缺陷，没有遗留 E1U 红项。下方既有 E1S、最新构建与真正浏览器验收、provider 未配置及 root 持有的规范同步边界仍适用。尤其 root 前次 Web build 早于此次 session 修复，不能用旧构建作为本次返工的浏览器证据。

### Verification

- **Tests PASS：同一限定 9 文件 244/244，exit0，48.30s。** checker 亲自运行，`/tmp/mimir-e1u-integrity-check-tests-20261017.log`。包括 session17、actual Editor11、P UI18、native P/protection/protection-settings/forced-tracking 与 actual Editor protection/settings。原独立 cache guard、跨 session/重复 ACK、精确根投影、production Worker 发布前换 key/导出互斥，以及旧 IO/new intent/隐私 floor 全部通过；没有扩大无具体风险的测试范围。
- **TypeCheck PASS**：Office `tsc --noEmit` exit0，`/tmp/mimir-e1u-integrity-check-types-20261017.log`。
- **Lint / Format / scoped diff PASS**：返工 session/测试与原独立 Editor 测试共 3 文件，oxlint、oxfmt check、git diff --check 均 exit0，`/tmp/mimir-e1u-integrity-check-{lint,format,diff}-20261017.log`。本次无 UI/CSS 生产变化，前次样式检查证据保留。
- **独立第三方互通 PASS**：本次 244 项实际产生的两份最新 native/Editor 文件，checker 亲自用已缓存官方 `msoffcrypto-tool==5.4.2`、既有 Codex Python runtime 与只读脚本执行 `verify_password=True`、`verify_integrity=True`，解密完整字节等于对应 plain；`/tmp/mimir-e1u-integrity-check-interop-20261017.log`，exit0，未安装依赖。
  - native edited：14336B cipher / 10497B plain，SHA256 `c03eb18b5c2227a18c97847f01cf2516418ae553f575f992350a700047c2f68f`。
  - actual Editor 两次正文保存：6656B cipher / 3218B plain，SHA256 `509e0192370c64f869dc82d2922ce3e9da8c167c14c5ffb46288b7498dc5c4d3`。
- 未运行 Server、full Office、全仓 check、build 或 browser；未修改 E1S/package exports/vendor/共享 spec，未暂存、提交、归档、上传或删除文件。所开测试与静态命令均已消费 exit0，没有新增常驻进程。检查完成、文件冻结，释放槽位交 root 后续统一构建和验收。

参考继续沿已读 E1U 计划与原报告的固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 及 WeKnora v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24` 缓存适用边界，本次是既有完整性契约修复，未新增竞品调研或 HTTP 声称。

---

## 首次检查历史记录（下列 FAIL 已由上方复查解决）

2026-10-17，`/root/docx_encryption_editor_e1u_check` 直接执行 trellis-check，未再派 implement/check。读取完整 hook 输出、task check context、PRD/design、E1U integration plan/implementation、P 与 E0 最终独立报告及适用 engine/editor/project 规范后核查。本次只覆盖 E1U，不代表全工具完成。

**结论：暂不放行；发现 1 项私有候选完整性缺陷，两个独立回归失败，交原实施者修复。** 没有修改生产代码、E0 算法、Server/E1S、package exports、vendor 或共享 spec。主会话可在这个生产冻结上构建其他已通过片段，但不能把本片或密文写库整体登记为完成。

## Findings (fixed)

未发现可由 checker 直接修复的生产机械问题。保留所有原测试，在两份测试中追加 6 个独立案例：

- `src/docx-encrypted-session.test.ts`：两个候选字节变异用例（见未修复项）；generated/persisted cache 每次仍执行 native 最终 guard；跨 session 的 token/candidate 与重复 ACK 拒绝；只精确移除根 token、保留其他根属性与正文同名属性。
- `src/editors/DocxEditor.encryption.test.tsx`：实际 mounted Editor、实际 production Worker 计算结果后、wrapper 发布前，以可控 promise 暂停；此时导出真实禁用且不能创建第二 Worker/下载，再通过实际 Inspector 应用新 key。放行后旧结果零库 IO、当前 dirty 保留；重试只生成能由当前 key 解开的产物，旧 key 拒绝。没有替换加密算法。测试 gate 在 cleanup 也会结算。

新增测试首次有 3 个暂态 TS 诊断（过窄推断类型与 mock `this`），均在测试内修正；首次 projection 期望漏掉原件已有 `mimirInk`，已改为精确保留原件全部其他根属性。早期 EventTarget 拦截测试未构成稳定完成屏障，已改成上述可控 production encrypt 返回边界；最终回归通过。没有把这些测试编写问题算作生产缺陷、降低原断言或抑制规则。

## Findings (not fixed)

### P1：返回候选的密文字节变异后，发布校验与 ACK 仍接受

- 文件：`packages/office/src/docx-encrypted-session.ts:100`（`own`），以及 `assertSaveCandidate` / `acknowledgeSaved`。
- 已证实：正常生成真实加密候选后执行 `candidate[0] ^= 0xff`，CFB signature 已损坏；`session.assertSaveCandidate(candidate)` 和独立的 `session.acknowledgeSaved(candidate)` 都不抛错。两个原生独立用例在 `docx-encrypted-session.test.ts:253` 附近保留，最终均为红。
- 原因：WeakMap 只绑定公开 Uint8Array 对象身份；`own` 验证的是对应的、未变异的 native plain 候选及 scrub floor，没有验证公开 cipher 仍与私有生成记录相同。ACK 随后会把调用方已经改写的 `bytes` 复制到 `persistedBytes`，并将原 candidate 的 key/plain/floor 当作已持久化身份。私有 `candidate.cache.bytes` 已有未暴露快照，但当前未用于此检查。
- 影响边界：证明的是 session 发布/ACK 对变异候选的错误接受及内部 persisted 身份可不再对应输出；本次没有上传损坏文件，没有证明跨用户攻击、密码泄漏或 HMAC 绕过。
- 建议：由原 owner 在发布检查和 ACK 的共同私有候选路径验证实际输出完整性，确保原生候选、cipher 与密码/隐私身份一致。保留正常旧 IO 成功后的旧候选 ACK 和 floor 推进；不能用“必须还是当前文档/当前 key”来修复而破坏已批准的旧 IO/new intent 合同。候选的私有快照不受公开 buffer 写入影响。按 dispatch，checker 不悄改所有权算法，退回原实施者。

### 仍待主会话的范围与规范同步

- **E1S 未在本次检查范围**：没有跑 Server、存储/数据库/切块/索引/embedding 清理或迟到发布验证；UI 文案“加密文件不索引正文”必须等 E1S 完整实现及独立验证后才可整体交付。
- **浏览器未验**：没有 Web build、真实浏览器 Worker、1280×800 / 420×500 样式滚动/固定 primary/Escape/回焦证据。本次 happy-dom/worker_threads 不能冒充浏览器。已知官方 fixture 的旧密码可由主会话打开验证；浏览器新设/更改密码仍须在具体运行 UI 交用户接手填写、确认、提交，checker 未代做。
- **共享规范由 root 持有**：editor 已记载更严格 pre-IO 版本校验和 generation+IO 保存/导出互斥；engine/editor 仍需 root 统一补 E0/E1 的 cipher/plain/native 分离、opaque PM token/有界私有密码历史、缓存必须经过 native P/W/T guard、成功 IO ACK 与候选完整性合同。不要把本报告过程或测试数写入现行 spec。
- 未运行 full Office、全仓 `pnpm check`、Desktop 或真实模型服务；当前没有 provider，不将本地 handle/Worker 验证称作 Agent 真实供应商执行。先前全仓绿不能覆盖本次新实现和独立红项。

## 已核实的生产路径

1. `DocxOpening` 复制来源字节，真实 bounded CFB/EncryptionInfo 识别后才请求密码；解密后的实际 ZIP 经 `openDocx` 校验。原始 source cipher、native ZIP 补丁基底、PM 模型分离，宿主原件未被 plain 替换。A→B→A、取消、dispose/unmount 终止旧 Worker，旧 session 无发布权。
2. 密码保留在私有 session closure/Worker 请求；PM 仅含精确 UUID opaque token，映射最多 64 项，未知/伪造/跨 session token 拒绝；dispose 清理映射与缓存。控件提交清输入。所查生产路径没有将密码写到 context、SaveOptions、IO target、URL、localStorage 或日志。JS 清引用不等于可证明内存零化。
3. Native save 在缓存查找前执行 P/W/T 最终校验。独立 cache spy 案例证明 generated 与 persisted 两类 cache 都不能绕过实际 native save 拒绝。cache key 绑定 doc/options/保护 epoch，并绑定单调 scrub floor；缓存只保留最近生成与真实持久化两项。
4. 实际 Editor 从 generation 到 IO/ACK 全程 save/export 互斥。pre-IO source/session/handle/version/保护变动拒绝发布；新 key 独立用例、原 options-only、P generation 跨 intent/source 用例全部通过。已在 IO 的旧成功保存仍 ACK 自身真实候选，后来的 key/正文/false privacy 意图维持 dirty；失败与导出不推进 persisted key/floor。
5. 根 token 投影精确，正文同名属性及其他根属性未移除；保护 transaction guard 与 native P/W/T 仍作最终兜底。官方 Standard/Agile no-op 精确保留原 cipher；真实正文连续两次保存、移除密码及 Undo/Redo、错误密码、停止重试和切源均通过原有实际 Worker/Editor 回归。

## Verification

- **基线**：同一限定 9 文件 **235/235 PASS**，exit0，`/tmp/mimir-e1u-check-baseline-20261017.log`，34.44s。
- **最终 Tests：FAIL**：9 文件，**239 PASS / 2 FAIL（241 项）**，exit1，`/tmp/mimir-e1u-check-final-tests-20261017.log`，42.10s。仅以上两个 cipher 变异独立案例失败；实际 Editor **11/11**（包括新增受控发布边界）、P UI18，以及 native P/protection/protection-settings/forced-tracking 与 actual Editor protection/settings 均通过。独立 Editor 单项日志 `/tmp/mimir-e1u-check-editor-boundaries-20261017.log`，通过；最终整套包含它，没有将筛选运行中的 10 skipped 当作完整覆盖。
- **TypeCheck PASS**：Office `tsc --noEmit`，最终 exit0，`/tmp/mimir-e1u-check-final-types-20261017.log`。
- **Lint PASS**：限定 12 TS/TSX oxlint，exit0，`/tmp/mimir-e1u-check-final-lint-20261017.log`。
- **Format PASS**：13 TS/TSX/CSS oxfmt，exit0，`/tmp/mimir-e1u-check-final-format-20261017.log`。style-backticks 与 scoped git diff --check exit0，`/tmp/mimir-e1u-check-final-{style,diff}-20261017.log`。
- **独立第三方互通 PASS**：最终 suite 产生的两份真实 native/Editor 加密产物，checker 亲自用已缓存官方 `msoffcrypto-tool==5.4.2` 与 Codex Python runtime 执行 `verify_password=True`、`verify_integrity=True`，解密与各自预期 plain 全字节相等；没有安装新依赖。`/tmp/mimir-e1u-check-interop-20261017.log`，exit0：
  - native edited：14336B cipher / 10496B plain，SHA256 `2ca4361253b64611108961358f539bccfe2a94d62bf34b600ccb227092c5549d`。
  - actual Editor 两次正文保存：6656B cipher / 3218B plain，SHA256 `debbb51982fc9b0ce9460a190e91889a8ea99bd1cf4f97cd498abba15a390380`。
- 未暂存、提交、归档、删夹具、上传文件或修改 vendor；未运行 Server/full/build/browser。正式报告与新增测试冻结，交 root 退 owner 修复完整性后复查。

## 参考

沿已读取 E1U plan/implementation 的固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`、E0/P 的真实本地代码路径；WeKnora 沿同日已缓存官方站/公开源码 v0.8.3、`3e22822c1d2397be730c458c7539d0eb8c113a24`，仅用于知识库能力门控与数据身份参考，不声称本轮新联网或其提供浏览器 DOCX 加密。Office 工具行为仍以 GenOffice/Office 参考为主。
