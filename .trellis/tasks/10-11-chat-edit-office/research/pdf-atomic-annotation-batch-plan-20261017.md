# PDF 原子批次的三个剩余操作：实施前研究

2026-10-17，当前为只读研究及候选边界，尚未批准实施，不能计为已完成。

## 证据与适用性

主参考 GenOffice 固定 `480548fd55f1be3593ee0d8e316a734751d58309`，本地 `/tmp/mimir-genoffice-html-git` HEAD 已复核。`apps/pdf/src/shared/op-docs.ts:26,52,85` 提供 removeMarkup / setNoteContents / removeTextInsert；`renderer/ai/tools.ts:3266–3300` 将前两者限定为 P 前缀的待保存批注，后者限定为 T 前缀待保存插字。`renderer/edit-ops/ops.ts:83,171,319` 实际修改对应会话数组，并非原件对象操作。

WeKnora 官网本轮 HTTP 200 原始证据 `/tmp/mimir-pdf-batch-weknora-site.html`；v0.8.3 固定 commit `3e22822c1d2397be730c458c7539d0eb8c113a24` 的 `internal/agent/tools/definitions.go` HTTP 200 保存为 `/tmp/mimir-pdf-batch-weknora-definitions.go`，与前轮固定文件 SHA256 一致。第35–49行按真实 sandbox 能力注册工具的模式适用于能力如实门控。其知识库/Agent API 不提供 PDF 批次原子性或 Office Ribbon，不作该工具外观/编辑实现依据。

## 本地事实

- `pdf-agent.ts`：纯页面 apply_ops 仍在引用布局中预检一次后提交；包含 form/metadata 时进入 contentTool。
- `pdf-content-agent.ts:188`：将 apply_ops 解析为 `pdfFormOperationSchema`。因此纯 forms/页面可用，metadata 仅由 PdfEditor 的 local 分支截获；不能仅在公共目录加名称。
- `PdfEditor.tsx:1382–1610`：真实内容发布有当前句柄、字节、版本和取消校验。当前所有内容操作都拒绝未保存插字。`writePendingInserts` 会先从 pending.base 重建全部插字，再直接提交，不能在批次中调用多次后声称原子。
- Mimir 批注立即写进工作字节，使用真实 NM 或旧对象引用身份，没有上游 P…会话批注层。专用 delete_markup / edit_note 已存在。新增同名批次操作必须明示接受的是当前 `read_annotations` 的真实 ID，不能伪造 P ID。
- `pdfLocalOperationSchema` 目前仅 form/page/metadata 白名单。local 宿主允许临时字节计算并只返回最终结果；表单已具有 preserving guard。`applyPdfAnnotationOperation` 默认的严格原文 guard 拒绝任何非 Type/Pages Catalog，不能为了混批全局放宽它。

## 候选最小边界（待实现者细化/根确认）

1. 新批次 schema 严格接受原有操作加 removeMarkup `{id}` / setNoteContents `{id,contents}` / removeTextInsert `{id}`，1–30项。前两者按当前批注 ID 唯一解析类型；后者仅当前待保存 T ID。未知、重复消费、错误类型、空文字、额外字段均拒绝。
2. backend 只处理页面/表单/metadata/原生批注，不接 pending T ID。可在临时字节中依序执行、逐步读回实际页和 ID，最终一次返回。dry_run同样完成真实校验和序列化，不返回工作字节。现有严格批注调用保持不变；若需要 preserving 注入，局部显式入口并沿现有结构守卫，不修改全局原文/PDFium白名单。
3. pending text 必须先在独立候选状态删除已验证 T ID，随后从 pending.base 生成候选字节。现有直接 publish 的 writePendingInserts 不能作为批次中间步骤。取消或后续坏操作都须保留当前字节、pending、dirty/history；最终只发布一次。
4. 页面操作与 surviving pending text 的页序/旋转/删除映射需要明确方案，不能把已烘焙 currentBytes 当可删插字的 base。若采用先重建 surviving 插字、再做原生页面批次，则需要如实说明成功的页面批次会将幸存插字物化、T ID失效，与现有页面保存语义一致。无页面操作时可保留以修改后 base 为底的可编辑pending身份。应由实现者给出具体原子发布状态与native测试，再批准代码。
5. 不加新的手动面板；现有专用手动工具和同一历史沿用。此片是 Agent apply_ops 的组合能力，不扩 OCR/签名/图片搜索生成/任意结构支持。

预计必要文件：shared pdf-agent schema；server pdf-local、pdf-annotations 的显式局部接缝及新batch helper/原生测试、pdf-agent-catalog；Office pdf-agent 分发、PdfEditor staged candidate publisher及helper、真实Editor/native history/取消/dryrun测试。renderer HTTP沿已有local接口，若契约无需新字段不改路由。

