# DOCX P：原生个人信息清理实施记录

2026-10-17，`docx_privacy` formal implementer。本片已冻结供独立 checker 复核：私有模块、`docx.ts` final-save 接缝与 native/真实 Editor 出口测试完成。尚不能当作隐私可见工具入口、整项任务完成或浏览器通过。

## 改动边界

最小缺口是隐私开关只有 vendor 的包末尾正则清理：跨作用域 prefix 匹配可能误清 foreign namespace，core/app/people 还只按固定路径判断。行为真正归属于 final native package，不能只改 Inspector flag。新建私有 `packages/office/src/docx-privacy.ts`、native tests 与 `editors/DocxEditor.privacy.test.tsx`；仅在 `docx.ts` 增加必要最终出口接缝。没有 UI、服务端、加密、vendor 或共享 spec 变更。

## 固定证据

- 实读 `/tmp/mimir-genoffice-html-git/packages/docx-engine/src/patch.ts`，固定 `480548fd55f1be3593ee0d8e316a734751d58309`：`355` 默认采用原件标记，`397` 开启时不走普通 no-op，`1413` final package scrub，`1743–1960` flag/metadata 策略。该版本 core creator/lastModifiedBy、app Manager/Company、people person，Word author/initials 属于此工具语义；不是正文通用个人信息识别。
- 按项目 AGENTS 复用同日 WeKnora 官网/源码缓存证据，v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24`，官网与 definitions SHA256 `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe` / `3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0`。未声称重新联网。其 KB/能力边界仅作相关性参考；Office metadata 语义以固定 GenOffice 与实际 OPC 为主。

## 精确允许条目与处理

- 根关系必须是实际 OPC Relationships/Relationship，直接 officeDocument 关系精确定位主文档。document relationships 真实 settings 关系定位开关，拒绝重复/外部/缺失目标。
- 清理主文档及沿实际关系递归到的 header/footer/footnotes/endnotes/comments/glossaryDocument。真实 W transitional/strict namespace 的 author/initials 属性替换 Author/A。**未限定 namespace 的同名属性、foreign/rebound namespace 属性保留**；这是比上游全局 prefix/未限定属性正则更精确的边界。
- 根实际 core-properties 关系定位 core，只清正确 Dublin Core creator 与 package core lastModifiedBy 的直接简单内容；app 实际 extended-properties 关系定位，只清实际 extended properties namespace 的直接 Manager/Company。未知属性和目标外节点精确保留；目标值含复杂子结构时原子拒绝，不假定可删除。
- story 的实际 people 关系定位非固定位置，删除正确 people namespace 的直接 person 节点。foreign/rebound people 及未知 wrapper 保留。
- customXml、自定义属性、无关 XML、所有二进制不遍历清理。正文姓名、日期、任意扩展或自定义数据不作通用 PII 清除承诺。
- 不重写 XML 树；保持 offset，仅按最小 span patch。被改的目标 ZIP 条目以外非目录条目字节必须完全一致。没有实际差量时返回原输入 Uint8Array 对象，不重压缩。

## Flag / no-op / protection 合同

- `nativeDocxPrivacyEnabled(settingsXml)` 只读取实际 direct Word setting 和 qualified Word `val`；不信公开 parsed flag。缺省 val/1/true/on 为真，0/false/off 为假，保留未更改的原始拼写；不接受重复 expanded attributes、重复 flag 或非法值。
- `finalizeDocxPrivacy(bytes, intent?)`：undefined 服从 candidate 实际 native flag，显式布尔覆盖本次意图；开启时即使正文无改动仍 scrub，与固定上游一致。已开启且干净则全件 no-op；关闭只去实际标记，不能把已清除 metadata 恢复成此前姓名。
- 新启用且缺 settings 时，通过真实 document 关系原子创建独立 settings part、relationship、ContentType；避免覆盖同目录未引用 settings。目标或结构无法证明时拒绝。
- 已实现接缝：vendor 调用 clone parsed `{ removePersonalInfo: false }` 并剥离 vendor options 的 `removePersonalInfo`，避免 vendor 提前正则清理，也避免传 false option 强迫改原 flag/产生假 dirty；本次原始 intent 只进入 private finalizer。
- 原 flag 开启不授予 metadata 写权限。只读/forms/comments 在实际 scrub 有差量时应明确拒绝，原件保留；已干净 no-op 应通过。原 session/source/epoch 最终检查继续适用，新增 privacy await 前捕获 epoch，读取后再次 assert，最终返回前仍检查 epoch/完整保存权限；有明确 epoch 变更回归。

## 有界拒绝

使用 BoundedZip（50MiB input、10000 entries、64MiB entry、400MiB总解压）；privacy XML 单 part 2,000,000 bytes/字符、累计16,000,000 bytes、最多256读取部件；parser 深度64、节点100000。预检拒绝 DOCTYPE/ENTITY、非法 XML、未绑定 prefix、重复 expanded attrs、外部目标、非法路径/越根/缺件/冲突目标。CDATA、注释、PI 作为完整 token 保留，不让伪闭标签降低真实深度。

## 原件读取与 UI 归属

- 集成使用 `readNativeDocxPrivacyEnabled(protectedOriginal)`，私有原件独立解析 root/main/settings，不能用公开 parsed 或既有 protection reader 的 canonical main 假设替代。custom-main + custom-settings 真实 session.save 已验证，未关联的 canonical settings 与 document 不受影响。
- 兼容旧式缺 root relationships 的无隐私文件；若常规 settings 出现启用隐私的孤立标记，则拒绝猜测。存在的 malformed/duplicate/外部真实关系不转成 false。该有界兼容边界不代表修复原有保护控制器对非 canonical 主文档的全部语义。
- 为保持实际权限判断，只从 body options 中抽出 privacy intent；文档及其他完整 options 仍走原 `assertSave`。privacy 最终确有 ZIP 差量才检查通用 writable，mandatoryTracking 也不能因该 flag 获得 metadata 写权限；已清理 exact no-op 可通过。
- **当前 src 没有可见的“移除个人信息”设置入口**。既有 DocxEditor 的 save options 可承载 flag，但当前没有设置该 flag 的界面或专属历史。父任务已明确后续自行补 UI；本片不宣称“隐私工具已经可在工具栏完整使用”。
- 原件 flag 已开启但 metadata 未清理时，打开不制造 dirty；当前“保存到库”仍随内容 dirty 启用，所以未编辑时可通过导出得到清理副本，原库件无自动写入。实际编辑后保存会 scrub。后续 UI 需把显式隐私意图纳入当前工作副本与历史。

## 最终验证（冻结时）

- `pnpm --filter @mimir/office exec vitest run src/docx-privacy.test.ts src/editors/DocxEditor.privacy.test.tsx src/docx-protection.test.ts src/docx-protection-settings.test.ts src/docx.test.ts src/editors/DocxEditor.export.test.tsx`：**6 files / 125 tests PASS**，2026-10-17 13:49:38 开始，20.80s。P 专项 42 项，邻接 83 项。
- 4 变更源码文件 targeted oxlint：**无错误/警告**；oxfmt --check：pass；git diff --check：pass；样式 backtick 守卫 pass。
- Office types 早前模块/初始接缝两次通过；最终 unified Office types **被并行 XLSX 工作阻断**：`src/editors/XlsxDataControls.tsx(3,10)` TS2305 `../xlsx.js` 没有 `columnLetters` 导出（前一版本同文件第6行从 gateway/cell-address 引入同名符号失败）。未修改该 owner 文件，已告知 root。不能把当前 typecheck 写成通过。
- 早前扩大到 T 文件的 7 files / 144 tests，143 pass / 1 fail：`docx-forced-tracking.test.ts` 新增的 ordinary Agent inline styles 测试中 native 多出 rawRPr docTextStyle，已交 T owner；本片后续邻接运行不包含正在修改的 T 文件，不掩盖此事实。
- 覆盖真实关系、noncanonical core/app/people/main、recursive glossary/header、strict namespace、false/off/no-op、显式启停、self-closing settings、缺部件原子创建、body/date/custom/binary/unknown attrs 精确、prefix rebind、保留 UTF8 BOM、CDATA/comment 伪标签、DOCTYPE、malformed/unknown/reserved namespace、缺件/外部/越根、节点/深度/累计预算及拒绝时输入完整。
- 真实 session.save 覆盖默认开启未改正文 scrub、public parsed flag 篡改无效、显式 false 原件保留、四种保护 actual-change 拒绝与已清理 no-op、await 后 protection epoch 变化拒绝、custom-main settings 真值。
- 实际 DocxEditor 组件覆盖 export 与 library save 同一清理、导出 zero dirty/version/history/IO、正文 save 后 Undo/Redo 和第二次 save。没有模拟不存在的 UI 开关，也没有真实浏览器声明。

## 浏览器夹具与剩余工作

生成 `/tmp/mimir-docx-privacy-20261017.docx`，供父任务浏览器上传验收，尚未上传或删除。原件 native flag 已开启，包含：可编辑中文正文及 Alice 姓名、既有修订/日期、批注 author/initials、页眉修订、非 canonical core/app/people、foreign creator/Company/person、custom XML/property 与 opaque binary。保存或导出应清真实元数据，正文日期与目标外内容保留。测试自行构造 fixtures；回归不依赖 `/tmp` 文件。

未运行 full Office/build/浏览器，父任务负责统一 gate、真实 UI 验收与新增开关。整体任务仍未完成，E 加密不属于本片。

## 2026-10-17 独立检查退回后的修复（再次冻结）

独立 checker 报告 `docx-privacy-check-20261017.md` 确认6个红用例，原复现全部保留。此次修复仅触及 P 自有模块/native tests 与 `docx.ts` P 接缝，没有修改 T、UI、vendor、server 或共享 spec。

- XMLValidator 的格式验证不足以证明实体/字符合法。现在额外验证所有 literal 字符满足 XML1.0 Char 范围；仅普通文字和属性 span 解析实体，允许五种预定义实体与合法十进制/十六进制数字引用，拒绝未声明/无结尾/非法码点。CDATA、注释、PI 的普通 ampersand/实体样文字不递归解释；这些上下文的真实非法字符仍拒绝。普通文字的 raw `]]>` 与属性 raw `<` 也拒绝。不会将 `&amp;#0;` 的合法属性当成非法的二次引用。
- namespace scope 改用 Map，绑定只来自实际声明/合法内建 xml。未声明 `toString` 不再继承 Object.prototype，合法 `__proto__` 前缀能够按原 scope 清理。
- 原 source native flag 与显式 intent 决定最终 policy，`privacyIntent ?? privacyEnabled` 传入 finalizer，candidate 被篡改成 off 不能放宽。flagPatch 在语义相同的 true/on/false/off 值上保留原始写法。
- vendor `parsed.internal.originalBytes` 从私有 `protectedOriginal.slice()` 注入；公开 parsed 容器不能替换 native 补丁基底。每次传 slice 也防止保存返回对象向调用者泄漏私有原件 buffer。测试证明公开原始 bytes 替换无法关闭或暗中开启隐私，保存结果被 fill(0) 后下次保存仍返回原始干净字节。

最新门禁：

- 原 checker native tests：47/47 pass（修复初轮，未删 red）。
- 扩展最终 `pnpm --filter @mimir/office exec vitest run src/docx-privacy.test.ts src/editors/DocxEditor.privacy.test.tsx src/docx-protection.test.ts src/docx-protection-settings.test.ts src/docx.test.ts src/editors/DocxEditor.export.test.tsx src/docx-forced-tracking.test.ts`：**7 files / 175 tests PASS**，13:56:51 开始，10.26s。包括 T owner 已修的 inline style 邻接回归。
- Office `typecheck`：**PASS**（此前 XLSX transient 错误已解除）。
- 4源码/测试文件 oxlint（无错误/警告）、oxfmt --check、git diff --check 与样式 backtick 守卫：**全部 PASS**。

尚未做 full suite/build/浏览器；原独立 checker 的6个问题待同一 checker 复查，不能提前称独立检查通过。UI入口与专属history仍由root后续负责。
