# XLSX 结构化剪贴板下一切片方案（2026-10-17）

## 结论与实施边界

建议补一个由 `XlsxEditor` 持有的统一范围剪贴板：范围复制／剪切只冻结源，不产生 dirty；粘贴内部原生内容时分别调用现有 `copy_range`／本地 `move_range`，一次宿主请求、一个完整字节历史。网格获得 Ctrl/Cmd+C/X/V，按钮与快捷键共用控制器；系统剪贴板同时提供 `text/plain` 与 `text/html`。保留现有 CSV/TSV 导入。此文件是研究方案，尚未实现上述行为。

最小原生范围是**同一文档、同一句柄、源快照仍有效的普通矩形**，允许跨表。明确拒绝失效的内部快照，不把它自动变成显示值粘贴。跨文档原生导入、任意复杂 HTML、重复平铺、完整合并／规则／批注／表格迁移需要后续独立切片，不能以本片完成冒称全部 Excel 剪贴板兼容。

具体保真缺口必须一起修：当前范围 writer 克隆 `<c>`，尚未物化源行／列继承样式；目标具有另一种行列样式时会改变结果。应从现有格式刷的原生样式解析抽取窄 helper，供 copy/move 使用，不从浏览器显示值模型重建单元格。

## 1. 固定版本、资料与适用性

### GenOffice / Univer：本片主要编辑参考

- GenOffice 固定提交 `480548fd55f1be3593ee0d8e316a734751d58309`，本地只读 checkout `/tmp/mimir-genoffice-html-git`，本轮 `git rev-parse HEAD` 一致。
- `apps/sheets/package.json:37–51` 使用 Univer `^0.25.1`；同提交 `package-lock.json:5347–5350`、`:6269–6272` 实际锁定 `@univerjs/core` 和 `@univerjs/sheets-ui` **0.25.1**，不能以当前最新版文档代替它。
- 实际 npm 包 `/tmp/mimir-univer-sheets-ui/package/package.json` 为 **0.25.1**；以下运行时证据来自该包可读的 `lib/index.js`，类型另见 `lib/types/services/clipboard/{clipboard.service,copy-content-cache,type}.d.ts`。
- 固定上游 `apps/sheets/src/renderer/ribbon-actions.ts:317–340` 的 copy/cut/paste 调用真实 `univer.command.*`，特殊粘贴也有实际运行时命令。Mimir DOM 表格未装载 Univer 运行时，不能把这些命令 ID 接到按钮就声称能力可用。
- 实际 `SheetClipboardService`（包 `lib/index.js:4030–4078`）生成 `copyId/plain/html/matrixFragment/discreteRange`，缓存源 unit、sheet、范围、矩阵和 COPY/CUT 类型；cut 先 copy，不立即删除。
- HTML 带 `data-copy-id`（`:2720–2722`、`:3737`）；粘贴匹配缓存走内部路径，否则走 HTML 转换（`:4285–4294`）。内部粘贴合成默认、行、列、格的样式（`:4313–4339`），cut 不重复并消耗缓存（`:4367–4389`）。`:4250–4266` 汇成一次 undo/redo mutation 组；`:4894–4938` 的命令有焦点条件，Clipboard API 不可用时有内部缓存回退；`:11385–11410` 处理作用域内的真实 paste 事件。
- 固定 GenOffice `clipboard-tsv.ts` 进一步处理 TRUE/FALSE、制表符／换行／引号和末尾换行，基于显示值导出 plain，内部矩阵不经 TSV；`clipboard-anchor-tile.ts:1–18,54–83` 处理 1×3 源粘到 13×1 锚点形目标时扩宽、重复，cut 不重复。`App.tsx:1684,1741` 安装这两条适配。

**适用结论**：上游已有真实结构化剪贴板、系统 HTML/plain、焦点快捷键与一次历史，应追到具体行为补齐 Mimir。Univer 的矩阵复制不等于任意源 OOXML 保真证明，Mimir 仍使用自己的原件补丁宿主。最小片可暂不做平铺，但必须说明当前为起点按源尺寸粘贴，不能把现有单块 `copy_range` 宣称为上述平铺能力。

