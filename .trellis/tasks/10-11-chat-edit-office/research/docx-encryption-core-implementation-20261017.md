# E0 浏览器整文件加密核心实施边界

2026-10-17，正式 trellis-implement。当前缺口是浏览器不能读取或生成 Office 加密 CFB；本片仅新增私有 core/container/XML/Worker/controller、原生夹具与测试，及精确直接依赖。加密行为在专用 Worker；controller 仅传私有短期请求并负责源身份、单调请求、取消、超时与终止。后续 E1 才接 DocxSession/EditorIo/UI/server，不能将 E0 核心完成称用户工具已上线。

采用已审查的 Noble AES/SHA/HMAC 浏览器 ESM 原语；CFB 仅用官方 cfb1.2.2 写可信的新生成流；不将不可信输入交给通用库 parser，读取由私有有界扇区链与目录验证器完成。Standard AES128/SHA1 仅解密，Agile AES256/CBC/SHA512 解密与新写（100000 spin，4096 分段与 HMAC 完整性）。不使用 Node crypto/Buffer shim，不修改 vendor、共享规范、现有保存/Agent/服务路径。CFB 官方包实际许可证为 Apache-2.0（非前置审查文档提及的 MIT）；Noble MIT，外部 Office fixture MIT 同行保留。

验证包括固定上游实际 Office 双格式逐字节原文、独立第三方解密新写、非 ASCII/多段/末段、篡改/结构与计算预算、专用 Worker 及 controller 取消/乱序/源切换。root 统一 Web build/生产浏览器；本片不抢全套或 server suites，不暂存提交归档删件。

## 实施与实际证据

- 私有 `docx-encryption-types/info/container/zip/core`：从真实 CFB 根目录读取唯一 EncryptionInfo/EncryptedPackage，检查 FAT/DIFAT/minifat/目录的循环、重用、越界和活动目录身份；额外 DataSpaces 仅按有界原始流读取，不执行内容。目录在分配前封顶64KiB/512项；输入52MiB、明文50MiB、信息64KiB，参数与64位真实长度在派生前验证。XML按命名空间读取，不硬编码p前缀，不接受实体声明、未知算法或模糊属性。spin最多1000000；新增固定100000。
- Standard支持实际Office AES128/SHA1/50000派生解密；Agile支持AES256/CBC/SHA512，正确4096字节分段与末段零padding，随机双盐/packageKey/verifier/HMACkey，完整encryptedHmacKey/encryptedHmacValue验证后才解包。加密仅写Agile。其他算法/参数准确拒绝。
- 解密后对真实DOCX ZIP必要部件、10000项、逐项64MiB/累计200MiB流式解压和全部文件CRC检查；不保留展开部件。使用现有锁定JSZip3.10.2的internalStream与只读压缩数据crc32，未修改通用BoundedZip。
- `docx-encryption.worker.ts`为一次请求专用module Worker；固定错误码，没有异常文本/密钥回传。`docx-encryption.ts`每次结束终止Worker，30秒墙钟上限，绑定opaque source+epoch+单调请求身份，取消、换源、重开同源、卸载、被新意图替换、响应同一turn后又取消均拒绝旧结果。无publication callback、API、Agent、浏览器存储或history依赖。
- 官方源审查：Noble2.4.0浏览器ESM的AES/legacy SHA1/SHA512/HMAC，无Node原语；MIT。cfb1.2.2官方包Apache-2.0，writer的Uint8Array分支可在无Buffer运行（原生worker实测），fs只在未使用的writeFile路径；官方browser映射禁用fs/process/node。直接精确依赖新增Noble2项、cfb1项；lock保留既有OCR脏改动，本片只新增office importer、cfb及adler-32树（crc32既有）。没有Node shim。

固定GenOffice480548fd55f1be3593ee0d8e316a734751d58309的四份实际Office fixture及MIT出处许可证原样复制至`packages/office/tests/fixtures/docx-encryption/`，并逐字节用外部plain作oracle。并沿前置研究核对同日WeKnora官方站/公开源码缓存v0.8.3、3e22822c1d2397be730c458c7539d0eb8c113a24（官网SHA6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe；definitions SHA3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0）。其能力门控适用，没有本片Office加密浏览器原语可复用；不声称本片重新联网官网成功。

## 验证

