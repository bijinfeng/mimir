# DOCX E 浏览器加密实现前选库与接缝审查

2026-10-17 root，承接已批准all-tools与docx-encryption-privacy-followup设计。此为实际源码/registry研究，不是实现/验收。

## 固定来源

主参照GenOffice固定480548fd55f1be3593ee0d8e316a734751d58309，实际读取apps/docs/src/main/docx-encryption.ts与tests/docx-encryption.test.ts。真实Microsoft Office Standard/Agile独立fixture均位于其apps/docs/tests/encrypted-fixtures，password Password1234_，对应plain可逐字节比对，MIT-msoffcrypto-tool许可证同行。现有upstreamCFB magic+stream字符串探测不应照搬成真实性校验。

按AGENTS检查WeKnora沿同日已固定官网/public source缓存v0.8.3 /3e22822c1d2397be730c458c7539d0eb8c113a24；官网SHA6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe，definitionsSHA3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0。能力门控适用；没有浏览器Office文件加密实现可复用，不以Markdown或KB工具充数。未声称本次新联网官网成功。

## 官方npm包实际结果与选择

- npm registry officecrypto-tool@0.0.19，MIT，2025-08-20 modified；tarball140584B unpacked，本次实际npm pack到/tmp/mimir-officecrypto-review-20261017/package并读源码。
- 包无browser/exports适配；index.js依赖Buffer、CFB，Agile文件直接require Node crypto与xml2js。因此不能直接加浏览器依赖并虚称可跑。其decrypt仅验verifier/ZIP，未读取或核验Agile dataIntegrity；Mimir必须校验HMAC才能明确拒绝损坏密文，不能复制该缺口。
- 可复用标准化原语：项目lock/store已含@noble/ciphers2.4.0、@noble/hashes2.4.0。实际aes.d.ts提供ecb/cbc（可关闭padding），hashes提供sha1/sha512/hmac；浏览器ESM不依赖Node crypto。office声明直接精确依赖以免依赖偶然提升。CFB官方cfb1.2.2自带types、browser映射禁用fs/process/node、只依赖adler32/crc32；可作独立worker内有界容器读写，不引入整套Node shim。后续需真实Webbuild与workerfixture确认，选库存在不等于浏览器通过。
- 按ECMA-376 Standard AES128/SHA1和Agile AES256/CBC/SHA512先实现真实fixture互通；支持其他keyBits/hash必须有实际参数校验+interopfixture，否则准确拒绝。Agile新写随机salt/verifier/packageKey/HMACkey，100000spin，4096B分段，零padding，8B真实明文长度，完整dataIntegrity；用crypto.getRandomValues。不得自行发明加密格式或以普通ZIP密码替代。

## E0实施边界

新私有docx-encryption-core/worker/controller及native测试；不先碰docx.ts/UI/server。真实CFB目录读取，只接受唯一根EncryptionInfo和EncryptedPackage，限制输入/目录/流/输出长度，scheme/header/XML namespace/属性/盐与密文块/整数/spin预算前置；不以搜字符串判断。整worker有终止/墙钟预算，挂起/旧请求/换源/关闭零发布。password只进worker请求和私有当前会话内存，不暴露Agent/context/日志/持久存储。Standard用已审查原语，Agile校验verifier与HMAC，错误密码与不支持/损坏分离。

至少真实Office两fixture逐字节plain、自己加密后独立实现decrypt、UTF16密码、多段与末段、坏CFB/重复流/参数/密文/HMAC/预算、取消/迟到/换源、Webworker构建验证。保留第三方许可证与来源，不修改vendor。

## E1后续集成合同（E0独立检查后）

DocxSession原生ZIP基底与原cipher分离；未改内容/密码返回原cipher；新候选native保存完才加密，失败/取消不经EditorIo。当前原件密码与下次保存意图分离，仅成功io.save后推进persisted身份；导出不推进库基线，设置意图不以明文进history。Undo正文不清失密码保护；切文档清私有状态。

服务端当前replaceUpload仅更新documents，chunks存在独立重建入口，不能靠extractText错误即当旧索引已清。加密保存必须在数据库同一事务更新body/excerpt/searchText/parseError与删除旧chunks（embedding外键级联）并失效相关重建缓存；storage/meta失败需保持旧指针/旧索引，晚到embed不得回填旧内容。新上传/replace/rebuild均按实际CFB envelope识别加密，存cipher并明确暂不索引，不向服务器发送密码或plain。补SQLite/Postgres适配范围、故障原子性与backup/rebuild/搜索回归。

已存在的历史备份保持其历史状态；不承诺回溯擦除以前的明文备份、数据库日志或JS堆物理擦除，也不自行删除历史备份。UI须清楚说明加密今后保存的原件、库暂不索引加密正文。当前源为cipher时重建不得以旧body恢复明文；恢复历史未加密备份就是恢复该历史状态，不能冒称全历史已改写。

320px Inspector状态/标准密码显隐/两次确认/取消/固定primary与开启文件对话；实际浏览器新密码输入按CUA规则最后交用户操作，先完成可运行代码/fixture/只读打开错误密码和native验证，不提前问抽象权限。整文件加密与W1/W2限制密码文案明确区分。