### WeKnora：本轮复核保存的官网／源码证据

- 官网 https://weknora.weixin.qq.com/ ，公开源码 https://github.com/Tencent/WeKnora 。沿用同日已取得 HTTP 200 的官网快照 `/tmp/mimir-pdf-rewrite-weknora-site.html`（本轮确认文件存在，113529 bytes），不声称本轮重新联网截屏。
- 版本 **v0.8.3**，提交 `3e22822c1d2397be730c458c7539d0eb8c113a24`。保存的 release API `/tmp/mimir-miniapp-weknora-release.json` 本轮解析 `tag_name=v0.8.3`；提交核对证据见同任务 `research/pdf-original-block-rewrite-20261017.md:8`。
- 固定源码 https://github.com/Tencent/WeKnora/blob/3e22822c1d2397be730c458c7539d0eb8c113a24/internal/agent/tools/definitions.go ，保存于 `/tmp/mimir-pdf-rewrite-weknora-definitions.go`。`:14–22` 是知识检索工具面；`:35–49`、`:61–75` 注释明确文件／shell 工具按真实 sandbox 能力注册，不以无效配置假装可用。
- 适用于 Mimir 的能力诚实：浏览器无 HTML 写入／读取权限时须给实际状态和可执行的内部命令，不能只展示“复制成功”。此源码不是原生 spreadsheet clipboard writer，不作为 XLSX 公式、格式或 Office 工具栏的首要参考。页面布局沿 Mimir 现有 Obsidian 取向壳；本片不重新设计全局导航。

## 2. Mimir 当前实际接缝

| 层／文件 | 已有行为 | 下一片缺口 |
| --- | --- | --- |
| `packages/office/src/editors/XlsxClipboardControls.tsx:16–150` | ≤2000 格按 `cell.text` 导出 TSV，`writeText`；`readText` 放入 textarea，确认后 `set_range`；≤1MiB CSV/TSV 文件导入 | 只有显示值；没有原生 cache／HTML／cut／快捷键；pending 只检查 mount live，未冻结文档版本与目标 |
| `XlsxManualControls.tsx:15–180` | 独立 capture 保存 workbook 对象、sheet/range 与 cut/format；cut 粘贴调用 `move_range`；快照变化明确 stale，切表／选区不使源失效 | 应将 cut 迁入同一 Editor cache，避免两套源；格式刷继续单独保留 |
| `XlsxEditor.tsx:353–377,813–835,1950` | 唯一 `executeOps` 使用句柄 FIFO；挂两个控件；td 导航与 Escape | 没有范围 copy/cut/paste 事件。普通 `executeOps` 故意未冻结 expectedVersion，新 async clipboard 不可直接沿用而失去版本门控 |
| `packages/office/src/agent/xlsx-agent.ts:223–228,339–371,393–441` | `getVersion/currentBytes/currentSession/execute`；execute 支持 expectedVersion/signal；宿主返回后验证、打开原件，再记一次 undo 并发布 | 复用即可，不另建 dirty/history 或直接替换字节；复制／arm cut 必须零 mutation |
| `apps/server/src/services/xlsx-agent-range.ts:28–76,131–254` | 原始 `<c>` map、相对公式平移、shared string/inline rich text/显式 s/type/cache 保留；缺格清目标；跨表 copy | 行列继承样式尚未物化；复制范围结构限制见下 |
| `apps/server/src/services/xlsx-manual-ops.ts:383–500` | 原生 `move_range`，同表重叠／跨表，清源写目标、迁移全簿引用，原子返回 | 用作统一 cut paste；补继承样式与整条剪贴板行为验证 |
| `packages/office/src/xlsx-delimited.ts` | BOM、引号、嵌入 CRLF、补矩形；≤1MiB/500行/100列/2000格；使用 `parseXlsxInput` 推断标量 | 只适合外部 plain，不可用来承载原生内部 cache |