- 专项4文件68/68，exit0，约6秒：`/tmp/mimir-docx-encryption-e0-final-tests-20261017.log`。含两种独立Office原件→外部plain逐字节、两种真实wrong-password、中文/代理对/NUL口令、多段与末段、Agile密文/HMAC篡改、Standard文件数据CRC损坏、XML命名空间/参数/spin/长度/CFB目录与扇区预算、controller取消/同turn/替换意图/关闭/乱序/超时/Worker失败。
- 其中真实`worker_threads`通过测试专属桥执行**实际生产Worker entry和core**，显式将global Buffer设为undefined，5/5。真实解密两个fixture、无Buffer写CFB→第二Worker重开、真实Worker取消、真实wrong-password。桥仅适配线程消息，算法未mock；这不是浏览器生产验收。测试用Node内置stripTypeScriptTypes(strip)编译私有模块至临时目录，未新增编译依赖。
- 独立互通：官方pip `msoffcrypto-tool==5.4.2`安装在/tmp测试目录，使用其`verify_password=True`与`verify_integrity=True`解密本片实际无Buffer Worker生成的15872B Agile文件；11995B输出与外部plain完整相同，SHA256 `8c8212db6e624bfc69286e94d09b7e68c753ee86b6826e51427a33c841f133d1`。日志`/tmp/mimir-docx-encryption-e0-interop-20261017.log`；工具及许可证留/tmp，不成为产品依赖。
- Office tsc、12个TS文件oxlint、13文件oxfmt check、scoped git diff check通过；日志`/tmp/mimir-docx-encryption-core-final-types-20261017.log`、`/tmp/mimir-docx-encryption-e0-{lint,format}-20261017.log`。
- 初次core专项31/32：刻意篡改的Standard偏移3000实际落在ZIP元数据，CRC不能认证该区域；改为真实压缩文件数据偏移100后验证明确拒绝。此事实保留于早期`/tmp/mimir-docx-encryption-core-tests-20261017.log`，不将Standard称为认证加密。原生桥初次因测试helper选CJS XMLParser入口失败，改用该官方包ESM入口后5/5；初次helper用transform模式被Node26类型拒绝，改strip并移除Error参数属性，最终类型通过。

## 交接边界与风险

E0冻结供正式独立checker。DocxSession/Editor/保存导出/server/知识库索引尚未接入，不能称整文件打开密码工具已上线；root继续E1与最终Web build、真实浏览器Worker验收。没有运行全Office/server/Webbuild，没有暂存提交归档或删除上传测试文件。

密码/派生key不存public对象、API、Agent、history、URL或浏览器存储；worker终止与引用清理不保证JavaScript堆物理即时擦除。Standard格式本身没有认证MAC，CRC只能检测文件数据偶发损坏，不能认证ZIP元数据或抵抗主动篡改；Agile才有完整性HMAC。密码校验值被损坏与错误密码在密码验证阶段不可区分，固定wrong-password不会泄漏平台异常。资源预算是输入/链/展开字节限制与可终止墙钟限制，不声称浏览器提供OS硬堆上限。

## E0 独立检查退回后的 XML 修复与重新冻结

正式checker报告`research/docx-encryption-core-check-20261017.md`识别7个真实红项：unused xmlns中的未声明实体、零/代理字符引用、原始非法控制字符，保留xml/xmlns重绑定，以及合法__proto__前缀被对象原型语义误拒绝。没有覆盖、修改或删除其15项独立回归；前一68绿不能替代这些红项。

本次仅改私有`docx-encryption-info.ts`，新增`docx-encryption-xml.test.ts`，更新本实施报告。根据独立P扫描器已验证的字符/单次解码/Map模式，在E0内实现独立的有界原始XML扫描，不依赖P模块，也未改CFB/ZIP/crypto/controller/Worker/Editor/server/共享spec。

- 全部原始code point按XML1.0 Char验证，包括注释/PI里的原始字符。literal属性/文本span仅接受五个预定义实体与合法数字引用，单次解码，不递归处理`&amp;#0;`；注释/PI的实体状文字保持literal。
- namespace scope用Map逐元素继承，显式内建xml绑定，拒绝xml/xmlns保留URI/前缀组合和非默认空绑定，支持正确声明的__proto__/toString/constructor及合法Unicode QName。所有配置属性仍只能无命名空间，未知参数/结构仍严格拒绝。
- XMLValidator继续负责一般语法；本地实际源码fast-xml-parser5.11.2 `src/util.js`的Name正则遗漏补充平面。语法检查临时将补充字符映射为**输入不存在的BMP标记+唯一code point拼写**，保持不同名字injective且不与原名碰撞；实际QName字符范围、namespace和闭合名字仍按原始XML扫描。新回归覆盖已有marker/两个补充字符前缀以及错误闭合，未以过滤合法字符规避问题。
- XML声明严格为XML1.0；有声明时须与当前UTF8字节解码一致，不支持的其他声明编码准确拒绝。属性文字先按XML换行/空白规则规范化再解码引用；element-only内容仅接受XML空白，裸`]]>`、非法attr `<`、外根char reference等拒绝。
- 原来的64KiB/16元素/8层预算、KDF前验证与Worker隔离保持。

最终重新冻结验证：**6文件123/123 exit0**（既有68 + checker15 +新增XML边界40），包含真实生产entry/core的无Buffer独立Worker5项；日志`/tmp/mimir-docx-encryption-e0-return-final-tests-20261017.log`。Office tsc exit0；14个TS的oxlint、15文件oxfmt及scoped diff check exit0；日志`/tmp/mimir-docx-encryption-e0-return-{types,lint,format}-20261017.log`。本次新写实际Worker产物再次由官方msoffcrypto5.4.2验证password+integrity并逐字节恢复11995B外部plain，日志`/tmp/mimir-docx-encryption-e0-return-interop-20261017.log`。

