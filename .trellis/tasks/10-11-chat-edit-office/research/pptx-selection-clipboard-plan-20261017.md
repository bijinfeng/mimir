# PPTX 统一多选内部剪贴板接缝复核（2026-10-17）

本片为只读方案和交接，没有新增生产实现。复核者保持 trellis-check 角色，由主会话安排实施并集成 Editor。

## 固定来源与适用范围

- GenOffice `/tmp/mimir-genoffice-html-git` 本次 `git rev-parse HEAD` 确认为 `480548fd55f1be3593ee0d8e316a734751d58309`。
- `apps/slides/src/renderer/clipboard-actions.ts:29–78` 的 copy/cut 使用完整 `selectedIds`。copy 立即保存可编辑对象，预览PNG稍后写入且令牌防迟到覆盖；cut在copy成功后再删除。`pasteClipboard` 内部对象粘贴后选择新建sourceIds。上游renderer语义可参考，但其“先复制再另一次删除”的实现不能照搬为Mimir的一次原子历史。
- `apps/slides/src/main/slides-main.ts:3442–3462` 的 copy-elements 只在 `slide.elements` 查找，过滤不存在对象；并无直接group child提取。`3470–3499` 的paste以原生 `pasteElements` 单事务执行，按页面占用累进偏移。Mimir现有显式190500EMU偏移可保留，不能宣称已具有上游cascade。
- 固定vendor `pptx-engine/src/index.ts:3923–4055` 的 `copyElementData` 收集当前patched XML、rId及跨文件资源；`pasteElements` 共享相同依赖、重新分配cNvPr与creationId、替换关系、只偏移最外层off后整体重新解析。不得让浏览器上传任意XML/items以绕过server-issued ref。
- WeKnora官网本次HTTP200，快照 `/tmp/mimir-clipboard-weknora-home.html`；公开v0.8.3 commit `3e22822c1d2397be730c458c7539d0eb8c113a24` 的 `internal/agent/tools/definitions.go` 本次HTTP200，快照 `/tmp/mimir-clipboard-weknora-definitions.go`。其 `read_document/list_documents/search_knowledge` 是知识库工具；29–45行强调会话能力控制workspace文件访问。适用于Mimir保留当前文档/宿主/权限和资源边界，没有Office对象剪贴板或组内几何语义，不能用于决定工具栏或成员复制算法。

## 现状与最小缺口

1. `PptxClipboardControls.tsx` 只有 `elementId:string|null`，copy/cut构造 `[elementId!]`，无统一refs。组件pending ref仅防重复请求，未随选区/页/文档变化abort，也未在返回前判断自身仍为发起上下文。Antd的Select仅由fieldset禁用不可靠，必须显式传disabled。
2. `PptxEditor.tsx:1855` 的 `runClipboard` 经withManualWrite和manual_asset，已有expectedVersion/roundId及真实changed控制dirty/history；缺signal和选区/页/面板所有权绑定。返回数据中的 `elementIds` 未重绑到统一多选。
3. shared `pptx-agent.ts:86` 已允许1–100个elementIds；server `pptx-manual-clipboard.ts:227` 同样仅解析slide.elements。现服务只检查字符串重复，同一对象的runtime/GUID/cNvPr别名可以重复命中，须按解析后的对象身份去重。新的直接成员合同必须带显式parent group，不能在整个文档递归猜同名id。
4. `pptx-selection.ts` 已有contexts/resolve/normalize，normalize排除父子重叠且保留首次cNvPr别名。剪贴板需要“所选对象本身”，不能使用 `pptxExpandSelection`：它会把整个group变为直接成员并跳过深层group，破坏整组复制语义。无效refs也不能沿resolve的filter静默丢失；每个输入必须严格得到一个目标。

## 直接成员的关键边界

- raw child XML使用父组合的chOff/chExt本地坐标，父rot/flip也影响可见几何；直接copyElementData(child)后粘至slide会变位置或角度。
- native `ungroupElement`（index.ts:4181）只按ext/chExt计算平移与缩放，保留子rot；没有合成父rot/flip。不能以scratch ungroup宣称任意变换的成员复制正确。
- native `deleteElement`（core-ops.ts:36 / engine insert.ts:594）只接受顶层；Mimir `hostedOps` 的GROUP_OPS白名单故意不含deleteElement。不能放开白名单传group后期待native支持。
- native `pasteElements` 重新编号cNvPr，但其实现没有同步改 `<a:stCxn id>` / `<a:endCxn id>`。带连接线的多对象与部分组复制须有明确重映射/拒绝策略，不能把可见线条还在当作连接语义已保留。

### 推荐最小可靠语义：保留父组合包装

复制直接成员时，按顶层父组合归并，每个父产生一个仅保留所选直接非组合成员的grpSp副本，完整保留父xfrm/chOff/chExt/rot/flip。粘贴得到新独立组合，维持原可见几何；UI必须明确“组内成员以独立组合粘贴”。整个顶层group仍按一个原样对象复制，不下穿。深层选中的成员/直接子group仍明确拒绝。