`XlsxEditor` 另有“复制这个格的文字”以及“复制到右侧一格”；前者可以作为明确的显示文字命令保留，后者已有 `copy_range` 但不等于剪贴板。实现时避免与新范围复制入口同名或并存的隐式缓存混淆。`XlsxClipboardControls` 当前 key 为 documentId+sheetId；紧凑 Ribbon 分组也会折叠重挂，cache、异步 scope 和待粘贴快照应放在 Editor body/controller。

## 3. 原生复制与剪切边界：不可从 UI 绕过

### copy_range 的现有保证和拒绝

- 固定上游 DSL **没有 `cut_range`**。`copy_range` 是固定 55 DSL 中的一项；`move_range` 是 Mimir `packages/shared/src/xlsx-agent.ts:20` 的本地严格 schema。不要改 vendor 或发明 Agent DSL 名称。
- 源／目标最多2000格且在 Excel 行列边界内。单格目标按源尺寸展开，显式多格目标必须等尺寸；固定上游 geometry 预校验拒绝同表重叠。普通剪贴板不要悄悄调用带 filter 的复制：该路径会把公式冻结为缓存值。
- 目标保护拒绝；仅从保护表复制可读内容与修改源的 cut 不同。共享／数组／溢出公式与 cell cm 当前**整表**拒绝；扩展命名空间 CF/DV 整表拒绝。默认 copy 遇表格／legacyDrawing 也整表拒绝。合并、超链接、普通 CF/DV 与范围相交拒绝。不要为补快捷键一并解除这些已有结构守卫。
- 原始 cell style index 能保留字体／主题／自定义格式等既有 `cellXfs` 引用；但没 `s` 的格和无 `<c>` 空洞仍会继承目标行列。浏览器 `xlsx.ts:490` 的 styleIndex 也仅取显式 s 或0，不能拿其 format 证明源最终样式已完整解析。
- `xlsx-manual-ops.ts:317–331` 的格式刷 `styleAt` 已按显式格 → 行 s → 列 style →0 查找，可抽出窄 helper。须进一步按实际 OOXML 行样式适用标志验证，并补 row/col 组合 fixture；不能把当前 helper 当作所有 Excel 样式继承已经证明。复制到目标时给原 cell body 设置解析后的 s；源空洞也需写具有正确 s 的空 cell，显式默认 s=0 阻止继承目标背景。保留富文本 run，不将主题/tint 烘焙成 RGB。条件格式／表样式不混进基础样式。

### move_range 真实能力

- 源 map 先冻结，再清源、写目标，支持同表重叠与跨表。内部公式跨表先补原源表限定，再做引用迁移；全簿普通相对／绝对 A1 和完整包含的矩形引用、命名范围、图表公式可随目标迁移；不是 copy+clear 的等价替代。
- 源、目标、实际被改引用的工作表保护分别检查。部分相交引用范围拒绝；相交表格／透视／批注／合并／链接／规则等拒绝；普通不相交 table/legacy parts 可保留。共享／数组／溢出仍拒绝。不把 regex 公式处理宣称为全部结构化、外部、3D 引用兼容，未证明的形式要拒绝或明确列为限制。
- cut 粘贴只能一次 `move_range`，**不得**先 copy 成功再 clear，失败也不得只完成其中一半。成功才消耗 cut；失败保留源标记与错误，原字节和历史不变。新 clipboard 的 stale、取消不能避开 host 保护校验。

## 4. 推荐控制器、身份与生命周期

```ts
type RangeClipboard = {
  id: string // opaque nonce，仅用于当前 Editor 内 cache 识别
  documentId: string
  handleIdentity: object
  sourceVersion: number
  sourceBytes: Uint8Array // currentBytes() 的冻结副本
  sourceSheetId: string
  sourceRange: string
  rows: number
  columns: number
  kind: 'copy' | 'cut'
  plain: string
  html: string
}
```

源由**复制时的真实 currentBytes、持久 sheetId、range、version**定义，不是粘贴时重新取 live selection。opaque HTML marker 只查当前内存 cache，不授权读取另一个文档、不携带原件字节／用户标识。源快照限一个、沿已有 ZIP/文件预算，替换／dispose 即释放。

