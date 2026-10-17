# PPTX 批量图片项目符号实施结果（待独立检查与浏览器）

2026-10-17 16:47 Asia/Shanghai。实现已冻结；以下是实现者验证，不代替独立 checker、生产浏览器或真实模型验证。

## 变更

- `packages/office/src/editors/pptx-selection.ts`：去除批量 blip blanket reject；选图提交前完整核对所有原始 refs、深度及文字资格。失效、非文字、深层组和含不支持成员的组整批拒绝，不静默过滤。
- `PptxSelectionControls.tsx`：FileReader 草稿绑定既有来源/页/版本/选择 key；读取中禁用提交，错误可恢复；卸载时先废弃 reader 身份再 abort，迟到回调不写草稿。图片只在固定的“应用对象格式”动作进入现有 `applyPanelOps`，没有第二条发布路径。
- `PptxSelectionFormatFields.tsx`：可选图片列表类型、PNG/JPEG 文件入口、可见待应用文件名及当前图片混合状态。仍是原有320px Inspector、内部滚动 body、固定单一 primary footer；原图只改大小等细节时不用重新选图。
- `apps/server/src/services/pptx-picture-bullet.ts`：整个图片符号批次在 native txn 前验证 schema、每个目标、512 KiB/400万像素上限、内容与扩展名一致、完整真实解码。复用公共图片读取器和已存在的 PNG CRC/JPEG decoder，不新增 codec 或供应商。
- `pptx-agent-host.ts`：仅新增 helper import 和 `runPptxHostTxn` 前 preflight。该文件媒体 owner 另有 attachments 接口改动，必须保留。
- `.trellis/spec/office/engine/conventions.md`：追加“PPTX 批量图片项目符号”契约，保留其他 owner 的既有改动。

测试文件：`pptx-picture-bullets.test.ts`（新增），`pptx-selection.test.ts`、`PptxSelectionControls.test.tsx`、`PptxEditor.multi-selection.test.tsx`。没有改 vendor、生成服务/catalog、其他格式或 Agent hook；已有宿主 `setParagraphFormat` 已支持 blip 媒体和关系。

## 已执行验证

最终定向 **6文件69/69通过**（原68后补1项同步 FileReader 抛错恢复）：

```sh
cd packages/office
./node_modules/.bin/vitest run src/editors/pptx-picture-bullets.test.ts src/editors/pptx-selection.test.ts src/editors/PptxSelectionControls.test.tsx src/editors/PptxEditor.multi-selection.test.tsx src/editors/PptxEditor.selection-tools.test.tsx src/agent/pptx-agent.test.ts
```

日志 `/tmp/mimir-pptx-picture-bullets-implementation-tests-20261017.log`。Office 与 Server `./node_modules/.bin/tsc --noEmit` 均 exit0，日志分别 `/tmp/mimir-pptx-picture-bullets-{office,server}-types-20261017.log`。9个生产/测试文件 scoped oxlint 零错误零警告，oxfmt check 与 scoped `git diff --check` 通过。未运行 Server DB runner、完整仓库测试或 Web build。

### 原生与原子性证据

- PNG、JPEG 各一次4目标批次：两个顶层文字形状 + 同直接父组的两个文字成员，每目标两段全部写 blip；各段真实 embed ID → slide rel → 媒体，媒体字节与选中原图精确相同。
- 一个 host 请求、一个 session version 增量、一个 onChange/history；保存后仅一步 Undo 可回整份原生基线，Redo 可回全部保存部件；commit 后 history 保留。无变化的第二次保存与重开部件精确。
- 每目标未知 pPr（defTabSz/hangingPunct、tabLst、opaque ext）保留；非目标对象原生 XML 精确，除目标 slide XML、slide rels、必要 content types/新增媒体外，其余原有 ZIP 部件精确。
- 图片/扩展名不符、截断图片、无效内容、失效后目标均在整批 preflight 拒绝；运行前打开的文稿仍保存为逐部件原基线。
- 已产出的真实有效 candidate 在外部 abort、session version 变化、handle dispose 后迟到，均不发布、不触发 onChange、不新增 history；保留此时人工稿。
- 真实 PptxEditor 组件的两个顶层、两个直接组员分别通过选文件→草稿→单次host→保存→Undo→Redo。图片请求执行时切选择，会中止请求，迟到结果不产生 dirty/history。
- 组件验证当前图片混合、选图取消、读中禁用主动作、文件类型/空/超限/读错误/同步抛错、失败保留与重试、来源/版本/选择变化时 abort reader 并忽略迟到 load。

最初原生测试误读了组成员空的 `anchor.originalXml`；已改为读取父组 `groupChildSlices` 的真实 XML，不是产品 writer 故障。

## 生产浏览器验收交接

合成文件（未上传、未删除任何库文件）：

- `/tmp/mimir-pptx-picture-bullets-browser-20261017.pptx`
- **SHA256 `0b31f1142a701b14429fdf3d25e8f9fdbf75ecdeca4b9cde020b5eb4847e1216`**
- `/tmp/mimir-pptx-picture-bullets-browser-20261017.json`：全原生 part SHA、每对象 durable ref、组成员 nvId 及原生切片 SHA。
- 图片 `/tmp/mimir-pptx-picture-bullet-20261017.png`、`.jpg`，来自既有测试素材原字节。
- 生成源码 `research/generate-pptx-picture-bullet-fixture-20261017.ts`。重跑会产生新 identity/ZIP SHA；验收以以上现存文件为基线，先复制固定原件，不误用重跑哈希。

操作：导入合成件，选“顶层甲”再 Ctrl/Cmd 点“顶层乙”；打开“对象选择与格式”→“列表”→“使用图片符号”选择PNG，确认选图尚未dirty，固定底部“应用对象格式”后保存/下载。Undo/Redo各保存下载。组成员可 Alt 点“组员甲”后 Ctrl/Cmd+Alt 点“组员乙”，或先点组再点成员进入直接成员选择，再加选另一个；用JPEG同验。Inspector对象列表原件名为Shape2/3（两个顶层）、Group7下Shape4/5（两个成员），另有Shape6非目标。原件附 `customXml/mimir-picture-bullet-opaque.xml` 必须精确保留。

1280×800及420×500检查固定主动作、文件名换行可达、body内部滚动，Escape关闭并恢复真实入口焦点；生产浏览器截图、native ZIP下载与 reload 持久化由 root 统一验收，本报告不声称已做。无模型配置，不声称真实 Agent/provider 成功；本地 Agent hook 合同已测。

## 参考

固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 的真实 picker→selectedIds→per-target setParagraphFormat 链，见最终审计§3.3。WeKnora缓存 v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24`，其definitions能力门控证据适用于KB/Agent，不替代Office原件writer或Ribbon语义。实施未作新的远端HTTP调研。

## 剩余

独立检查、root新Web生产构建和实际1280/420浏览器验收、最终全仓门禁。源码已冻结，无已知本片类型/测试阻点；没有stage/commit/archive/delete。