下一步：实现者接手后细化 pending几何/身份/原子状态及守卫设计，根会话确认后再写生产代码。独立checker及浏览器复用现有专用工具创建的真实原件验证单次保存history；无真实模型调用不能写成模型端到端通过。

## 2026-10-17 接续细化：幸存 T 的几何、身份与一次发布

**状态仍为只读方案，未写 PDF/shared/server 生产代码，待 root 确认。** root 已明确：无页面操作尽量保留幸存 T；有页面操作可物化并失效 T，与现行页面操作语义一致；原批注/原文 guard 不全局放宽。

### 新核对证据

- `PdfEditor.tsx:196,1235–1331`：pending 持有未烘焙 `base` 与插字数组；当前重放把显示坐标 `(x,y+fontSize)` 经真实 PDF.js scale=1 viewport 转为 PDF user point，然后 `hostApply(kind=insert)`；该函数直接改 working/pending/snapshot，不能复用为批次中间步骤。
- `PdfEditor.tsx:1386–1608`：已有操作能在局部变量里物化 layout 和执行 host，最后发布；但对任何 pending insert 一律拒绝，且 info/forms/image cache 在最终几何验证前已更新。新批次候选必须连派生 cache 一起延后。
- `pdf-agent.ts:258–294,442–463`：新批次必须从 page-only fallback 之前分发到 content hook，仍由 handle 在 hook 返回 `changed` 后只增一次 version/round checkpoint；不能在 helper 里调用 handle.execute/notifyExternalChange 或 `applyPages`。
- `pdf-working-copy.ts`：可在局部 bytes 变量多次请求 `expectedVersion=liveV`，每个临时写响应为 `V+1`；这是请求级合同，不是可以累计的 live version。layout 物化 helper 本身不发布，可复用。
- `pdf-agent-host.ts:302,343`：现有 insert 也是 PDFium 写入且严格仅允许 Catalog Type/Pages；原文、图片、redact 路径沿此 guard 不变。`pdf-local.ts:613` 的 setMetadata 只改 Info 并去旧 Metadata，空 outline 不新增 Catalog；普通 metadata+T 因而可沿原严格 insert 路径。真实 AcroForm 与当前 pending T 本来不能同时通过插字入口，不能为了假设状态新开 preserving PDFium writer。
- `pdf-annotations.ts:25–70,165–172`：有 NM 用 NM，无 NM 为 R对象号-generation；重复 ID 拒绝；edit_note 会把 legacy R ID pin 到 NM。R 对象引用不能假设跨 PDFium 重写恒定。Mimir 创建的 N… NM 可稳定复用。
- 本次重新访问 WeKnora 官网和固定源码均 HTTP 200，保存 `/tmp/mimir-pdf-batch-refinement-weknora-site.html`、`/tmp/mimir-pdf-batch-refinement-weknora-definitions.go`。后者 SHA256 `3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0`，与前轮一致；v0.8.3 / commit 不变。GenOffice 本地 HEAD 再核为 `480548fd55f1be3593ee0d8e316a734751d58309`。适用边界同上，未将 WeKnora 当 PDF 实现参考。

### 1. 严格编译一次，再进入候选计算

`apply_ops` 统一严格 schema：原 rotatePages/deletePage/setPageOrder/setFormValue/setMetadata 加三个新操作，仍 1–30 项、额外键拒绝。removeTextInsert 只接受**本次冻结 pending 数组内唯一 T ID**，按批次声明顺序消费，重复删除/不存在/保存中前缀均整批拒绝。setNoteContents 只接受读取到的 note 或 reply ID，文字 1–10000、trim 后非空；removeMarkup 只接受 highlight/underline/strikeout。不能把 note 当 markup 删除，也不能伪造上游 P layer。

编译时扫描整个原批次，因此位于 rotate/delete 后的 removeTextInsert 仍是删除一个**批次开始时**的 T 对象，成功后才物化其余幸存对象。公开描述需直接说明这条 staging 语义；不要先物化后再因 T 失效拒绝同批后面的删除。T 的此规则不改变页面 op 按声明顺序取当前页号的合同。

backend 只收 native 子批次，不收 T ID；前端删除 T 子操作以后必须保留原 `opIndex` 用于错误说明/结果对齐。native 批次不得再按 form/其它 filter 两组后宣称顺序一致：页面删除前后的批注可达性按逐项当前页状态验证。例如 deletePage 删除某 note 的页后 setNoteContents 该 note 应失败；先 edit 后 delete 可成功。

