# E0 DOCX 加密核心独立检查

2026-10-17，正式 trellis-check。范围为私有 container/info/zip/core/worker/controller、精确依赖与原生夹具；未修改产品实现、Editor/server、vendor 或共享规范。结论：**暂不放行，EncryptionInfo XML 有 7 个可复现红项，已交回原实现者**。这不是最终用户工具验收。

## Findings (fixed)

没有修改产品实现。新增独立 `packages/office/src/docx-encryption-check.test.ts`，保留 15 项测试作为修复与回归 oracle；不能将新增测试计为问题已修。

## Findings (not fixed)

### 1. XML 字符与实体合法性未验证

- `docx-encryption-info.ts:31–33,54–58` 依赖 XMLValidator，随后直接解析并丢弃 namespace declaration；该 validator 不验证完整 XML 1.0 字符与实体语法。
- 在实际外部 Agile EncryptionInfo 根元素上分别增加 `xmlns:unused="&bogus;"`、`xmlns:unused="&#0;"`、`xmlns:unused="&#xD800;"`、带真实 U+0001 的 unused xmlns，`parseEncryptionInfo` 均成功返回原参数；新增四项均应 damaged，实际未抛异常。
- 无须猜测密钥或重新加密即可构造，Agile dataIntegrity 不认证这段 XML；核心当前接受应判损坏的加密头。未观察到实体外部读取/网络访问，不能夸大为 XXE。
- 属解析算法缺口，按 dispatch 交原 E0 owner 修复。建议在解析前做有界 XML 1.0 lexical/entity 校验，不能只拒绝 DTD；可借鉴独立 P 已验证模式，避免模块依赖耦合。

### 2. 保留命名空间绑定被接受

- 同一原件增加 `xmlns:xml="urn:invalid"` 或 `xmlns:xmlns="urn:invalid"`，核心均接受。两个保留前缀声明违反 namespace 规则，新增两项 damaged 断言失败。
- 建议验证 reserved prefix/URI、空绑定与 QName 规则，再做命名空间语义识别；已交 owner。

### 3. 合法前缀受到对象原型语义影响

- `docx-encryption-info.ts:54–58` 的 namespace scope 使用普通对象及属性赋值；将合法 `p` 前缀一致更名为 `__proto__` 后，声明没有成为普通字符串绑定，实际 encryptedKey 被 damaged 拒绝。
- 新增正例要求与原头完全同一解析结果，当前失败。建议 Map 或 null-prototype namespace scope，明确禁止继承属性参与解析；已交 owner。

## 有界审查结果

- CFB 输入52MiB；只读取真实根目录的唯一两流，不把未受信任输入交 CFB 通用 parser。FAT/DIFAT/目录/minifat/mini-stream 读取执行越界、重复 claim、循环、实际长度校验，目录64KiB和512项、深度64。非必需流上限1MiB。该范围未发现另一个需修复的语义或越界问题；不声称实现所有 CFB profile。
- 独立新增 7 项 CFB 回归全部通过：mini-sector 自环、越界、跨流 alias、过早终止、root mini-stream 非64对齐、DIFAT alias FAT、v3伪造v4目录数量。
- ZIP 逐项实际流式展开并检查 CRC，展开限制单项64MiB/累计200MiB；新增真实 DEFLATE 压缩的64MiB+1零字节部件（压缩包小于100000B）在实际流处理中 budget 拒绝，通过。CRC不提供 Standard 主动篡改认证；Standard ZIP元数据可篡改的已知格式限制仍存在，实施报告准确披露。
- 核对 Standard AES128/SHA1 50000，Agile AES256/CBC/SHA512、100000新写/最高1000000读取、4096分段/末段、随机salt/verifier/key、完整包 HMAC。长度与参数在 KDF 前验证。密码验证材料损坏与 wrong-password 在该阶段不可区分，已有文案/报告限制合理。
- controller 的 source对象+epoch+单调请求、每次settlement终止、30秒、预取消/源切换/同turn取消后await复核与一次性 Worker 均有实际测试。Worker仅回固定码，不导出密码；没有 persistence/Agent/API/history 路径。引用清理不能保证 JS 堆物理即时擦除。异步保存发布及索引事务属于 E1，未在本片放行。
- 精确依赖 Noble2.4.0与cfb1.2.2；cfb仅可信写入，实际 Buffer-free 线程测试覆盖。许可证 Noble MIT、cfb Apache-2.0、外部 Office fixture 同行 MIT。Web Worker 构建与浏览器执行仍待 root，Node worker_threads 不冒充浏览器验收。

