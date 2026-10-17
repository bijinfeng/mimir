# DOCX 原生保护：可执行的最小分阶段方案

2026-10-17，只读技术研究与待批准计划。未改生产代码，未运行浏览器、模型、全测或构建。当前 `DocxEditor` 与 compare/split 由另一实现者独占；保护实现须等其交接，不并写该文件。承接 [后继边界](./docx-protection-next-boundary-20261017.md)。

## 1. 已核对的来源与范围

- 主要参考 GenOffice 固定 `480548fd55f1be3593ee0d8e316a734751d58309`，`git -C /private/tmp/mimir-genoffice-full rev-parse HEAD` 已核对。下述源码证据均为此版本，不拿主分支新功能推论当前能力。
- 本地 vendor `packages/docx-engine/src/types.ts:2035` 的 `DocProtection` 是编辑限制，`WriteProtection` 是建议只读/修改密码（honor-system）。`protection.ts:98–145` 提供 SHA-512 SID14 的 hash/verify；不是整文件加密。
- 原生保存 `patch.ts:203–214,1188–1206,1707–1743` 接 `protection`、`writeProtection` 的 undefined保留/null移除/对象写入。`removePersonalInfo` 独立，不能误当写权限。
- 上游 `App.tsx:1569–1617` 区分 readonly/comments/forms/trackedChanges；`ProtectDialog.tsx:99–159` 算差量并在变更已有 enforced hash 限制前核验。它的修改密码重置并未在该对话框再次核验旧修改密码，不应原样照搬为 Mimir 安全合同。其 `editor.setEditable` 也不是完整执行层保护。
- 官网 `https://weknora.weixin.qq.com/` 本次 HTTP200；公开 GitHub latest release为 **v0.8.3**，发布时间2026-10-14T07:53:24Z；本次 main固定 **f5cfa0ff5fa87c45f59d4176f4ac8bb922bd5dd8**（提交时间2026-10-16T16:24:34Z）。官网不据此冒称展示该源码版本。保存的读取证据 `/tmp/mimir-docx-protection-weknora-20261017.html`、`/tmp/mimir-docx-protection-weknora-release.json`、`/tmp/mimir-docx-protection-weknora-definitions.go`。
- WeKnora固定源码 [definitions.go](https://github.com/Tencent/WeKnora/blob/f5cfa0ff5fa87c45f59d4176f4ac8bb922bd5dd8/internal/agent/tools/definitions.go#L32)：sandbox文件写工具由实际backend capability注册，注释明确“checkbox would have been a lie”；wiki写工具仅wiki KB在范围内可用。适用于Mimir“目录/按钮只反映实际执行能力，执行层仍重验”的原则；该文件未提供DOCX编辑限制/Word密码或Office工具栏证据，不作主模型，也不据此断言WeKnora全库不存在该功能。

## 2. 当前真实漏口

| 入口 | 当前证据 | 最小需要补的实际守卫 |
|---|---|---|
| 打开/保存 | `src/docx.ts:61–128,146–225`，session原始字节与parsed可见，但没有不可替换的保护策略，save接任意SaveOptions | 从原件settings提取策略；session.save最后重验PM与附加结构，拒绝无授权的保护字段/partXml覆盖 |
| 主PM手动/快捷键/拖动/撤销 | `DocxEditor.tsx:1327` editable:true；命令直达 `runCommand`/dispatch | 独立PM `filterTransaction`，非docChanged布局/选区继续；任何有文档变化的事务按当前策略验证 |
| 阅读模式 | `DocxEditor.tsx:1348–1377` 和1449后的handle包装会退出阅读并setEditable(true) | 展示只读与原生保护分离；退出阅读后editable仍取策略；被拒写不应退出阅读/标dirty |
| 附加结构 | Agent `beforeWrite:696`、`updateSaveOptions:721`；手动Inspector复用execute；多处分支直接合并options | tool意图与结构patch都检查；页眉/样式/注释等不会因body不可编辑自动停止 |
| Agent | `beginDraft:810`、append:824、commit:841、execute:867、undoRound:2368 | begin/append/commit/late-result/round恢复都检查当前策略与身份，不只写工具入口 |
| 修订 | `setRevisionMode`仅切临时bool，`restoreRevision`恢复旧storage；accept/reject走TRACK_IGNORE | forced时永远保持录制开；拒绝accept/reject与关修订；不能用任意TRACK_IGNORE/history$绕过 |
| 文本框/图表/域/受保护表格局部编辑 | vendor `extensions.ts:4586–4660` 双击setEditing(true)没有父view.editable判断；5086新建子Editor；commits只到父dispatch | NodeView入口/子Editor/commit同步策略；父事务过滤仍兜底，并在拒绝后恢复可见DOM，否则会“看似改了，保存却没改” |
| 嵌套表格 | vendor `extensions.ts:3085`检查editor.isEditable，但DOM在blur/全局ai-docs-commit-tables事件才提交 | 禁止不允许模式的contenteditable island，策略变化清理未提交局部DOM并重绘 |
| 复选框 | vendor `checkbox-toggle.ts:46–61` 真字段glyph替换，保留marks，TRACK_IGNORE；formsFill绕过view.editable | 仅允许原件真实FORMCHECKBOX/ctrlCheckbox的准确glyph切换，不能允许任意替换或普通方框字 |
| 新墨迹/对象布局/主题等 | `editors/docx-ink.ts:64`只检查isEditable，Docx设计使用doc attrs | 纳入body/structural权限；trackedChanges下没有原生修订证明的操作先禁 |

### 解析陷阱必须先处理

vendor `parse-package.ts:122–173` 不是可靠的权限判定入口：

1. 只匹配 `<w:documentProtection>`/`<w:writeProtection>`，原件换namespace前缀可能返回null。
2. spin/SID只抓十进制digits，坏值会被当作字段缺失；verify随后用默认SID14/spin100000。负值、坏值不能降级成默认。
3. 只识别新hash/salt，不表达旧式 `w:password`、算法扩展等；只有旧修改密码的writeProtection可解析成null。
4. missing edit/none直接null；enforcement未知字面值被当false。原件冲突/重复保护节点、未知restriction、editable range exceptions也未建模。
5. patch移除只匹配self-closing的w前缀；带成对空标签/不同前缀原件改设置可能留旧节点或造重复。

**建议在Mimir适配层新增一个小的namespace-aware settings读取器/补丁器**（已有fast-xml-parser可用，无需换引擎或加crypto库），保留原标签/原始凭据描述。分清“确实没有限制/已明确未启用”“支持的启用限制”“未知或无法判定”。后者显示原因并关闭写入；不要直接对parsed对象填默认。普通打开/读取/下载保留原件字节；修改settings仅替换目标native节点，保留其他内容与未知属性；未知节点和凭据不允许无hash覆盖。现有vendor API只用于已识别且原件形态受支持的情况，不手改vendor。

## 3. 策略归属与最小接口（建议，待实施时定名）

新增 `src/docx-protection.ts`，由 `openDocx` 用原件 `word/settings.xml` 构造**每次解析会话独享**的controller。DocxSession只暴露不可变 `nativeProtection` 描述和无凭据 `access`/订阅；写操作调用session内控制器，不允许调用者用一份更宽松SaveOptions覆盖其判断。

- 三件事实分开：①原件保护描述（不可变，原始hash/salt仅在本地受控层）；②当前文档待保存native设置（正文状态，参与dirty/history）；③本次会话“修改密码已核验”的临时授权（controller私有、只绑定session，不能落文档/Agent）。
- 普通 `writeProtection.recommended` 无密码只是建议，可显式选择“仍要编辑”，不是密码门；有hash/旧式凭据/损坏凭据时未核验默认只读。即使修改密码通过，也只解除该层，documentProtection仍执行。
- `access`最少给 read/copy/find/compare/exportOriginal、comment、checkbox、trackedText、body、structure、manageProtection 及禁用原因；UI不传密码/hash到模型。读取不暴露hash/salt。
- 所有guard取同一controller当前策略，不依赖React闭包的旧bool。策略/授权变动递增 `policyEpoch`，同时让Agent版本发生可观察变化；文档源替换创建新controller。A→B→A重新解析不复活旧授权；普通阅读/布局/拆分切换不应重建controller或误解锁。
- 原件保护是honor-system：守住Mimir支持的编辑/保存路径，不宣称能阻止有文件字节的人手动移除XML或恶意代码伪造事务。用户仍可下载原件；这不等于明文保密。

### PM守卫与变更分类

`src/editors/docx-protection.ts` 提供本地Extension/插件，先拒绝不支持的变化，再执行真实命令；布局/分页/选区等docChanged=false事务允许。

- comments：仅批注mark变化，去掉comment marks后新旧PM doc必须完全等同（含doc attrs/段落/对象）；saveOptions仅comments及必要的原生comment关系变化。不能凭meta字符串或工具名放行任意doc。
- forms：比较变化区域确实是原件真实checkbox glyph，原始control/field marks与其他内容完全相同；支持多个时每一处都验证，普通文字“☐”不算。文字型form/SDT、未建模区域异常不开放。
- trackedChanges：需先证明该具体编辑路径由原生修订记录器覆盖；主PM简单文字与格式可逐种开放，文本框/图表/页眉/样式定义/墨迹等没有对应修订表示的先拒绝。不能仅打开storage就放所有结构写入。
- 子编辑器：父PM过滤保证不落盘，入口禁用+失效局部draft重绘保证不出现虚假成功。优先Mimir扩展/NodeView包装；如需要上游NodeView内部接缝，列为明确同步脚本机械改写并测试幂等，绝不手改vendor。不能只全局pointer-events:none，它会同时挡住选取/查找/复制和forms。

### Agent与附加结构

`createDocxAgentHandle` 通过session controller检查每种实际mutation：read工具保留；execute前、beforeWrite前、updateSaveOptions前、外部网络结果落地前均重验。`beforeWrite`需要具体intent，单个“允许任何写”bool不够。

- add/reply/edit/resolve/delete_comment按comments意图；delete/add还须通过PM comment-only diff。
- 本文/样式/页节/脚注/图片/图表/浮动对象等按body/structure意图，既有host-only工具也同样检查；受限操作明确失败、changed=false、不建round、不增加dirty。
- beginDraft先验证body/trackedText能力；append与commit冻结并重验session+epoch+version；限制变严时中止流，清除不可提交草稿但保留用户可复制内容的明确反馈。discard始终可用，不因限制阻止清理；不因清理错误覆盖后来的dirty。
- undoRound现有setContent+saveOptions恢复必须检查当前epoch和完整restore差量。最小实现：保护变化即使旧round失效；在comments/forms模式，只恢复已验证的同类变化；禁止保护后把旧未修订正文整篇setContent回去。tracked模式第一片禁整轮setContent回退，直到有经过修订语义验证的回退实现；保留明确不可回退原因，不伪称成功。
- `restoreRevision()`取“forced || 原用户选择”，桥finally的setRevisionMode(false)不能关强制修订。强制状态在storage和策略层都核验；raw TRACK_IGNORE/history$不是授权凭证。
- 服务端工具目录可后续按当前能力减少无意义请求，但它不能作为执行权限源；当前本地handle必须最终拒绝。首片不强扩共享协议/改36工具目录，不增加模型保护密码工具。

## 4. 四类restriction权限表

前提：原件restriction明确且enforced=true、修改密码门已通过或不存在。未知模式/凭据、write lock未解都取最严格只读；表格说明**支持的目标权限**，阶段尚未实现的列必须标“暂仅只读保留”。各类均可读取/选择复制/只查找/下载原件/查看对比，不可把对比应用或另存生成受保护内容副本混成只读行为。

| 操作 | readOnly | comments | forms | trackedChanges |
|---|---|---|---|---|
| 普通文字输入/删改/粘贴/查找替换 | 禁 | 禁 | 禁 | 仅已证明产生原生修订的主正文路径 |
| 文字/段落格式与表格编辑 | 禁 | 禁 | 禁 | 每项有原生修订表示才开；未证明的禁 |
| 批注增删改、回复、解决 | 禁 | 允许，严格comment-only | 禁 | 可允许独立批注；不可伴随删改正文 |
| 真checkbox切换 | 禁 | 禁 | 允许，原件控件+glyph+marks准确验证 | 首片禁；上游checkbox主动TRACK_IGNORE，不可偷用一般文字权限 |
| 文本form/SDT填写、任意内容控件 | 禁 | 禁 | 暂禁，未有可靠原生字段更新合同 | 禁，除非另外证明对应修订 |
| 文本框/图表/域等子编辑器 | 禁 | 禁 | 禁 | 首片禁；不能将attr覆盖当文字修订 |
| 页眉页脚/样式定义/页节/水印/墨迹/主题 | 禁 | 禁 | 禁 | 禁，未建模对应结构修订 |
| 接受/拒绝修订；关闭强制录制 | 禁 | 禁 | 禁 | 禁 |
| 保存当前允许编辑 | 无改动返回原件/下载 | 允许批注变化且保留限制 | 允许真实checkbox变化且保留限制 | 仅已验证修订变化且保留限制 |
| 改/移除限制 | 专用管理动作，现有凭据核验后 | 同左 | 同左 | 同左 |
| Agent草稿/整轮恢复 | 禁 | 禁正文草稿；限同类批注恢复 | 禁正文草稿；限真实checkbox恢复 | 草稿仅记录型写路径通过后开；普通整篇snapshot恢复禁 |

如果原件带editable-range exceptions、节级表单例外、未知保护属性影响权限：此片不解析为授权范围，显示“该保护配置暂不支持编辑，原件保留”。不要自行推断“没有在禁止区就能写”。

## 5. native保存、history、密码核验身份

### 保存不能成为旁路

- 原样保存保护节点与settings其他内容逐字节不变；无授权传入`protection:null`/`writeProtection:null`/`partXml['word/settings.xml']`及partBinary覆盖一律拒绝。不允许调用者改session公开parsed对象后骗保存策略；策略源与原始tag快照在controller私有保存。
- session.save对edited与options的最后变化重验：comments/forms对原件PM与允许基线作语义diff；tracked路径拒绝未知差量，不能只检查“有一个ins mark”。保护设置更新本身也必须有controller核验过的current状态。
- 新增保护时，此前已有的合法未保存编辑仍可一并保存。**不能拿新readOnly策略简单与原件全量diff并拒绝已有编辑**。启用保护之前先flush合法子编辑，冻结当时已批准的PM/options为保护激活基线；之后的变化才受新限制。基线是该会话批准写入的checkpoint，不是允许任意最后一次edited。
- 保存冻结session/editor version/policyEpoch/native设置快照；序列化后、source.save前再验身份。成功只提交那份字节和保护基线；保存中有更新继续dirty，失败保留待保存设置与授权状态但不谎报落盘。现有source.save文件先于索引路径继续复用。

### 设置属于文档状态，授权不属于history

- 待保存保护描述（不含明文）建议放本地doc attrs，经单一保护命令变更，供同一PM history和dirty识别；save适配只把当前已授权native设置转为SaveOptions。要检查doc attrs不能从paste/Agent/compare apply任意更宽松覆盖。
- `filterTransaction`对任何保护attr变化（含undo/redo、setContent、round restore）均检查控制器批准的“当前→目标”transition；无令牌禁止降低保护。令牌是controller临时对象身份、只绑定当前session/epoch/源目标指纹，不能用公开meta字符串true授权。
- Generic history不是绕过密码通道：设置带密码保护后立即点undo也不能无核验移除。没有授权时保持当前状态，提示走“停止保护”核验；通过后专用动作执行那次transition。策略跨越时关闭PM history组、使旧结构round失效；不把临时解锁、密码、授权对象存进PM文档/history/saveOptions。
- 这意味着“内容撤销可在当前模式允许范围内执行”，“保护设置撤销仍走同一密码合同”；不保证所有跨保护边界的旧undo都能执行。UI需给出阻止原因，不静默吞按键。

### 凭据规则与异步竞态

- 只有**明确无凭据**可不输密码停止/改设置；hash缺salt、未知SID、旧式password、算法扩展、空/坏字段或超预算都为无法核验，保留限制且不提供强制清除。
- 支持新式SID14才复用vendor `hashProtectionPassword`/`verifyProtectionPassword`。入口先验证完整字段、base64、64byte hash、合法salt、safe integer spin0..MAX（默认只在字段真正缺省且该scheme允许时）；捕获异常，未知/错误区别于密码错误。
- 不额外写密码算法。verify现有函数没有AbortSignal，且逐digest最坏百万次；优先用小Worker调用同一vendored纯函数，取消/超时终止Worker。若首片不用Worker，必须中止结果落地且承认计算不能取消；不以Promise.race冒称已停止CPU。实现预算应明确，大于支持预算直接不可核验，不偷偷截断迭代次数。
- UI提交时捕获documentId+解析session对象+原始字节身份+policyEpoch+native配置指纹+editor version+请求序号；任一变动、关闭面板、切源或取消使结果失效。不存在“刚核验旧文件却解除新文件”的窗口。
- 当前hash/salt只给本地核验；密码留局部受控输入，核验后清输入并销毁Worker，不进Agent prompt/工具参数、notice、日志、持久设置、URL或history。JS内存无法保证物理擦除，不作虚假承诺。
- 两种密码门独立：修改密码核验用于本次会话可写；编辑限制密码核验用于修改/停止该restriction。有两者就分别满足，不能一把钥匙默认解两个。

## 6. 最小阶段与文件所有权

### P0：先尊重已有原件（最小可交付片，建议先批准）

**边界：不提供设置新密码、移除保护或整文件加密按钮。** 原件限制解析/状态展示/执行防护先闭合。四个已启用模式、未知保护和未解修改密码先保守只读；明确提示comments/forms/tracked写入尚未支持。只读功能照常可用，允许明确recommended-only选择继续编辑。无保护文档保持既有编辑。

预计文件：新增`src/docx-protection.ts`及纯测试（解析、不可变策略、save检查），`src/editors/docx-protection.ts`及真实编辑器测试（PM/NodeView），改`docx.ts`与`agent/docx-agent.ts`/测试，待compare/split交接后改`DocxEditor.tsx`及新增`DocxProtectionControls.tsx`（Review具名Inspector，只展示状态/原因）。读取原件时检测加密容器只给准确不支持提示，不实现decrypt。不要触碰compare/split实现。

### P1：窄范围comments与forms

在P0守卫上分别打开comment-only与真实checkbox；每个模式独立测试与验收。已有writeProtection SHA512本次会话核验可在此引入，未知凭据继续只读；其他restriction仍不解除。新增文件仅在保护模块/面板/worker及相应测试，NodeView适配按P0已确定接缝继续。

### P2：原生设置、停止保护和history

接上用户主动启用/修改/停止documentProtection与writeProtection，复用vendor SHA512；加namespace-aware原生节点补丁、doc attrs/保存计划及transition校验、保存竞态测试。面板分“当前限制→选择模式→设置密码（可选）→启用”与“当前状态→停止→输入现有密码”，不同时堆满三类密码字段。宽度320px、420px覆盖、底部固定主动作、Escape先关闭最近层，焦点按当前可见Ribbon组入口返回。

### P3：trackedChanges可证实范围

复用原生记录器，先主正文文字输入/删除/格式并验证保存与accept/reject结果；表格/对象/跨段/AI apply_ops逐项放开。所有尚未验证的结构仍明确禁。forced与桥finally、历史、草稿、整轮恢复单独验证；做到这一步后才能说四类原生限制在受支持编辑范围内均可执行，不能在P0贴“完整原生保护”。

### P4：整文件加密单独立项/批准

见下一节；本轮不装officecrypto、不加服务端密码请求、不改存储/索引合同。个人信息移除是另一已有功能的独立设置，不因保护面板顺手合并范围。

## 7. 整文件加密：实际能力与明确隔离

固定上游 `apps/docs/src/main/docx-encryption.ts` 已实际核对（本地sparse副本缺blob时取fixed raw源码，证据`/tmp/mimir-docx-encryption-fixed.ts`）：

- 依赖`officecrypto-tool` **0.0.19**（上游package-lock；package.json ^0.0.19），CFB/OLE2含EncryptionInfo/EncryptedPackage；解Standard AES128/SHA1与Agile AES256/SHA512，写Agile。`decryptDocx`区分wrong-password/unsupported，`encryptDocx`返回CFB。
- `docs-main.ts:2678–2720`打开先解密再解析；3552–3584保存冻结密码intent，写盘后commit；`docx-encryption.ts:64–230`区分磁盘密码与下一次保存intent，并按renderer+path隔离、保存成功才提交，恢复副本也保持加密。它是Electron主进程+文件路径方案，不是浏览器保护函数。
- Mimir当前`openDocx`先BoundedZip/JSZip、`EditorIo`字节load/save、知识库替换后提取正文索引；没有上述打开解密/保存重加密与密码意图合同。把SHA512 restriction hash写settings或给ZIP加一字段都不是加密DOCX。
- 若后来做整文件加密，先决定原件仍为CFB时服务端如何提取/索引、是否仅会话解密导入、保存失败与重开/下载如何始终保持加密、web/desktop运行边界及密码去向；这会触及后端/共享/Renderer合同，不属于当前最小保护片。不得在未知密码状态时把明文ZIP写回原件；无法正确解密就保留原件并拒绝编辑。

## 8. 阶段验收（计划，未执行）

1. 四种enforced原件+未启用/无保护+recommended-only+修改密码；未知edit/前缀/旧凭据/坏base64/负数或非整数spin/SID/重复节点都验证准确保留与fail-closed。
2. 手动键盘/粘贴/拖拽/查找替换/工具栏/undo-redo、protected table/文本框/图表/公式/嵌套表格、墨迹及compare apply，禁止路径PM、DOM可见反馈、dirty都无假成功；只读查找/复制/对比继续。
3. Agent所有写分支、host-only工具、updateSaveOptions、begin/append/commit/discard、外部图片迟到、undoRound；不修改工具名单就能直接执行的路径也必须挡。
4. comments精确mark diff与附加批注关系保存；forms只改真实glyph保留marks与原native字段，普通☐/任意文本不能获得权限。
5. trackedChanges强制storage、bridge finally、禁止accept/reject、TRACK_IGNORE/history$伪装、跨段/格式/对象拒绝；保存后独立原生XML读回，不能仅断言有ins标签。
6. 错密码、unknown hash、取消/关Inspector/切源/A→B→A/源相同ID新字节/保存中改保护；输入不进入输出或序列化；worker终止后迟到结果不落地。
7. 未动settings逐字节保留；设置/移除单次保存和再次独立重开、二次保存；未改ZIP部件不变；失败不清dirty，成功仅提交捕获版本；直接session.save(options绕过)必须失败。
8. P0–P3每片只跑对应有意义测试与office类型/lint；真实浏览器420与问AI中栏的Inspector状态、可复制只读、禁用原因、键盘与保存重开由root后续授权验收。本研究不上传测试文件、不要求用户在聊天给密码。