### 2. 冻结完整状态；候选 helper 不发布

冻结 `documentId`、handle identity、live version V、source bytes identity、snapshot bytes identity、pending 对象和 base/inserts、settled layout/imports identity、saved baseline 和保存状态/token。所有异步边界前后及最终发布前都调用同一个 assertCurrent：取消、换源、外部写、history、保存基线变化、pending 变化均拒绝迟到结果。

新增纯候选编排 helper（建议 `agent/pdf-batch.ts`）接收以上冻结值及临时 host callbacks，返回：

```
{ bytes, structure, pages, nextPending, activePage, info?, forms?, annotations?, result }
```

helper 不能 setState、io.save、markSaved、下载、applyPages 或通知 handle version。提取现有重放里的**坐标转换/hostApply/readPdfPages**为候选函数；原 insert/edit/move/delete 的 writePendingInserts 仍可在候选函数成功后沿原发布路径，防止复制两套算法。

### 3. 无页面操作：保留幸存 T

1. `survivors = frozen.pending.inserts - validated removed T IDs`；保留顺序和每个对象的 id/pageIndex/x/y/text/fontSize/color，不能生成新 T ID。
2. `base0 = frozen.pending.base`。绝不能从已含全部插字的 snapshotBytes 重建，否则被删文字仍在底层。
3. 对 base0 执行 native 子批次，获得 base1。没有 native 操作时保持 `base1 === base0`，避免无理由的序列化/dirty。
4. **验证页数及每页有效几何不变**：PDF.js scale=1 的 rotation、view box、viewport transform/width/height 必须一致（浮点容差仅覆盖解析精度，不容许真实变换）。no-page 分类包含 form/metadata/批注，不允许暗中改变几何。
5. 用 base1 的真实 viewport，对每个幸存对象调用 `convertToPdfPoint(x, y+fontSize)`；沿现有范围检查与严格 hostApply(kind=insert) 一次重放全部幸存。0 个幸存时直接返回 base1，不请求 insert。
6. `nextPending = survivors.length ? {documentId,source,base:base1,inserts:survivors} : null`；发布字节是重放输出，**pending.base 是未烘焙 base1**。后续 edit/delete 某个幸存 T 再以 base1 重建，native 批注/metadata 不会消失。

这条路径不修改坐标或 T 身份。若 base1 不再满足原严格 insert guard，整批拒绝并保留原状态，不转为物化成功、不新增通用 PDFium preserving 开关。有效现行状态里 metadata/普通批注可支持；不存在的 form 字段或人工构造的 AcroForm+T 状态仍按真实原因拒绝。

### 4. 有页面操作：先重建幸存字，再顺序 native batch

1. 仍从 base0 删除指定 T 后，一次重放 survivors 得 candidate0；该时刻使用**原页**的 rotation/CropBox/viewport，禁止把 display x/y 直接当 user coords。
2. native 子批次在 candidate0 上按声明顺序执行 rotate/delete/order/form/metadata/批注，所有页码按当时页列表。文本已是普通 native content，页面旋转天然跟随；重排随原页对象移动；删页同时删其文字，不需要另算 T 坐标映射，也不会将老 pageIndex 写到新页。
3. 用最终 bytes 独立读取 pages/geometry/annotations/forms，`nextPending=null`。成功摘要明确说明“幸存插字已随页面操作物化，原 T 标识不再可编辑”；同一次 undoRound 恢复 batch 前 pending/base/bytes/页布局，redo 的手动 history也只是一帧。
4. 原本已有 settled layout 但无 pending 时，先用 buildPdfWorkingCopy 临时物化 layout，再进入 native batch；这不导致中间发布。若内部状态同时有不可证明映射的 pending 与未物化 layout，则拒绝，不能猜 pageIndex。

只因批次语法出现页面 op 就采用此合同，包括旋转后反向旋转等净几何不变的情况；避免 UI 声称 T 可编辑而底层已物化。

### 5. native 批注身份及局部 guard