1. **arm**：无未提交的单格编辑时同步冻结 capture；若有待提交编辑，明确先提交，等该事务结束后再冻结，不能复制陈旧模型或吞掉输入。copy/cut 不改 bytes、版本、dirty、history。cut 给范围标记与“待移动到…”反馈，Escape／取消清除。
2. **切表／选区**：保留源 cache，当前表／选区决定目标。源文档或句柄改变／dispose 则清除。任何非本 cache 的工作簿 mutation、undo/redo 后都失效，即使又切回相同表／范围或字节看似相同，也不复活旧版本。
3. **paste 开始**：冻结目标 document/handle/sheet/range/version；使用专门执行选项传 `expectedVersion` 和 `AbortSignal`。目标范围变更、切表／文档、关闭待粘贴 UI 时取消在途读取／应用；返回前再次比身份。由于通用手动 FIFO 没有 captured version，不能仅包一层 `executeOps` 而丢掉这些参数。busy 和同步 ref 防止同 tick 重复提交。
4. **同簿校验**：当前文档、句柄和源版本必须匹配；原始源 bytes 用于核对，不上传到另一文档进行资源索引复用。stale marker 报“工作簿已更新，请重新复制／剪切”；不能退化为 plain、按当前源内容重抄，或清空剪切源。
5. **重复 copy 粘贴的最小安全方案**：连续粘贴可保留同一 copy cache，但只允许在**本次 copy_range 成功**后推进它的 validVersion。推进前验证此次 host 确实执行该 source/target，目标不与源重叠，原始源格／源行列样式，以及 styles/sharedStrings/theme 等依赖资源仍与冻结快照一致；应复用原件 ZIP 读取比较，不能只比较浏览器 `cell.text`。不满足就标 stale。若实现暂不具备该核对，首片成功后明确要求重新复制，不允许盲目更新版本伪装支持重复粘贴。任何外部／手动／Agent 写入都不会进入此快速推进分支。
6. **cut**：始终一次性；成功消耗标记与 capture，失败留草稿。跨表 move 的引用迁移仍由原生 host 完成。undo 恢复 bytes，不恢复一个可再剪切的旧 cache。

跨文档或源修改后仍能粘贴冻结的原生数据，需要新适配携带源 bytes、重映射 style/font/fill/border/numFmt/sharedStrings/theme/relationships 并定义公式语义；不能复用另一个 workbook 的 s/si 索引。此能力不在最小片承诺内，提供明确的“仅粘贴显示值”选择也须用户主动选择。

## 5. 系统 payload、事件与外部格式

### 复制与快捷键

- 网格容器使用受控 `onCopy/onCut/onPaste`；原生 copy/cut 事件可同步 `clipboardData.setData('text/plain', ...)` 和 `setData('text/html', ...)`。按钮在安全上下文／能力允许时用 `ClipboardItem` 写这两个 MIME；拒绝权限要如实反馈“已记录工作簿内范围，系统剪贴板写入失败”。只有 plain 能写时明确标注外部复制仅显示值，内部 raw cache 不经 TSV 重建。
- plain 跟固定上游一致：显示值 TSV，TRUE/FALSE、CRLF、引号和含换行字段正确转义。HTML 输出惰性 table、转义文本与允许的基础可见样式，带 `data-mimir-xlsx-copy-id` 和 payload 版本。不得把原件 XML、缓存公式／私有关系塞进 HTML。外部 HTML 只能表示已导出的格式子集，不能声称等于原生 XLSX。
- Ctrl/Cmd+C/X/V 只在网格拥有焦点且非单格编辑态接管。输入框、textarea、contenteditable、公式编辑框、聊天以及工具栏参数框保留原生文字剪贴板；不要全局 document keydown 截获。尽量依赖平台原生剪贴板事件，keydown 不再并行 readText+execute 导致两次 paste。preventDefault 仅用于明确承接的范围操作。
- 菜单“粘贴”使用真实 `navigator.clipboard.read`，能力不够提示 Ctrl/Cmd+V／手动输入。另有具名“粘贴工作簿内范围”命令可明确使用 cache；不要在权限失败或外部内容变化后无声替换为上次内部复制。Escape 清源标记，不拦截输入框自己的 Escape。

### payload 选择规则