## Verification

- Lint：PASS，`pnpm exec oxlint packages/office/src/docx-encryption*.ts`，日志 `/tmp/mimir-docx-encryption-check-lint-20261017.log`。
- Format：PASS，13个TS及office package检查，日志 `/tmp/mimir-docx-encryption-check-format-20261017.log`。
- TypeCheck：PASS，`pnpm --filter @mimir/office typecheck`，含新增独立测试，日志 `/tmp/mimir-docx-encryption-check-types-20261017.log`。
- 原专项4文件68/68：PASS，独立重跑，日志 `/tmp/mimir-docx-encryption-check-baseline-20261017.log`。含实际生产 Worker entry/core 的 Buffer-free worker_threads 5项。
- 新增独立15项：**8 PASS / 7 FAIL**，日志 `/tmp/mimir-docx-encryption-check-regressions-20261017.log`。最终总计当前76 PASS / 7 FAIL；没有以旧68绿覆盖红项。
- 独立第三方互通：**PASS，checker亲自重跑**。官方已缓存 `msoffcrypto-tool==5.4.2`，使用 `verify_password=True` 与 `verify_integrity=True` 解密最新真实无Buffer生产Worker生成文件，11995B与第三方plain逐字节相同；SHA256 `8c8212db6e624bfc69286e94d09b7e68c753ee86b6826e51427a33c841f133d1`。日志 `/tmp/mimir-docx-encryption-check-interop-20261017.log`。初用系统Python缺_cffi_backend，换现有Codex Python runtime后成功；未添加依赖或绕过完整性。
- 没有运行全仓pnpm check（root已记录480条无关skill lint）、全Office/server/Webbuild；没有进行浏览器验收、暂存、提交、归档、删除夹具。

## 参考及规范交接