保留过程中新增补充平面正例暴露XMLValidator假拒绝的首次日志`/tmp/mimir-docx-encryption-e0-xml-boundary-tests-20261017.log`（51/52）；修复后52/52与最终123/123分别有独立日志。checker的7红原始日志仍保留。当前状态是**已修复并重新冻结等待正式复查**，不自行将checker结论改为通过；E1与真实浏览器/WebWorker构建边界仍由root继续。

## E0 第二次独立检查退回：5 项 XML grammar 漏洞

正式 rechecker 在原15项上追加8项，结果18通过、5失败，原始日志`/tmp/mimir-docx-encryption-recheck-lexical-20261017.log`保留。真实`parseEncryptionInfo`错误接受：闭合标签中的NBSP、数字开头PI target、空PI target、comment内部双连字符、comment末尾连字符。前次123绿不是这些边界通过的证据，checker的23项测试保持原样。

根因在私有scanner而不是加密算法：闭合名用JavaScript `trim()`丢掉非XML空白；PI/comment分支直接跳过，没有执行对应XML grammar。XMLValidator在上述5种输入也返回成功，不能把它的syntax pass当作充分证明。

本次仅修改`docx-encryption-info.ts`、`docx-encryption-xml.test.ts`及本报告：

- 闭合标签完整匹配XML S（仅空格、tab、CR、LF），验证真实QName并与栈中原始名精确相等。开标签/属性也只认XML S；sticky属性扫描完整消费原始span，拒绝遗漏分隔符、孤立文字及重复namespace声明，不再让matchAll跳过非法部分。
- 提取私有XML Name字符验证供QName与PI共用。PI target是XML Name，允许合法Unicode和colon，与QName规则分开；target非空、首字符及分隔符严格检查，case-insensitive xml保留目标只可进入既有严格声明分支。PI数据仍不展开实体。
- comment必须具有不重叠的完整开闭分隔符，内容不得含`--`或以`-`结尾；内容中单个连字符与实体状文字仍合法。补测`<!-->`时首次发现开闭分隔符重叠也需最小7字符，已修复；首次99/100日志`/tmp/mimir-docx-encryption-e0-lexical-repair-tests-20261017.log`保留。
- 新增37专项：17项把外部`XMLValidator.validate`固定为true，证明私有scanner独立拒绝非法grammar；20合法相近反例覆盖五种XML S组合、空数据PI、中文/补充字符/colon target、xml-stylesheet、PI中的实体状文字、空comment与单连字符。保留原40项XML测试；本文件合计77项。实际validator仍作为额外检查，原有补充平面语法映射和所有预算保持。

修复后专项2文件100/100，日志`/tmp/mimir-docx-encryption-e0-lexical-repair-tests2-20261017.log`。最终完整E0 **6文件168/168 exit0**（原68+checker23+XML77），包括真实Buffer-free生产Worker5项，日志`/tmp/mimir-docx-encryption-e0-lexical-final-tests-20261017.log`。实际Worker本轮产物再由官方msoffcrypto-tool5.4.2验证password+integrity，11995B输出逐字节等于外部plain，SHA256保持`8c8212db6e624bfc69286e94d09b7e68c753ee86b6826e51427a33c841f133d1`；日志`/tmp/mimir-docx-encryption-e0-lexical-interop-20261017.log`。14TS scoped oxlint零warning、15文件format通过，日志`/tmp/mimir-docx-encryption-e0-lexical-{lint,format}-20261017.log`。

本次Office tsc首轮因其他owner在改的`PdfEditor.external-images.test.tsx:259`使用`page`而非`pageIndex`退出1，日志`/tmp/mimir-docx-encryption-e0-lexical-types-20261017.log`保留，已交root协调。未修改该文件，等待其修复后再跑Office类型检查并最终冻结。没有运行全Office/server/Web build或浏览器，未改P、DocxSession、Editor、server或共享spec；E1S的只读container/info接缝保持原状。正式独立复查仍须root另行安排。

PDF owner修复参数名后，Office tsc第二轮该错误已消失，但活跃XLSX片的`apps/server/src/services/xlsx-agent-range.ts:262–263`新增EntrySource.listEntries/ReadonlyMap.set类型错误而退出1，日志`/tmp/mimir-docx-encryption-e0-lexical-types-final-20261017.log`保留；已再次交root协调，没有修改XLSX文件或放宽任何限额。

root确认按E0生产代码、168专项、互通和scoped static结果冻结并释放复查slot；**Office整体types本轮仍未通过**，由root等XLSX编译点恢复后补统一gate，不能将跨片阻塞记为PASS，也不能在整体gate与独立复查通过前推进E1。本片三文件所有权交回，后续不再写入。