1. HTML 的当前内部 marker 精确匹配 cache 且版本有效 → 原生 copy/move。
2. Mimir marker 已知但 stale／文档不匹配／cache 缺失 → 明确提示，等待重新复制或用户主动选择显示值模式；不自动走 plain。marker 不含真实身份信息，其他应用伪造 marker 也不能触发越权。
3. 无 Mimir marker → 外部 HTML 或 plain。绝不通过 plain 文本相等来判断内部复制，不把别的应用同文本误作 cut。
4. 浏览器／中间应用移除了 marker 时无法证明内部身份；按外部导入呈现提示，不能猜测并删除内部 cut 源。

### 外部 HTML 的最小闭环

建议首片同时提供 plain 与 HTML 导出；导入支持**单一普通矩形 table + 可表达的基础格式子集**，其余明确拒绝并给独立“仅粘贴显示值”动作。不要在已识别 HTML 上默默丢样式后当普通粘贴成功。

- 用已有 `parse5` 惰性解析，不插 live DOM，不 fetch；≤1MiB、≤500行／100列／2000格并限制节点／嵌套深度。单表 td/th、换行、空洞补矩形；嵌套表、多表歧义、rowspan/colspan、图片／链接关系、复杂 rich runs 等未建模内容明确提示限制，不下载图片或执行脚本、事件属性。
- 支持哪些 CSS 必须与真实 `format_range` serializer 对应并有读回证据：例如字体、字号、bold/italic/underline、文字色、纯色底、水平／垂直对齐和换行。边框、数值格式、CSS class／`mso-*`、富文本 span 不能假装天然支持；实现时分别证明或判为需用户主动选 values-only。主题／渐变原生格式仍只由内部 raw 路径保留。
- 外部 plain 沿已有有预算 parser，界面明确数字／布尔和 `=` 公式推断；HTML 文本中的 `=`、Excel 专有公式属性、日期／前导零、空字符串也要定义并测试，不能把已知文本误执行为公式。最小可将 HTML 单元格文本按显式文本写入，而另提供沿既有 plain 推断的模式；对应 writer 必须证明 apostrophe 等转义没有改变可见原文。
- `set_range` + 分组 `format_range` 可以同一批（≤50 operations、≤2000 materialized cells）走一次 host；超过预算就完整拒绝，不分成50次网络写入，也不只留下数据丢格式。若此方案无法保持任意组合基础样式，需要新增本地严格 clipboard manual arm（非公共 Agent DSL），仍是一次 host 事务；不能用放宽现有预算绕过。
- 最小内部复制是所选矩形全部格，包含隐藏／筛选行；需在菜单说明。上游 discrete range 可排除过滤行，不代表 Mimir 已等价支持。暂不接“仅可见单元格”或平铺，尤其不能自动走会冻结公式的 filtered copy。

## 6. 建议文件所有权与实施顺序

| 责任 | 建议文件 | 依赖／边界 |
| --- | --- | --- |
| 根会话唯一 Editor 集成 | `packages/office/src/editors/XlsxEditor.tsx`，新的 Editor 集成测试 | cache 放稳定 body；聚焦事件、handle/version/cancel；扩展专用执行回调；统一 manual cut；不让多人改 Editor |
| 剪贴板核心实现者 | 新 `packages/office/src/xlsx-clipboard.ts`、系统 bridge／HTML adapter 及纯测试 | 冻结描述符、payload 序列化／解析、能力状态、内部识别和 source 校验；先给根会话稳定接口 |
| 控件实现者 | `XlsxClipboardControls.tsx`、`XlsxManualControls.tsx`、对应测试／局部 CSS | 改为共享 controller callbacks；保留 CSV/TSV；格式刷不迁入 clipboard；一处可见命令与真实 disabled reason |
| 原生宿主实现者 | `xlsx-agent-range.ts`、`xlsx-manual-ops.ts`、窄样式 helper、host/range/manual tests；确有必要才 shared schema/host | 补 row/col 继承与空洞；不改 vendor、不放松结构 guard；HTML 若不能现批次表达才新增严格本地 arm |
| 独立复核／根验收 | Office/server 专项与真实浏览器／原件 | 核对所有权、能力矩阵与保真拒绝，再宽屏／420及保存历史 |