依据 active task PRD/design/implement 与 E0两份设计、implementation、Office engine规范。固定GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 的真实Office加密夹具和同行许可证作为外部oracle；审查不依赖上游魔数+字符串探测。按AGENTS沿同日既有WeKnora官方站/公开源码缓存 v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24`（官网SHA `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`，definitions SHA `3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0`）；KB能力门控适用，没有可借用的Office密码算法；本次未声称重新联网官网。

共享spec由 root 所有，待E0修复再与E1实际合同合并：原cipher/plain基底分离、secret不进公开状态、异步意图/版本失效、Agile认证与Standard限制、原子清索引、浏览器实际门槛。不能把本片核心状态登记为完整打开密码功能已完成。

## E0 XML 修复返回的正式独立复查（2026-10-17）

结论：**继续退回 E0，实现不能最终放行**。前次 7 红均已修复；本次另有 5 个真实 XML 语法红项。原始 15 项独立测试全部保留，在同一 `docx-encryption-check.test.ts` 增补 8 项至 23 项，未改产品实现或其他 owner 文件。以下结果冻结交 root 退回原实现者。

### Findings (fixed)

- 原先实体/字符、保留 namespace、合法 `__proto__` 的 7 红，由原实施者修复，checker 独立重跑确认通过；本 checker 没有自行改解析算法。
- namespace scope 已为 Map；字符引用单次解码且原始 XML 1.0 Char 全局检查。QName 补充平面映射选取输入不存在的 BMP marker，保持名称区分；新增独立最高合法 U+EFFFF 与下一平面 U+F0000 正反例通过。原实现者的 marker 碰撞与错误闭合回归亦通过。未发现新的 namespace/映射碰撞问题。

### Findings (not fixed)

这 5 项属于 lexical parser 语法算法缺口，按 dispatch 不在 checker 中悄改；建议原实施者在私有 scanner 中验证下列最小规则，不把 `XMLValidator === true` 视作 XML 完整语法保证。

| 原生 EncryptionInfo 上的最小变化 | 当前错误行为 | 规则与接缝 |
| --- | --- | --- |
| `</encryption>` → `</encryption \u00a0>`（U+00A0 是真实 NBSP） | 成功解析并返回原参数 | XML `ETag ::= '</' Name S? '>'`，`S` 仅 U+0020/U+0009/U+000D/U+000A。`info.ts:173` 的 JS `trim()` 会吞 NBSP；应明确使用 XML whitespace，检查结束标签语法。 |
| 根元素前加 `<?1bad?>` | 成功解析 | PI target 必须是 XML Name，不能数字起始。`info.ts:160–169` 仅特判 xml 声明，其余 PI 无 target 语法校验。 |
| 根元素前加 `<? ?>` | 成功解析 | PI target 必须存在，空 target 不合法。同上。 |
| 根元素前加 `<!-- a--b -->` | 成功解析 | XML Comment 内容不能含 `--`。`info.ts:159` 直接 continue，通用 validator 也只扫描结束序列。 |
| 根元素前加 `<!-- a--->` | 成功解析 | Comment 内容不能以 `-` 结束（否则结束符前形成 `--`）。同上。 |

独立追加的属性间 NBSP、等号前 NBSP 两项准确 damaged 拒绝，不能把结束标签的缺口推广为所有位置都受影响。错误 PI/comment 仅证实非法头被接受，未发现外部实体执行、网络请求或密码/HMAC 绕过，不夸大影响。

### Verification

- 修复返回原有 6 文件 **123/123 PASS**，亲自独立重跑；日志 `/tmp/mimir-docx-encryption-recheck-tests-20261017.log`。包括原 checker 15 项、实施者新增 40 项，以及真实生产 entry/core 的 Buffer-free worker_threads **5/5**；后者仍不等价于浏览器 Worker 验收。
- 新独立 8 项：**3 PASS / 5 FAIL**；原独立文件合计 **18 PASS / 5 FAIL**。日志 `/tmp/mimir-docx-encryption-recheck-lexical-20261017.log`。完整最终 **6 文件 126 PASS / 5 FAIL（131 项）**，日志 `/tmp/mimir-docx-encryption-recheck-final-tests-20261017.log`；不能用之前 123 绿覆盖新增红项。
- Office TypeCheck：PASS；14 TS scoped oxlint：PASS、0 warning；15 文件 oxfmt：PASS；scoped `git diff --check`：PASS。日志 `/tmp/mimir-docx-encryption-recheck-final-{types,lint,format}-20261017.log`。新测试 helper 最初触发 `consistent-function-scoping`，已机械提升到模块作用域后重跑静态门全部通过，没有抑制规则。没有修改产品实现、E1、P、PDF、vendor、共享 spec。
- 真实第三方互通再次由 checker 亲跑：最新本轮生产 Worker 生成 15872B Agile 文件，官方缓存 `msoffcrypto-tool==5.4.2` 使用 `verify_password=True` 与 `verify_integrity=True` 解密，与外部 plain 11995B 逐字节相同；SHA256 `8c8212db6e624bfc69286e94d09b7e68c753ee86b6826e51427a33c841f133d1`。日志 `/tmp/mimir-docx-encryption-recheck-interop-20261017.log`。未重装依赖。
- 原生 container/ZIP budget 回归仍通过；在 core 实际调用链中，container、XML 参数、真实 package length 先检查，再做 Standard/Agile KDF；未改变这些算法。Standard 缺少 MAC 的格式限制、输入预算并非 OS 硬堆限制仍保持原报告边界。
- 没跑全仓 pnpm check（既有 480 skill lint），没跑 server（root 独占完整 gate）、全 Office、Web build 或真实浏览器。没有暂存、提交、归档或删除夹具。

E0 尚有以上 5 红；E1 Editor/保存/UI/server/索引仍未集成，均不得登记为整文件密码工具已完成。参考沿本报告已记录的固定 GenOffice 与同日 WeKnora 缓存证据，未声称重新联网调研。共享规范待 root 随 E0/E1 最终合同统一同步。

## E0 最终 lexical 修复的正式独立复查（2026-10-17）

**当前结论：E0 有界核心通过，冻结交 root 进入 E1。** 上面两次退回的历史结论及日志保留；前次 7 红与后次 5 红现均通过。此结论仅针对私有 container/info/ZIP/core/Worker/controller，不代表完整打开密码工具已经上线，不放行 E1 Editor/保存/UI/server/索引或真实浏览器验收。

### Findings (fixed)

修复均由原实施者完成，本次 checker 没有再改产品实现、测试或共享规范：

- `docx-encryption-info.ts`：结束标签完整匹配 XML S 并验证原始 QName 后与栈精确比较，已去除 JS trim 放宽。开标签属性使用只接受 XML S 的 sticky regex，按 lastIndex 完整消费整个原始 attribute span；不存在旧 matchAll 跳过非法分隔符/孤立文本的问题，重复声明另有 Set 校验。
- PI：私有 XML Name 校验区分于 QName，允许合法 colon/Unicode target，拒绝空/数字起始/非法分隔符；大小写不敏感的保留 xml target 进入严格 XML 声明分支，位置、大小写、版本、参数次序与编码仍受约束。data 内实体状文字保持 literal，不误套属性解码。
- Comment：显式检查完整且不重叠的开闭分隔符，拒绝内部 `--` 与结束符前的尾 `-`。空 comment、单连字符和实体状文字仍可接受。
- 前次 Map namespace、单次引用解码、原始 XML 1.0 Char 检查、补充平面 QName injective 映射保持；原独立 23 项未删除或弱化。实施者新增 17 项强制通用 XMLValidator 成功仍须拒绝的测试，证明本次三个语法分支由私有 scanner 实际守住；另有 20 合法邻近项防止修成笼统拒绝。

### Findings (not fixed)

本次限定 E0 审查未发现新增需修复的问题，也没有遗留 E0 红项。没有为可选格式继续无限扩大枚举。

后续所需工作不属于本次 E0 放行范围，交 root：E1 原 cipher/plain/session 身份隔离、密码历史不透明身份、保存和导出加密、成功 IO ACK、P 元数据 scrub floor、server 原子清旧正文/分块/向量与迟到发布防护；Web 构建及真正浏览器 Worker/打开与密码管理 UI 验收。当前没有配置模型，不能把本地算法验证称为真实供应商执行。

### Verification

- **Tests：PASS，6 文件 168/168，exit0。** 命令含 `docx-encryption.test.ts`、container/controller/native/check/XML 六文件。日志 `/tmp/mimir-docx-encryption-final-review-tests-20261017.log`，约 7.94 秒。原 23 独立项全部通过，CFB 真实损坏链和真实 64MiB+1 DEFLATE 展开限制仍通过。
- **真实 Buffer-free 生产 Worker：PASS，5/5。** 上述完整测试实际运行生产 entry/core 与 controller，用 worker_threads 测试桥且 Buffer undefined；既有外部 Standard/Agile 原件逐字节恢复、无 Buffer 新写并第二 Worker 重开、真实取消、固定 wrong-password 均通过。没有将其冒充真正浏览器。
- **第三方互通：PASS，checker 亲自执行并消费 exit0。** 完整测试本轮新写 15872B Agile 文件，由官方缓存 `msoffcrypto-tool==5.4.2` 执行 `verify_password=True` 和 `verify_integrity=True`；11995B 输出与外部 plain 完整逐字节相同，SHA256 `8c8212db6e624bfc69286e94d09b7e68c753ee86b6826e51427a33c841f133d1`。日志 `/tmp/mimir-docx-encryption-final-review-interop-20261017.log`，未添加依赖。
- **TypeCheck：PASS，Office tsc exit0。** 本轮 XLSX/PDF 在途类型阻塞已消失；日志 `/tmp/mimir-docx-encryption-final-review-types-20261017.log`。未修改其他 owner 的文件。
- **Lint：PASS，14 TS scoped oxlint exit0、0 warning。Format：PASS，15 文件 oxfmt exit0。scoped git diff --check：PASS。** 日志 `/tmp/mimir-docx-encryption-final-review-{lint,format}-20261017.log`。
- 重新审阅实际 core 调用链：真实 container/EncryptionInfo/参数/package 长度在 KDF 前检查；Agile HMAC 验证在 ZIP 解包前，Standard 没有 MAC 的格式限制未掩盖；预算仍为输入/链/展开字节与可终止墙钟，不声称 OS 硬堆限制。
- 未运行全仓 pnpm check（已知 480 skill lint）、server（R2 持锁）、全 Office、Web build 或真实浏览器；未暂存、提交、归档、删除夹具、改 vendor 或公共接口。

参考继续沿本报告已记录的固定 GenOffice 与同日 WeKnora 官方站/源码缓存证据，未声称本轮重新联网。共享规范由 root 随 E0/E1 真实合同统一同步。本 checker 结果及文件所有权冻结，释放 slot 供 E1 后续实施。