这需要产品/实施选择；若要求成员粘成裸对象，则须另做严格仿射变换适配并测试非等比缩放+旋转等不可简单表达的情况，不能静默使用不完整ungroup。复核者没有擅自选择或修改公共接口。

剪切时先生成完整待存bundle，再在宿主私有opened上移除全部目标；验证所有目标成功后一次save/回传。可复用固定引擎公开 `groupChildSlices/patchGroupChildXml` 通过nvId定位实际直接slice，更新children并标structureDirty。父中剩余成员的XML和父transform应逐字保留；全部成员切除后删除空父而非制造悬空组。必须复用 `pruneTimingForSpids/cNvPrIdsInXml` 清掉被删成员的timing；`resource-cleanup.ts` 导出的 `cleanupDeletedElementResources` 在真实剩余模型上清理关系/孤立资源，保留被其他成员或页面共用的media。不能只删除XML而留悬空动画，或只filter模型而未改父XML。

server在原件私有解析副本上先严格验证全部目标，完成并preflight后才发布字节和ref，异常丢弃副本；沿现有TTL15min、最多12项/合计64MiB、source document存在检查、server-issued UUID ref和取消守卫。取消后最多遗留不可达短期cache，不得发布UI成功或画布修改。

## 建议合同与主会话 Editor 接口

建议由实施者在shared clipboard copy/cut arm中为现有elementIds路径保留兼容，新增明确 `targets:[{elementId:string,group?:string}]` 选择方式；用union/refinement保证二者恰有一个且1–100项。不要让浏览器发送XML/parts。严格拒绝重复对象、错误父、祖先重叠、失效/深层目标，错误时整批不写。是否由UI normalize父子重叠是现有选择语义；宿主仍应拒绝恶意重叠。

组件建议增加：

```ts
elements: readonly SlideElement[]
selectedRefs: readonly string[]
contextKey: string // documentId + native slide.path + selectionBinding + published version
disabled?: boolean
execute: (
  input: PptxManualAsset,
  options: { signal: AbortSignal },
) => Promise<Record<string, unknown> | null>
```

`elementId`可为过渡兼容保留，Editor的唯一集成由主会话负责。执行器以发起时published version校验handle/session、活动页、统一selectionBinding，持有对应AbortController并传给manual_asset。关闭工具Inspector/切目标/切页/切文档均abort；返回后版本和信号仍由活handle复验。不能只靠组件检查响应而让旧cut/paste已经写入画布。全局withManualWrite继续覆盖保存/history，组件同步pending防同tick二次提交。

成功copy保持version/dirty/history；成功cut/paste只建立一轮历史。paste返回 `data.elementIds` 为当前重解析ID，主会话确认同handle/页/已接受版本后解析新统一refs一次性选中新对象；cut成功清理被删refs并保留未删选择。不能在成功后因旧面板cleanup abort而报取消，也不能把旧成功选区覆盖用户后来的选区。

布局继续复用既有紧凑Inspector：复制范围、所选数量、可理解的成员包装说明、短复制/剪切动作和粘贴卡片；底部动作可达、420px不横溢出。busy期间Select需显式disabled；错误保留上一次有效clip并允许重试，迟到旧copy不能覆盖新的clip或恢复旧状态。系统剪贴板文本、外部图片、PNG副本、快捷键仲裁和上游累进偏移不在本最小片，列为后续边界。

## 必要验证矩阵

- 纯选择构建：顶层多对象、整个group不展开、直接成员按父归并、首次别名稳定、父子重叠/别名重复/错误父/失效/深层输入拒绝。
- 真宿主：多对象copy不dirty；混合顶层+两组成员cut/paste，文字/图片/关系/主题/未选兄弟/父xfrm保持；rot+flip+非1:1 chExt的可见坐标保持；所有成员剪切后无空组；共享media不误删；目标动画清理；连接线引用按明确策略处理。
- 原子失败：valid+invalid不能局部删，失败不得更新clipboard ref；取消、TTL过期、源文档删除、错误ref类型、恶意raw XML、超100目标/64MiB继续拒绝。
- 真Editor挂载：重复点击一次调用，等待时保存/选择锁定；旧copy/cut/paste的关闭、目标、页、文档、并发版本都不得迟到落地；正常成功一次history，save/undo/save/redo/save逐ZIP entries核对，粘贴新对象统一多选及后续格式编辑可继续。
- 浏览器由主会话验宽屏与420px、固定动作、选择数量和完整下载回存。当前无模型配置，仅检验内部工具，不冒报真实模型/系统剪贴板/Desktop。

## 交接状态

没有修改PptxEditor、ClipboardControls、shared schema、server或任何vendor。本片只写本研究文件；实施需由主会话/实施角色承接，完成后本reviewer可独立检查。