推荐顺序：先定义冻结状态／回调和失败语义 → 原生 style gap 与 host tests → controller、HTML/plain 和控件 → 根会话唯一 Editor 接线 → 独立检查 → 根会话真实浏览器与原件验收。本研究不启动实现者、不修改这些生产文件。

## 7. 需要的验证证据

### 原生与事务

- 源 fixture 含普通相对／绝对／混合引用、跨表公式、布尔／错误／数值／日期（含1904工作簿的复制而非重算）、前导零文本、空字符串、sst富文本和inline rich runs、自定义numFmt／主题填充、显式样式与行列继承、稀疏缺格。独立解 ZIP 检查真实 `<c>/<f>/<v>/s/t` 与目标继承，不只查画布 text。
- copy 源保持原 XML；源／目标 overlap copy 拒绝；cut overlap 及跨表迁移检查原源清除、目标类型与所有受支持引用更新。命名范围／图表公式、部分相交引用、保护源／目标／引用表必须覆盖。未触及 styles/sst/theme/media/customXml 等 entry 精确保持；失败原始全部 bytes/history 不变。
- arm copy/cut 零 dirty／version／undo；一次成功 paste 恰好一 undo；undo/redo 恢复完整 entry，连续两次保存独立重开。cut 失败保留、成功消耗；copy 自身粘贴后重复使用的版本推进有原生依赖校验，其他写入／历史导致 stale。

### 生命周期与事件

- pending 系统读取／宿主 apply 时切范围／表／文档／dispose，A→B→A 不复活；旧回执不发布。不支持／拒绝权限的系统剪贴板与明确内部命令分开测试。两个同 tick paste、原生 paste 加 keydown 只能执行一次。
- grid C/X/V、输入态 native C/X/V、公式框／聊天／textarea／工具栏字段不被抢；Escape 与窄宽 Ribbon 重挂保留或取消的状态符合约定。disabled 复合控件真正不能提交，错误保留可重试草稿。
- plain 引号／CRLF／尾行／TRUE/FALSE；HTML 当前marker／未知或stale marker／被剥marker／同文本文本；恶意或过预算HTML、复杂样式、合并／多表等拒绝，用户主动 values-only 才降级。设置数据和格式同批失败必须整体回滚。

### 浏览器、下载原件与实际门禁

- 使用项目账号 `admin@example.com` / `12345678`；根会话在实际文档页测试宽屏、问 AI 中栏及420：选择范围→真实复制／剪切→跨表粘贴→一次 undo/redo→保存／下载→再次修改并保存；检查当前源／目标、提示、焦点和弹层无整页横溢出。
- 必须分清真实 Clipboard API／平台原生键盘事件与测试构造的 `ClipboardEvent`。如果自动化环境不能控制 OS 系统剪贴板，记录这一限制，组件测试不能冒充桌面系统剪贴板验收；Desktop 实际 OS 互操作留明确待验项。
- 下载 XLSX 用独立 ZIP/XML 读回检查源／目标、公式和 styles/sst/relationships 等 touched-entry inventory。真实外部表格应用 HTML/plain 往返分别记录，不能只在 textarea 间循环称为 Excel 互操作。
- 按最终改动范围执行 Office/server 专项测试、相应包 tsc、目标 lint/format/styles/diff，再根会话统一 web build 与独立 checker；保持既有全仓阻断的真实状态，不以单片绿灯宣称整个任务已完成。

## 8. 本轮完成与未做

- 已完成：现有 Mimir clipboard/manual/Editor/Agent/host/native writer 及固定上游实际运行时源码调查；WeKnora 保存官网／v0.8.3源码和适用边界复核；本方案落盘。
- 本轮只有此研究文件写入。没有生产改动、测试／构建运行、提交／暂存／上传／测试件删除。以上测试是下一实现切片的验收标准，不是本轮通过记录。
- 主要后续决策：实现应选择并落实重复 copy 的依赖核对；外部 HTML 子集逐项证明；复杂原件继续按原保护边界拒绝。等待根会话授权再进入代码实施。