- native helper 建议新 `pdf-atomic-batch.ts`，对一个加载的 pdf-lib 图按顺序 mutation；抽取现有批注 mutation/readback，不在循环中调用会自行 serialize 的公开工具。这样 legacy R 对象身份在本次 native batch 内不漂移；edit legacy note 仍按现有行为 pin 同一 ID 为 NM。
- 新 batch 显式使用 `assertPdfPreservingSafe`，批注 helper 通过**局部显式 guard 注入**复用它；默认调用继续 assertSafeToRewrite。表单继续 assertPdfFormSafe + preserving guard，tagged page-tree/Widget deletion/外部动作/XFA/签名/未知 Catalog 保持现有拒绝。禁止新增 skipGuard/boolean bypass。
- pending.base 与 snapshotBytes 之间可能已经经过 PDFium；**有 NM 的 batch 目标**必须在两份字节中唯一存在，type/原页 owner/内容/线程关系相符，再按同 NM 绑定到候选。不要只用页面文本或坐标猜目标。
- **legacy R + pending 的最小明确边界**：仅当 native identity 可以在 base/current 的原始 annotation graph 中证明一致才接受；数值 R 相同或 type/text/rect 相同不足以证明。当前系统没有此映射账本，首片应如实拒绝无法证明的目标，提示保存当前插字后重新读取批注；普通无 pending legacy R 继续支持。不得未经验证把 current R ID直接用到base或PDFium输出。
- 若 root 要求首片同时完整支持 legacy R+pending，可另加“首笔前的身份账本”纵切片：在 detached replay 输入为 legacy annot 设置 NM=原 R ID，raw pending.base 仍保留原字节，显示/重放仅用规范化候选；删除全部 T且无native变化可回原base。需额外保存/取消/history/线程/非目标字节证据，**未纳入默认最小片**。不能悄悄写入所有原件注释以绕过身份验证。
- 对页面分支的 pending survivors，native batch 目标在烘焙前后必须仍按上述规则唯一解析；丢失/类型变化/重复 NM、未知 reply 语义全部整批拒绝。结果返回当前 annotation snapshot；旧版本的 R ID不承诺跨整次变更仍有效。

### 6. 一次发布、dry-run、失败

所有 native 操作、重放、严格 guard、PDF.js 读回和最终几何先完成；dry_run 也走同一候选计算，只丢弃候选并返回摘要，不产生 working bytes、pending、dirty、selection、Inspector cache 或 history/version 改变。每个临时写请求传 V，验证其返回 V+1；最终只有外层 handle 在 `changed=true` 时增到 V+1，绝不累计多个 host 响应版本。

唯一同步 publish 段依次更新 refs 和 React state：working/structure → nextPending → edit=null → snapshot/pages/activePage → 失效选区/旧cache → 当前结果cache → dirty回调，期间无 await。dirty 对当前 savedBaseline 比较，不能总写 true：只删完未保存 T 且回原base可恢复 clean。保存成功基线不在此批次修改。

捕获点用 handle 已有 captureState，包含原 working/edit/snapshot/pending；一个 changed 批次只建一个 round checkpoint。任何候选错误/取消/迟到直接抛给现有失败结果，不需要“先提交再 rollback”。contentBusy/abort 清理可沿 runWithCleanup，但失败不清空用户原 pending/selection/draft 或暴露部分 info。

### 7. 必要验证门与生产所有权建议

按依赖顺序写目标专项，root 再统一 build/browser：

1. **native batch**：NM note/reply setContents、精确单 markup删除、表单+metadata+旋转/排序/删除；逐项页语义；错ID/错type/重复删除/末项失败前项零落地；未知Catalog/XFA/Sig/活动动作/Widget/tagged guard保持；原非目标 streams/图片/线程/页及图形 payload保留。
2. **真实 pending replay**：T1/T2删T1+改N，当前字节无T1、T2保留，base有新N且无T1/T2；再move/edit/delete T2仍保留新N。metadata同批、删尽恢复base、二次保存。R+pending 不可证明身份的失败要有原状态精确不变测试。
3. **几何**：真实 PDF.js Rotate0/90/180/270及offset CropBox；无页面batch前后T2相同display坐标和user origin；有pagebatch T2先按原viewport物化，再按实际新页/旋转读回；删除其页不把字错落邻页。包含重复正文以防误读文本命中。
4. **Editor/handle**：只一次 changed/version/dirty/history publish；dryrun全候选但全状态不变；末项错误、重放失败、几何失败、abort、换文档、history、保存竞态、pending修改迟到，断言bytes/pending/base/layout/dirty/history均精确保留；undoRound恢复T1/T2与旧N，后续人工改动拒绝旧round回退。
5. **真实浏览器**：已有手动工具建N与两段T，apply_ops契约驱动无模型执行，单次保存后原生读取与undo/redo下载对比；宽/420无需新面板，现有 pending面板仍识别幸存T；有page操作后明确失效T。无模型不能称Agent模型端到端通过。

预计生产所有权保持原计划：shared schema；server batch/annotations局部guard/local/catalog与native tests；Office agent分发、候选helper、PdfEditor最小publish与tests。原文writer、vendor、renderer宿主接口无必要不改。**当前只完成研究，以上生产改动均待 root 确认。**
