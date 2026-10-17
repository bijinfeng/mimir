# PDF 内容、批注、表单与图片宿主合同

## 1. Scope / Trigger

适用于 PDF 原文替换/删除、文字标注、便笺线程、交互表单、图片，以及手动工具栏和 Agent 的共同执行路径。浏览器与桌面共享 renderer，经鉴权 HTTP 调用服务宿主。真涂黑仅有§13的本地副本输出合同，不开放为 Agent 写入；普通页面视觉签名见§15，外部图片搜索/生成见§16；数字证书能力另行界定。全格式续轮规则仍见 [document-agent](./document-agent.md)。

## 2. Signatures

- `POST /api/conversations/pdf-agent/inspect-text`：multipart `file`、`documentId`、JSON `probe: PdfTextProbe`；返回 `{ target: PdfTextTarget }`。
- `POST /api/conversations/pdf-agent/apply-text`：multipart `file`、`documentId`、`expectedVersion`、`kind: 'edit'|'insert'|'layout'`、JSON `items`；原文编辑要求单项、已核验 `target`。
- `POST /api/conversations/pdf-agent/apply-markup`：multipart `file`、`documentId`、`expectedVersion`、JSON `markup: PdfMarkupInput`。
- `POST /api/conversations/pdf-agent/annotations`：multipart `file`、`documentId`、`expectedVersion`、JSON `operation: PdfAnnotationOperation`；写操作另需 `sha256`。
- `applyPdfAnnotationOperation(bytes, operation, expectedSha256?, author = 'AI Assistant')`：服务层只返回字节与批注快照，不写存储。
- `PdfAgentHandle.execute(tool, args, { expectedVersion?, roundId?, signal?, manual? })` → `executePdfContentTool` → 同一宿主；手动调用带 `manual:true`。

共享 schema/types 定义于 `packages/shared/src/pdf-agent.ts`；路由在 `apps/server/src/routes/conversations.ts`，批注服务为 `services/pdf-annotations.ts`，renderer HTTP 适配为 `api.documents.pdfAnnotations`。

## 3. Contracts

### 请求、响应和身份

`file` 是当前画布工作副本，至多 50 MiB；`documentId` 是已鉴权且当前格式为 PDF 的文档，1–200 字符；`expectedVersion` 为十进制非负整数。`sha256` 为小写 64 位十六进制 SHA-256，必须与本次上传工作字节相同。它校验当前传输副本，**不表示数据库文件版本或多客户端乐观锁**。

`operation` 的 `op` 必须为以下之一，内部 `pageIndex` 从 0 开始；Agent 的 `page/start/end` 从 1 开始，由同一客户端执行器换算。

| op | 字段与含义 |
| --- | --- |
| `read` | 读取全部当前工作字节的便笺、回复和三型文字标注；Agent `start/end` 在客户端限定页范围 |
| `add_note` | `pageIndex, text, x, y, color?, authorship?`；x/y 是显示页面左上角起算的 pt 坐标，便笺图标须位于页面内 |
| `reply_note` | `pageIndex, note_id, text, authorship?`；只能回复存在于该页的便笺根批注 |
| `edit_note` | `pageIndex, note_id, text`；可改根或回复内容，保留原作者与线程 |
| `delete_note` | `pageIndex, note_id`；删除根及递归回复和自有 Popup；遇未建模的回复类型拒绝，避免悬空引用 |
| `delete_markup` | `pageIndex, markup_ids?, type?`；省略 ID 删除本页匹配类型的全部文字标注，type 为 highlight/underline/strikeout |

非空便笺文字 1–10000 字符；ID 1–200 字符；ID 列表 1–200 项。新增 `authorship:'user'|'agent'` 只传来源意图，不传账号。鉴权路由为 `user` 取 `c.get('user').name`，Agent 和省略值使用 `AI Assistant`。修改已有批注不重写作者；旧版本误标作者不会被自动迁移。

响应 `{ version, annotations: { sha256, annotations: PdfAnnotation[] }, bytesBase64? }`。读取保持请求版本且不带新字节；写入返回实际新字节和请求版本加 1。每项为 `{ id, page, type, text, author, parentId? }`，其中 page 从 1 开始。新增批注用 `/NM` UUID，旧批注可用对象引用 ID `R<object>-<generation>`；回复写 `/IRT` 引用父根。调用者必须在写回后重读 ID，不能猜数组位置。

### 写入和画布边界

旧 `apply-text` 原文编辑仅开放完整、唯一、无重叠的 pdf.js 文字项，并再核验唯一 PDFium 对象、bounds、原文字和原件 SHA。语义文字标注另见§17。`edit_text.new_text=''` 是删除；非空替换不能包含原文，且须能独立读回。字号/颜色/三类字体/粗斜体按真实写入字段传递。原文整项编辑仍拒绝任意子串与重复目标；`markup_text` 支持原文片段、全部匹配和自定义颜色。便笺 `anchor_text` 在同一执行器定位唯一完整项后转坐标，不能与 x/y 混用。

写入前仍调用 `assertSafeToRewrite`，拒绝加密及未知 Catalog 结构。宿主只生成新字节；PDF-lib 和独立 pdf.js 读回确认后，客户端再核对句柄、文档、画布版本、原字节身份与 signal，才发布工作副本、推进版本和 dirty。原文/批注工具在页面结构或插字未保存时仍须先保存；表单与local工具的临时工作副本例外见第8、10节。文件持久化仍由既有保存按钮负责；失败、取消和冲突不更换工作副本。

新增运行时不引入环境键、数据库表或自动存储路径。PDFium/Harfbuzz 缺失时相关内容工具不可用，不能仅依赖模型 schema 宣称可执行。

## 本地页面、绘图与文档属性宿主

`POST /api/conversations/pdf-agent/local` 接收 `file`（当前未保存 PDF，1 字节至 50 MiB）、`documentId`、`expectedVersion` 与 `operation` JSON；操作由 `pdfLocalOperationSchema` 严格校验。仅 `import_pages` / `replace_pages` 接受且必须携带 `asset` PDF（同为 1 字节至 50 MiB），解析 multipart 前限制整个请求为 101 MiB。已鉴权文档必须为 PDF；版本为安全非负整数，并保留加一空间。

`applyPdfLocalOperation` 只计算工作副本，不持久化原件。返回 `bytesBase64?`、`outputs?: {name,bytesBase64}[]`、`info?: PdfLocalInfo` 和 `version`；仅返回修改字节时将请求版本加一，读属性及抽页/拆文件导出保持版本。Renderer API 还原所有二进制输出，`OfficeSourceEditor.hostLocal` 向同一个 PDF 编辑句柄提供宿主能力。当前文档/工作字节/版本/signal 的迟到校验仍由画布执行器负责。

页面范围是 `all` 或 `1-3,5`；从1起、去重且保留指定顺序。PDF最多1000页，按份拆分最多100个输出，合计不超过50MiB。抽页/拆文件保留原对象图中的表单树与选中页Widgets，剪除未选控件/字段、失效书签及内部链接目标，并从trailer根清理不可达对象，不能把未选页内容流留在输出文件。拆页/拼版尚不能迁移批注或表单；带标签的页面树迁移、签名/XFA/活动动作暂拒绝。导入来源AcroForm/标签、替换含Widget页仍拒绝；其他操作按已建模Catalog保留原对象，不放宽PDFium或旧页面重建的全局白名单。

水印/六槽页眉页脚和矢量绘图写入各自可删除的内容流图层；页面私有字典保存本编辑器配置。替换/清除只移除对应自有层，不尝试识别外部已烘焙文字。绘图/静态勾叉使用显示方向左上pt坐标；渲染必须按CropBox和0/90/180/270度转换。中文文字复用现有CJK字体适配与缺字检查。标准metadata省略字段保留、空字符串清除；更新Info时删除旧XMP，避免读到矛盾属性。原生嵌套书签使用页对象引用，页面调序/删除/替换后重新映射幸存目标。

`apply_ops` 可原子混合setMetadata与页面/表单操作；先在临时字节副本完成全部校验与序列化，任一失败不返回可写字节。`dry_run`仍执行真实校验但不返回字节/不升画布版本。pdf-lib 1.17的removePage不会失效getPages缓存，删除后必须直接遍历Catalog.Pages树取真实页序，不能据缓存计算幸存目标或可达对象。手动旋转/删除/调序保存优先规划同一保留结构的local批次，完成后核对当前句柄/版本才写盘；它不能回退到放宽旧页面重建的安全检查。

Agent导入/替换进入右侧Inspector等待用户选取File并明确继续；取消、Escape、停止、卸载或文档/版本变化均拒绝当前请求，不打开无人操作的系统文件选择器。工具栏只有具名入口，复杂控件留在右侧Inspector；自有属性未读回前不得用空默认值提交覆盖，撤销后须重读当前字节。抽页输出仅提供下载/打印，不自动入库；`export_pdf`精确复制当前字节且不改版本。前端注册的绘图/输出执行器不自动等于Agent模型目录已开放。

手动及Agent共用PDF历史，最多50项/64MiB唯一保留字节（含导入素材和插字基底）。撤销/重做按文档和源身份恢复完整工作状态并推进画布版本，作废之前整轮回退；保存重设当前历史项基线，不额外产生一个“仅序列化”的撤销步骤。Ctrl/Cmd+Z、Shift+Z及Ctrl+Y只作用于当前PDF编辑区，输入框保留原生文本撤销。

`pdf-local-route.test.ts` 使用真实 PDF 覆盖读取当前未保存 metadata、修改与页数保留、选页输出、导入页面、源原件未写回，以及鉴权/非法 JSON/严格字段/缺少素材/空文件/版本溢出/页码越界拒绝。`pdf-local.test.ts`覆盖表单抽页后继续填写、未选对象清理、中文图层替换、原生目录、混批预检与真实绘图像素；`PdfEditor.local.test.tsx`覆盖同句柄/历史/文件等待/保存基线。它们不代替UI、独立阅读器及真实模型验收。

## 4. Validation & Error Matrix

| 条件 | 结果 |
| --- | --- |
| 未登录 | `401`，沿用 requireAuth |
| 文档不存在或格式不是 PDF | `404 PDF_NOT_FOUND` |
| file 缺失或大于 50 MiB | `413 PDF_INPUT_TOO_LARGE` |
| 字段、JSON、操作 schema 无效 | `400 INVALID_INPUT` |
| 哈希过期、未知 ID、越界、非法线程、安全结构或独立读回失败 | `400 PDF_ANNOTATION_FAILED`；不返回可写字节，不保存原件 |
| 原文核验、替换或标注失败 | 对应 inspect/text/markup 错误，画布不变 |
| 上传后人工改动、切文档、取消、句柄释放或返回版本错误 | 客户端 `{ok:false,changed:false}`；不发布旧结果，保留已有 dirty |
| 保存失败 | 工作字节与 dirty 保留；不得先提交保存基线 |

## 5. Good / Base / Bad Cases

- Good：工具栏加中文便笺和回复，Agent 修改根内容，手动再次修改并保存两次；NM、IRT、作者和原文均读回正确。
- Base：`read_annotations` 从当前未保存字节读出批注，不推进版本，不写原件。
- Bad：使用旧 SHA 或旧画布版本删批注，或宿主计算时用户旋转页面；拒绝旧结果，保留旋转和 dirty。

## 6. Tests Required

- `apps/server/src/test/pdf-annotations.test.ts`：真实 PDF 字节、中文根/回复、NM/IRT/作者、两次保存、按 ID 删标注/整线程、过期 SHA/越界/未知 Catalog 不改输入；PDFium 改原文仍保留批注身份。
- `pdf-agent-route.test.ts`：401、PDF 格式校验、输入拒绝、user 作者由鉴权账号决定、返回版本/字节、原件存储不被宿主操作改变。
- `packages/office/src/agent/pdf-content-agent.test.ts`：真实 Agent 参数到宿主、原文替换/空文删除、三型标注、锚点、错误范围和非法参数拒绝。
- `PdfEditor.content.test.tsx`：真实工具栏按钮、手动/Agent 交替、保存两次并 pdf.js 重开；取消/冲突不发布旧字节；工作字节变化后仍是同一个 handle、版本单调、round 可撤销、工具栏分类保持。
- 浏览器、桌面与真实模型的实机结果在任务矩阵单独记录；共享 HTTP 和组件测试不能代替这些验收。

## 7. Wrong vs Correct

```ts
// Wrong: trust a client-supplied display author or publish before the async identity check.
const author = form.get('author')
setWorking({ bytes: result.bytes })

// Correct: account identity belongs to the authenticated host; UI publishes verified bytes.
const fromUser = (operation.op === 'add_note' || operation.op === 'reply_note')
  && operation.authorship === 'user'
const author = fromUser ? c.get('user').name : 'AI Assistant'
const result = await applyPdfAnnotationOperation(bytes, operation, sha256, author)
const structure = await readPdfPages(result.bytes)
assertSameDocumentHandleBytesVersionAndSignal()
setWorking({ source, bytes: result.bytes, structure })
```

## 8. 交互表单与原子批次

`POST /api/conversations/pdf-agent/forms` 使用相同已鉴权 PDF/50MiB/版本/hash multipart 合同，`operation: {op:'read'} | {op:'apply', ops, dryRun?}`。读返回 `{version, forms:{sha256,fields}}`；写返回新 `bytesBase64`、新字段快照与 `version+1`；dryRun执行全部校验/字体外观/序列化/独立读回但不返回字节、不升版本。宿主仍不保存原件。

字段为 `{name,type,value,options,readOnly,required,widgets:[{page,rect}]}`，rect为PDF用户空间、page从1起。支持 text/checkbox/radio/choice；普通PDF只读不会创建AcroForm。Agent `list_form_fields` 后以 `apply_ops` 的 `{op:'setFormValue',value:{name,value?,checked?}}` 写入，kind由实际字段派生；checkbox只接受checked，其他字段value为空字符串或省略表示清除。专用手动面板使用相同路径。

含setFormValue的批次可混合rotatePages/deletePage/setPageOrder，所有操作在单独字节副本完成，任一无效不发布。删除含字段widget的页拒绝；表单仍可编辑、不flatten。metadata及批注/插字扩展见第14节。页面布局未保存时，表单读取/填写复用`buildPdfWorkingCopy`仅在临时字节物化；读取与dryRun不发布工作字节、不清dirty、不新增history，成功写后才一次发布页面与字段状态。表单缓存同时绑定源字节及当前layout，撤销/重做或页序变化后以可取消后台read刷新，不争用Agent主动执行的内容锁；失败不消费pending布局。专用表单入口遇未保存插字仍需先保存；扩展批次只按第14节处理真实可重放状态。

表单HTTP路径显式调用`applyPreservingPdfFormOperation`：纯字段使用原writer及与local共用的保留结构守卫；含页面批次复用local的原生书签目标映射/删除清理，最后返回同字段快照。普通AcroForm可保留Outlines、内部GoTo、metadata等已建模Catalog结构，页面复制/几何保存后仍可继续填写；旧`applyPdfFormOperation`默认仍仅允许Type/Pages/AcroForm，原文字节重写与页面重建的严格安全白名单保持。拒绝加密、未知Catalog/AcroForm结构、XFA/签名/外部或活动动作、只读目标、未知字段、选项和缺字；遍历直接与间接字典以覆盖嵌套动作。文本外观使用现有服务器打包NotoSansCJKsc字体，先查glyph。`@pdf-lib/fontkit@1.1.1` CFFSubset把cff.length误写到CFF offSize头，局部codec端口只将生成子集的非法offSize规范成4；不修改字体资产或依赖源码。仅text/choice创建外观字体并预置空格，避免空字段或未使用子集只含.notdef导致CFF负charset；fontkit异步encode异常必须转为error事件供调用方拒绝，不能使宿主进程退出。需独立Poppler实测中文可见，不能只检查字段/V。

同版本fontkit的CID CFF子集还会把重复切回早先FD的字形错误指向最后FD，提取文字正常但实际字形空白。公共`pdf-cff-font.ts`适配保留原FD到子集FD映射，并分别收集各FD的本地子程序依赖；只作用于生成子集，不修改字体资产或依赖。

`pdf-preserving-forms.test.ts`覆盖原生GoTo/Dest书签与普通AcroForm、连续中文/choice填写清空、几何/复制后混批删除书签目标再填写、Widget Parent/P与原文独立读回、dryRun/过期SHA/晚失败原子和严格旧入口/签名/未知Catalog拒绝。`pdf-forms.test.ts`覆盖四种字段、中文外观CFF头、两次写入/清除/保留编辑性、混批/预检/拒绝，跨FD中文另以PDF.js真实光栅化逐字检查可见像素；rich新建PDF有相同像素回归和独立Poppler实看。`PdfEditor.forms.test.tsx`覆盖真实输入与勾选、Agent混批、同句柄、整轮撤销和两次保存；HTTP合同由pdf-agent-route覆盖。三端实机与真实模型验收仍分别记录。


## 9. 图片对象与像素处理

`POST /api/conversations/pdf-agent/images` 沿用已鉴权PDF文档、当前工作字节（50MiB）和expectedVersion multipart合同；operation由共享pdfImageOperationSchema验证。read返回`{version,images:{sha256,images,unsupportedPages}}`，写入另返回实际bytesBase64及version+1，不持久化原件。每个目标绑定`{sha256,pageIndex,objectIndex,bounds,resourceSha256}`；调用前从本次字节重新枚举并核对，不能信任旧序号或坐标。模型使用1起page/image_number，内部pageIndex为0起。插入URL/手动上传之外的写操作必须带已核验target。

支持list_page_images、insert/transform/rotate/replace/flip_image、set_image_opacity、crop_image、remove_image_background、delete_image。坐标和裁切侧均按页面显示方向左上角pt；90度页面和图片四分之一周旋转须换算。仅提供宽或高时保留比例；裁切以0–1比例删去四侧并缩小占位；去背景仅处理边缘连通背景。像素操作拒绝倾斜、非四分之一周和镜像矩阵，最大边重采样至2400px。重复原始资源、近重叠目标、含Form XObject的页面拒绝写入。read最多1000页/100张直接图片，原始资源每项50MiB；全局严格Catalog安全守卫不放宽，AcroForm图片编辑仍拒绝。

PNG/JPEG解码依赖明确声明的纯JS生产包pngjs/jpeg-js；原图≤8MiB、单边≤8192、总像素≤1600万，JPEG解码内存预算128MiB。PNG在inflate前遍历块边界且只接受唯一首IHDR，避免后置重复IHDR绕过初始尺寸预算。URL使用既有fetchDocxImage下载/SSRF预算，不能访问本地路径。PDFium输出位图是straight BGRA；转RGBA不应再次反乘alpha。仅上游decodeImage消费的toBitmap返回premultiplied BGRA，随后由固定上游去预乘；半透明彩色像素须用真实渲染验证，不能只测0/255原色。

绝对不透明度使用专用ExtGState包装唯一Image XObject的Do指令：隔离q/Q、ca/CA；重复修改更新同一状态，从0可恢复到1，不能反复损失像素。PDF词法扫描跳过字符串/注释，拒绝内联BI流和不唯一Do；保留其他资源、内容流与非编码字典键。未知原有alpha不猜成1；返回opacity仅指本路径已建模值。后续几何/替换/像素编辑须恢复已建模opacity。独立pdf.js读取与PDFium/Poppler像素验证完成后才返回字节。

图片手动Inspector与Agent共用executePdfImageTool和同一工作句柄。上传FileReader捕获版本，并在关闭、换文档、换页、选中对象变化或工作字节变化时作废；异步宿主仍核对句柄/字节/版本/signal后发布。与表单、批注共用文档区右侧300px Inspector；容器≤900px为覆盖层，可关闭/内部滚动，Escape关闭并回到实际工具栏触发器。读取中触发器禁用时，Escape或关闭按钮关闭后，请求完成时若焦点仍在BODY、同文档且面板未重开，才补回焦；用户期间一旦聚焦其他控件即取消补回焦，不能在其再次失焦后抢回。原入口随命令组折叠菜单卸载或无法聚焦时，关闭/Escape回到当前文档同一具名命令组的按钮；busy后的延迟回焦沿同一路径，不能落到BODY。已被内部控件消费的Escape不关闭Inspector。表单选字段跳到控件页、页号去重；主操作未改禁用，成功/只读/加载/无字段/失败均可见。

测试：pdf-images覆盖PNG/JPEG/预算/目标拒绝/真实像素/旋转/裁切/绝对alpha/两次保存；PdfEditor.images覆盖控件与Agent交替/整轮撤销/两次保存/上传失效/回焦；表单组件另覆盖加载/空/失败/只读/页跳转。服务端路由覆盖401/404/非法输入/当前工作字节/过期target，确认原件不被宿主操作保存。模型目录须同时受PDFium/HarfBuzz资源就绪门槛控制，外部image_search/generate_image不因图片URL可用而开放。

## 10. 保留结构的页面工作副本

手动页面模型经内部`apply_page_layout`本地操作物化：`pages`为1–1000项，每项恰好一个1起`source_page`或`blank:{width,height}`，绝对`rotation:0|90|180|270`，可选相对源CropBox的`crop:{top,right,bottom,left}`和未旋转`paper:{width,height}`。页序/复制/空白/几何须整体预检后产生临时字节；Catalog安全守卫不放宽，标签树页面迁移、签名/动作仍拒绝。重复页保留共享原生字段及其值，但复制Widget字典/坐标并绑定正确`Parent`和新页`P`；独立页的裁剪/缩放不能改另一页控件。

纸型以可视区计算等比系数，同步`scaleContent`/`scaleAnnotations`，通过MediaBox/CropBox原点居中（原点可以为负），不能仅平移内容让表单错位。水印/页眉页脚按最终页数和显示尺寸重绘。自有绘图缓存须随CropBox、四分之一周旋转与等比纸型精确更新：旧显示左上pt坐标转PDF用户空间，按纸型比例缩放，再转最终显示空间。所有bbox角、ink绝对点及线宽同比变换；不能只移动bbox或用矩形近似路径。内容流本身沿原页面变换，后续按ID更新/删除时才移除自有层并重绘。

自有绘图在重复物化同一待保存布局时使用稳定的复制ID，并避开原件与新复制绘图的已有ID，保证读取后可按ID修改/删除；保存后再次复制仍须唯一。负角度与规范角度按整周等价比较。local旋转批次、裁剪、纸型与布局物化共用同一绘图几何适配。`rotation?:0|90|180|270`是绘图局部朝向，缺省0；line/arrow/check/cross按其规范形状转换，rect/ellipse四分之一周保持外接框，ink点已经处于最终显示空间，不重复旋转。`arrowHeadLength?`固定箭头头长，缺省原规则min(12,width/3,height/3)，几何缩放时必须保存并同比缩放，不能重算上限。裁剪可使x/y为负或路径位于页外，须保留；派生/更新尺寸和线宽仅限finite且positive，不夹到旧14400pt或0.25pt门槛。新建仍校验bbox在显示页内、尺寸≤14400pt、线宽0.25–50pt，沿用500对象/2000点/1000页/50MiB预算。上传文件内的MimirDrawings缓存同样不可信：读取和变换前须校验schema、全文件对象数及ID唯一性；页面复制须在克隆前预检目标总数，不能等序列化后才拒绝超预算缓存。Inspector选中绘图草稿绑定当前源几何，页面变换或撤销后须显示新值，不能把旧草稿写回。

`buildPdfWorkingCopy`供保存和本地工具复用：先追加用户已选定的普通来源页，再恢复最终布局，每次异步调用前后检查句柄/版本/signal。来源先裁成所选页面并清理未选内部目标，再由单个`PDFObjectCopier`复制`page.ref`，保证内部Dest/P指向实际插入页而非幽灵副本。来源AcroForm/标签结构仍明确拒绝。临时追加也受1000页/50MiB预算约束。宿主不写原件；读取/抽页成功不得自动清dirty或新增历史，操作/导入失败不得发布临时物化字节。旧导入按钮在宿主可用时直接操作工作副本，失败不留下无法保存的import页引用。

所有pdf-local序列化在flush延迟嵌入后，从trailer根遍历并清除不可达对象；绘图/水印临时页不能残留在输出间接对象中。页码删除的目标裁剪另校验不得引用已删页。回归应比较可视页数与间接`Type=Page`数，并独立验证Widget值、Parent/P、缩放坐标、书签和再次填写。Inspector输出置顶并滚回可见位置；保留300px面板及关闭回焦。`pdf-drawing-geometry.test.ts`用独立pdf.js光栅化比较原内容流自然变换与缓存重绘，逐形覆盖rect/ellipse/line/arrow/check/cross/ink、四旋转、非零CropBox、裁剪+A5、页外路径和复制调序；不能只验证JSON缓存。

## 11. 原文段落整体移动

### Scope / Trigger

移动可证明归属的完整原文段落，不覆盖绘制、不重建文字或字体、不重排其他内容。段落重写/部分原文替换共用本节核验目标，另见§12；旧`apply-text`路径仍保留唯一完整文字项限制。

### Signatures

- `POST /api/conversations/pdf-agent/text-blocks`：multipart `file/documentId/expectedVersion/operation`。
- `PdfHostBlocks({bytes,expectedVersion,operation,signal?})`返回`{bytes?,version,blocks,target?}`；renderer为`api.documents.pdfTextBlocks`，服务为`applyPdfTextBlockOperation(bytes,operation,signal?)`。
- `operation`为`{op:'read',pageIndex}`、`{op:'inspect',probe:{pageIndex,items:[{text,bounds}]}}`或`{op:'move',target,dx,dy}`。
- Agent：`list_text_blocks({page})`、`move_text_block({page,paragraph_text,dx,dy})`；页号从1起，片段须唯一。仅`manual:true`接受已核验`args.target`；Agent不能传入目标对象绕过定位。

### Contracts

内部pageIndex/blockIndex/objectIndex从0起。target包含当前字节sha256、pageIndex、blockIndex与全部`members:[{objectIndex,text,bounds,matrix:[a,b,c,d,e,f]}]`。probe必须精确匹配当前PDF.js聚类的完整段落；宿主重新聚类并映射完整PDFium顶层对象，不能仅信任客户端序号、文字或相似外框。返回快照`{sha256,blocks:[{page,blockIndex,block_number,text,x,y,width,height,editable,reason?,target?}]}`，page/block_number从1起，显示位置为pt。

dx/dy为当前页面显示方向向右/向下pt，有限且±14400，不能同时为0。通过两个viewport逆变换点之差换算PDF用户空间偏移，包含Rotate与非零CropBox；每个目标仅修改矩阵e/f。写前重新校验完整成员；写后校验全文原生对象数、文字、矩阵/边界、字体与图片资源hash、样式和非目标对象，再由独立PDF.js读取目标与非目标文字位置。字体的PDF.js生成ID含document前缀，不能跨两次打开直接比较该临时ID；字体实际保真用原生font program hash核验。PDFium保存可对相同字体资源去重并改变资源引用、字典键序；独立资源核对须比较原生字体字典语义或字体program、图片流，不能以资源名字或字典原始序列化差异认定资源丢失。

读取/inspect不返回字节、不推进版本/dirty/history；move成功只返回一次字节和version+1。客户端沿现有句柄、源字节身份、expectedVersion和signal守卫接受一次历史，实际保存仍由普通file PUT。无新增环境键、存储或数据库状态。预算：file1字节–50MiB、最多1000页、单段500项/10000字符、全文原生对象30000；版本为安全非负整数且保留+1空间。

### Validation & Error Matrix

| 条件 | 结果 |
| --- | --- |
| 未登录 / 文档不存在或非PDF | 401 / 404 PDF_NOT_FOUND |
| file缺失/空/超限；版本、JSON或strict schema无效 | 413 PDF_INPUT_TOO_LARGE / 400 INVALID_INPUT |
| AcroForm、加密或未知Catalog | 保持原assertSafeToRewrite拒绝，400 PDF_BLOCK_FAILED |
| 旧hash、伪造成员/矩阵、跨段对象、Form内文本、重叠对象或显式裁切内容流 | 读取可返回editable:false+reason；inspect/move拒绝，不返回可写字节 |
| 取消、版本/页面/文档变化或独立读回失败 | 不接受工作字节，不产生成功历史或自动保存 |

### Good / Base / Bad Cases

Good：一个段落六个原生文字对象随页面90度方向统一向右17/下23pt，保留另一段相同文字及原图片/字体。Base：read/inspect仅显示段落和完整对象集合。Bad：传一个成员的target移动多对象段落，或以重复片段定位任意一段，均拒绝。

### Tests Required

`pdf-text-block-host.test.ts`：四旋转/offset CropBox、多对象同偏移、嵌入字体字形program与图片hash、非目标/第二页保真、两次写入、旧hash/伪造/部分/重叠/clip/结构/取消拒绝。`pdf-text-block-route.test.ts`：实际鉴权、原件不自动保存、单次版本及普通保存两次/undo保存/redo保存字节闭环。`pdf-block-agent.test.ts`：唯一片段/手动精确target和迟到取消；`pdf-text-blocks.test.ts`：分栏/段末短行/四旋转选择。`PdfEditor.blocks.test.tsx`、`PdfTextBlockPanel.test.tsx`：真实host、画布选择与同一历史、过期/关闭/换页取消及当前值。浏览器与真实模型验收另记任务证据。

### Wrong vs Correct

Wrong：用白框盖掉原文后按新位置绘制缓存文字，或只检查页面仍包含旧字符串。Correct：对独立核验的完整成员矩阵统一加viewport逆变换偏移，保存后按实际对象与位置读回；重复原文的非目标对象保持原位。

## 12. 原文段落重写与指定匹配替换

### Scope / Trigger

与§11的完整原生对象核验共用`text-blocks`宿主。`edit_block`重写整段并按原宽度重排；`edit_text`可替换部分原文及指定重复匹配，不重排整段。两者真实移除/重建原生文字，空新文字真实删除，无白框覆盖。旧`apply-text`原文编辑兼容入口保持唯一完整文字项限制；语义`markup_text`按§17真实字形定位。

### Signatures

- `operation:{op:'rewrite',target,newText,replace?:{oldText,occurrence},fontSize?,font?,color?,bold?,italic?,align?}`；target仍是当前SHA、完整段索引与全部成员，不允许以部分成员替代核验。
- `newText`最多10000字符，允许空；`oldText`非空且最多10000，`occurrence`为1起整数、至多10000。最终整段也不得超过10000字符。`fontSize`为有限正数、至多500；font为arial/times/courier，color为#RRGGBB。bold/italic的true表示应用、false表示真实取消；省略保留。取消需原生普通字面可核验，已识别Helvetica/Arial、Times、Courier族使用同类普通字面，无法解析时要求显式选择字体，混合另一项未指定时拒绝并要求明确指定。合成粗体先在私有工作副本移除fill+stroke，返回前核对实际字体weight/name/italicAngle及render mode，不改vendor。`replace`与`align`不能同时出现。
- Agent `edit_block({page,paragraph_text,new_text,...})`使用唯一段落片段；`edit_text({page,old_text,new_text,occurrence?,...})`按整页段落阅读顺序计数，默认第一处。仅manual接受完整精确target，局部替换次序此时限当前选段。
- 快照新增`canRewrite/rewriteReason/format:{fontSize,leading,align}`；字号/行距来自原生对象中位数/基线，对齐为原生行边缘推导，不伪造原字体族或混合颜色当前值。

### Contracts

只接受正向轴对齐的原生文字矩阵；页面Rotate四种方向和非零CropBox可编辑。复杂Form、clip、AcroForm、未知Catalog沿原安全守卫拒绝，不能因重写支持而全局放宽。整个完整目标重新核验后，局部替换才在私有writer中派生实际触及的文字容器。匹配按NFKC及空白折叠、非重叠计数，不拆分原连字字形；浏览器计数与服务器原生foldMap有极少Unicode映射差异时以服务器拒绝为准。

整段从原生首行baseline起，使用原行距随字号同比调整；先真实写入，测量实际保存字体字形的advance，再从原字节重做换行/对齐，最多4遍收敛。原宽不变，段落向下扩展，不推动别段，过长可重叠，面板明确提示。未改完整前后缀run在原生keep-plan有效时保留；明确字体/字号/粗斜体覆盖或跨行重排可重建受影响run，不声称所有目标字体对象原样保留。局部替换只触及原生容器、不做整段换行，较长替换可能与邻文重叠。

读回验证使用全文原生对象多重集、字形、样式、矩阵/边界、字体program及图片资源hash，非目标页保持；选中范围仅能留下文字对象，不得出现覆盖path。PDFium文字页关联会因邻近重排给原对象提取结果附加尾部gap，比较仅忽略提取尾部空白，内部实际字形和资源/几何仍核验；独立PDF.js再验证非目标文字/变换和完整新原文。单页原生char-count预算200000，沿用全文30000对象/1000页与原文件预算。

手动面板保留整体移动，增加整段改写/局部替换；格式默认折叠，显示真实参考值。空整段输入显示“删除整段”，空局部输入只删除指定匹配。源、选择、模式或关闭取消请求，自己的busy不能取消自身；失败保留草稿，执行冻结版本，成功沿同一PDF工作字节和一次历史，仍由用户显式保存。

### Validation / Cases / Tests

未登录401、schema无效400 INVALID_INPUT；旧SHA/部分目标/非法次序/不可用字形/读回不符均400 PDF_BLOCK_FAILED且无可写结果。Good：同页重复两段只改指定段内第二处，保留未触及粗体和另一段；Base：整段换行后正常保存、撤销保存、重做保存字节一致；Bad：用白块覆盖旧文或以旧target再次写入。

`pdf-block-rewrite.test.ts`覆盖四Rotate/CropBox、实际字体换行/左中右对齐、局部第二次替换、真实删除、粗体资源保留、缺字/旧目标/取消，中文逐字PDF.js独立光栅可见；另须独立Poppler目视，不能仅检查提取字符串。`pdf-block-rewrite-route.test.ts`覆盖鉴权/严格参数/真实普通保存和撤销重做字节。`pdf-block-agent.test.ts`覆盖页面出现次序/唯一段落/manual目标与迟到取消；`PdfTextBlockPanel.test.tsx`覆盖当前值/折叠格式/空删除/失败重试/版本与取消；`PdfEditor.blocks.test.tsx`使用真实原生宿主，覆盖手动部分替换+整段改写和两套保存/undo/redo闭环。宽/420浏览器、Desktop和真实模型验收分别记证据。

## 13. 本地真涂黑副本

### Scope / Trigger

本地 `redact_copy` 使用原生内容移除生成独立下载文件。宿主不修改知识库或编辑器工作字节，不进入公开 `PDF_LOCAL_TOOLS` / Agent 目录；它不负责清洗文档 Info 中全部隐私元数据。客户端工具与浏览器验收由任务记录分别说明。

### Signatures

- `POST /api/conversations/pdf-agent/local` 沿现有 multipart `file/documentId/expectedVersion/operation`。
- `operation:{op:'redact_copy',regions:[{pageIndex,rect:[left,bottom,right,top]}]}`；strict schema，页索引从0起。
- `createPdfRedactedCopy(bytes,operation,signal?) → Promise<Uint8Array>`；`applyPdfLocalOperation` 分支包装为 `{outputs:[{name:'document-redacted.pdf',bytes}]}`。
- HTTP 返回 `outputs:[{name,bytesBase64}]` 与原 `version`，无 `bytesBase64` 工作字节、无 `info`，不调用存储保存。

### Contracts

文件与输出各1字节至50MiB；文档1–1000页，区域1–100项，页数×区域数≤10000。rect为有限PDF用户空间坐标、绝对值≤1e7，left<right、bottom<top，转float32后仍非空；完整位于CropBox∩MediaBox内，不静默裁切。Rotate仅0/90/180/270，UserUnit仅1。全部区域先预检，再调用未修改vendor的 `redactPdf`，内容删除完成后才绘制黑色填充。原生结果经全量保存及不可达对象清理，再由独立PDF.js解析目标页与总页数。

沿用 `assertSafeToRewrite` 的加密/未知Catalog/AcroForm拒绝，并扫描所有间接对象中的签名Type/FT/ByteRange。目标页及继承页树仅允许服务列明的标准键，Mimir自有图层缓存与未知属性拒绝；资源图中的Properties、ActualText/Alt缓存、Metadata/PieceInfo/OPI/AF、非None遮罩、Pattern/Shading等拒绝。内联正文ActualText由native实际移除。命中批注只要与IRT/Parent/Popup关联图相连即整批拒绝，避免区域外节点保留原Contents；普通无关联批注可真实移除。共享图片或含图Form等沿原生安全检查拒绝。服务在原生调用前后、序列化/独立读取后检查signal；WASM执行中不可抢占，但取消后绝不返回输出。

### Validation & Error Matrix

| 情况 | 结果 |
| --- | --- |
| 未登录 / 文档不存在或非PDF | 401 / 404 PDF_NOT_FOUND |
| 空或超限文件、版本、strict JSON/schema不合法 | 沿local端点413 PDF_INPUT_TOO_LARGE / 400 INVALID_INPUT |
| 区域越界/预算、签名/加密、未知结构、缓存旁路或关联批注 | 400 PDF_LOCAL_FAILED；无部分输出、无版本推进 |
| 原生处理/输出预算/独立读取失败，或取消 | 不返回可下载结果、不保存源文件 |

### Good / Base / Bad Cases

Good：文字中段、独立图片半区与90°/offset CropBox页面指定区域在副本中真实移除，邻文和另一页保留。Base：一项输出且返回版本等于请求版本，库存字节不变。Bad：只盖黑矩形，或原根批注仍由区域外回复引用，均不能称为真涂黑成功。

### Tests Required

`pdf-redaction-copy.test.ts`：真实PDFium+独立PDF.js提取、全部间接对象与解压流扫描、原图片像素消除和非目标像素保留、四Rotate/offsetCrop、完整单revision、原子无效尾区域、取消、上述结构/缓存/关联图拒绝。`pdf-redaction-copy-route.test.ts`：真实鉴权、outputs-only、原版本、库存文件逐字节不变及非法输入。浏览器选区与下载结果须另用独立Poppler光栅验证；服务测试通过不能替代客户端定位验收。

### Wrong vs Correct

Wrong：先存普通黑框，文本extract不含某个字符串就当作完成，忽略旧流、ActualText、批注回复和资源缓存。Correct：预检可恢复旁路，原生移除、完整重序列化并清理不可达对象；真实夹具用全文、全部对象/解压流及图像像素证明删除，再输出独立副本。


## 14. 批注与待保存插字的原子 apply_ops

### Scope / Trigger

当前 PDF Agent 的 `apply_ops` 增加 `removeMarkup`、`setNoteContents`、`removeTextInsert`。原文、图片和专用批注/表单工具仍遵守各自守卫；没有上游 P 会话批注层。

### Signatures

- `pdfBatchArgsSchema`：严格 `{dry_run?:boolean,ops:1..30}`，每项为现有页面/表单/metadata，或 `{op:'removeMarkup',id}`、`{op:'setNoteContents',id,contents}`、`{op:'removeTextInsert',id}`。
- `buildPdfBatchCandidate({args,bytes,pending,version,local,apply,annotations,assertCurrent,signal})`：只返回候选字节、页结构、nextPending、info、dryRun及删除/幸存/物化 T ID；不发布状态。
- 既有 `POST /api/conversations/pdf-agent/local` 只接 native 子批次，严格拒绝 removeTextInsert。multipart、鉴权、50MiB、版本和不持久化合同不变。
- `mutatePdfBatchAnnotation(pdf,op)` 只在一个 detached pdf-lib 图中使用显式 preserving 守卫；`applyPdfAnnotationOperation` 默认仍调用原严格 `assertSafeToRewrite`。

### Contracts

`id` 使用当前 read_annotations 的真实 NM/legacy R 身份；removeMarkup 仅三型文字标注，setNoteContents 仅便笺/回复，contents trim 后1–10000字符。T 标识匹配 `^T[a-zA-Z0-9-]{1,80}$` 且必须存在于冻结 pending 数组；整批先消费指定 T，重复消费拒绝。native 子批次严格按声明顺序在同一加载图执行；删除页后再改该页批注失败，先改再删可成功。遍历真实 Catalog.Pages，不能使用 pdf-lib 删除/重排后的 getPages 缓存。最终按幸存页验证批注最终内容，并独立 PDF.js 读回；不按中间值误报失败。

无页面子操作时，先修改未含任何 T 的 pending.base，再以真实 scale1 viewport 的 `convertToPdfPoint(x,y+fontSize)` 重放全部幸存 T 一次；前后页数/Rotate/view/UserUnit/viewport transform 必须不变。nextPending 保留同一 T ID/坐标与修改后 raw base，后续移动/编辑/删除幸存 T 不丢批注/metadata。删尽且无 native 操作直接回同一 raw base 引用，可恢复 clean。native 批次仅在删页或调序时沿既有目录映射重建书签；纯批注/表单/metadata/旋转保留原 Outlines 对象图及原生目的地、颜色与字形，不能无条件转成 Fit 书签。

有页面子操作时，先按原实际 viewport 重建幸存 T，再顺序执行 native 操作；成功清 pending，并明确提示 T 已物化失效。legacy R 与 pending 混用没有身份账本，须拒绝并提示先保存重读；无 pending 的 legacy R 可继续编辑。带 NM 的目标须在 raw base/current 及重放前后唯一、类型/页/线程/内容一致。不能新增通用 PDFium preserving bypass。

Editor 冻结文档、handle、版本、source/snapshot bytes、pending、layout、保存基线与保存 token；每次异步后和发布前核验。最终只一段同步发布 working/pending/snapshot/layout/cache/dirty，外层 handle 只升一次版本/建一次 round。dry_run 计算完整候选但不发布字节、pending、选择、缓存、dirty、history或版本；结果以将来时说明物化。保存仍由用户既有保存按钮触发，无环境键或 DB 变化。

### Validation & Error Matrix

| 条件 | 结果 |
| --- | --- |
| 未知键、项数越界、错类型、空文字、服务端收到 T | strict schema 拒绝；HTTP 400 INVALID_INPUT |
| 未知/重复 ID、类型不符、晚页号失败 | 整批拒绝；native 项错误映射回原批次序号，无可写字节 |
| legacy R+pending、NM身份/几何漂移、pending与布局无法证明映射 | 客户端拒绝，提示保存/重读；原状态不变 |
| 签名、XFA、未知 Catalog/活动动作、Widget页删除、tagged页树迁移 | 现有 preserving/form 守卫拒绝；默认原文/批注守卫不放宽 |
| abort、外部编辑、换文档、保存中或保存基线变化 | 迟到结果不发布；已有 pending/dirty/history 保留 |

### Good / Base / Bad Cases

Good：T1/T2 删除 T1 并修改 Nreply；T2 保留原身份，随后 move/edit/delete T2 仍保留新回复。Base：仅删除全部 T 回原 raw base；页面批次后幸存 T 随原页物化，整轮回退恢复原 pending/base。Bad：从已烘焙 snapshot 重放造成被删 T 残留，或先发布 metadata 再因尾项失败回滚，均违反原子合同。

### Tests Required

`pdf-atomic-batch.test.ts` 验证真实 native 图顺序、NM/legacy、混合表单/metadata/页、内容流保留、类型/重复/晚失败/dryrun/严格守卫。`pdf-local-route.test.ts` 验证鉴权、native新操作、dryrun版本、严格错误及库存原字节不变。`pdf-batch.test.ts` 使用真实 PDFium/PDF.js 验证四 Rotate/offset CropBox、raw base与后续幸存 T、页面物化、legacy拒绝、几何/迟到/尾项失败与原序号。`PdfEditor.batch.test.tsx` 用真实 Editor/宿主契约验证一次版本/dirty、dryrun和失败无发布、整轮与手动历史、保存/撤销/重做精确字节、abort/外部改稿/切文档/保存中拒绝。canvas 渲染 mock 只证明发布合同，不代表浏览器批次或模型验收。

### Wrong vs Correct

Wrong：循环调用会自行发布的 insert/edit/delete，或分成 form 与其它两批后声称原生顺序一致。
Correct：纯候选函数计算与独立读取完成后统一 assertCurrent；native 同一图依序修改，最终同步发布一次。

## 15. 手动普通页面视觉签名

`local` 端点 strict 操作 `add_visual_signature({page,source,rect})`、`transform_visual_signature({page,id,rect})`、`delete_visual_signature({page,id})` 沿用鉴权、50MiB、当前工作字节和版本合同。page从1起，rect为当前CropBox/Rotate显示方向左上pt坐标。只接受手动入口；公开模型工具目录不增加签名操作，也不能借 `apply_local_operation` 绕过manual门控。这是普通页面视觉标记，不是数字证书签名，不能填写或绕过 `/Sig`、ByteRange、DocMDP/FieldMDP、Perms守卫。

`source.kind:'ink'` 保留独立笔画，写原生 `/Ink`、InkList、线宽与AP；`stamp` 接收规范PNG，写 `/Stamp`、图像AP及必要的SMask。输入限64笔/累计2000点、PNG4MiB/边1600px、100个自有对象/源合计16MiB。客户端姓名使用实际可用字体完成后栅格化；PNG/JPEG导入先检查编码尺寸再解码，只在明确选择时去浅色背景。共享schema位于 `pdf-visual-signature.ts`。

可编辑身份不能仅依赖 `/NM` 前缀或私有元数据：服务验证MVS标识唯一、严格字典、所属页、类型/flags、几何与源仿射矩阵、InkList/线宽、完整有界AP资源图hash及实际AP模板/图像RGB与alpha一致；未核验对象保持外来只读。只返回≤240px预览，不把原始PNG返给Inspector。保存重开仍须重验。复制页派生稳定的新对象身份；纸型缩放同时维护InkList、BS.W、AP和源变换，避免读回失去身份或笔宽不一致。

hash是可重算的公开完整性元数据，不能替代native白名单：Ink的C/BS样式须与source/AP一致，源stream只允许writer实际产生的Length字典。签名手动门控按入口tool判断，local构造操作须最后写入规范op，不能由args.op覆盖。回归以重新计算hash后的篡改对象证明仍拒绝，不只损坏hash。

当前签名定位只覆盖CropBox完全在MediaBox内且UserUnit=1的页面；不改全PDF页模型。read返回可选signatureIssues页原因，面板禁用准备/调整并显示原因，native新增/变换同时兜底；已有严格核验签名的读取/删除保持可用。旧host缺少此可选字段也不能绕过native守卫。保存开始即取消未应用草稿，完成后不能复活。

签名面板在320px Inspector内部滚动，准备后关闭面板进入纸面定位，点击或键盘居中放置，拖动/等比缩放/精确坐标均为本地草稿；明确应用只写一次版本和历史，取消不写。切页、换源、页面布局/版本/保存身份变化作废草稿及迟到结果。普通表单、外来批注和原生书签保留；无删页的页面布局保留原Outlines对象图与XYZ/C/F，不能无条件重建成Fit。

`pdf-visual-signatures.test.ts`须验证真实Ink/Stamp及alpha、四Rotate/offsetCrop、移动/删除/重开/篡改、纸型缩放与复制身份、表单/书签保留及签名/标签/未知结构拒绝；`PdfEditor.signature.test.tsx`验证一次提交、连续拖动/缩放、保存/撤销/重做、取消/迟到及折叠菜单关闭回焦。独立PDF.js像素与Poppler目视另记证据。真实浏览器手写、中文字体和导入图片交互、420×500面板及输出须另验；组件测试不代表浏览器或Desktop通过。


## 16. 外部图片准备与私有引用

`GET /api/conversations/pdf-agent/assets?documentId=...` 返回独立的 `image_search` / `generate_image` 配置可用性和设置原因；已配置不等于真实服务健康。`POST` 同路径严格 JSON `{documentId,assetSessionId,expectedVersion,operation}`，累计字节先限16KiB再解析。assetSessionId为每次加载源的UUID，expectedVersion为安全非负整数且留加一空间。PDF格式及账号沿现有鉴权检查。operation只有`image_search({query,max_results?})`和`generate_image({prompt,aspect_ratio?})`；未知键拒绝。搜索数量1–10、默认8，比例为1:1/4:3/16:9/9:16/3:4/2:3/3:2/auto，默认auto。

两个工具为客户端纯读：单独assetTool分支不读PDFium、不物化待生效页面/插字、不captureState、不建整轮checkpoint，不改bytes/dirty/history/版本或保存基线。响应仅`{version:expectedVersion,data}`，不返回PDF字节。停止、卸载、换源及任何手动或Agent版本推进会取消请求；忽略signal的迟到宿主结果仍拒绝。模型目录以真实Brave和图片配置分别门控；原生图片写入的WASM/结构条件独立成立。

生成沿统一图片适配及用量入口，透传SDK abortSignal；Brave和受限远程下载也透传调用signal并保留既有超时/SSRF约束。gpt-image横/竖向请求映射1536×1024/1024×1536，DALL-E3映射1792×1024/1024×1792，1:1为1024×1024；auto保持默认。DALL-E2非正方形明确拒绝。结果返回requestedRatio及真实解码width/height/actualRatio，不承诺精确任意比例。生成必须通过PNG/JPEG完整解码与8MiB/8192边/1600万像素限制；不把WebP冒称可插入。

生成返回`mimir-generated://UUID`私有引用，模块内registry绑定真实principal、PDF documentId和源会话，20分钟TTL、全局8项/64MiB、单principal+源会话4项FIFO预算，过期/驱逐移除。字节双向克隆，失败插入不消费引用，可在有效期内重试。没有公开GET/静态资源地址。多进程未共享registry时明确提示引用不可用并重新生成，不承诺分布式持久性。

手动预览用鉴权`POST /pdf-agent/assets/preview`，严格`{documentId,assetSessionId,url}`及相同身份核验，仅返回no-store、nosniff PNG/JPEG。Agent结果不携带base64。Inspector用Blob URL展示并在替换/卸载释放。实际insert_image/replace_image仍走原图片multipart；额外assetSessionId是可信传输字段，不放进原生几何操作。路由精确解析私有引用后转本地base64新对象；普通URL继续走受限HTTP(S)下载，不放宽协议或私网访问。

现有320px图片Inspector新增上传/搜索/生成来源切换，选择结果/生成只准备素材，单个固定底部主按钮才插入或替换；替换保留位置尺寸层次。配置状态、等待/取消、失败、空结果和当前选择可见。长内容内部滚动，Escape沿现有Inspector回焦路径，模型配置跳转经过宿主未保存守卫。浏览器420×500/宽屏验收另记，不由组件DOM测试替代。

`pdf-external-assets.test.ts`覆盖严格参数/数量映射/独立readiness、原件不变、完整解码、实际尺寸、取消、registry作用域/克隆/TTL/FIFO及真实native插入替换独立PDF.js读回。`pdf-external-assets-route.test.ts`覆盖鉴权/格式/16KiB/严格字段/原件库存不变、私有预览和native引用解析；真实本地Node HTTP断连验证传到provider mock的signal。`pdf-asset-agent.test.ts`覆盖pending页面/插字纯读且零checkpoint、停止/释放/版本取消。`PdfEditor.external-images.test.tsx`覆盖真实原生宿主、预览不dirty、单主操作、保存/撤销精确原始字节/重做、未配置/空结果/关闭迟到。provider mock不证明真实生成或真实Agent模型续轮，Desktop由用户验收。


## 17. 语义文字标注与插字排版

`apply-markup`接受严格联合：旧`{target,type,color?}`或`{pageIndex,text,type,all?,color?}`；`type`限highlight/underline/strikeout，颜色`#RRGGBB`，默认首处、all为当前页全部非重叠匹配。返回新字节、请求版本+1及实际`count`。同一次当前工作字节的PDFium源codepoint、真实glyph box、角度与baseline用于匹配；NFKC及空白折叠以实际源字形边界回映，不能拆分扩长连字或UTF-16配对。原生页面Rotate在私有只读载入上临时归0以稳定阅读序，输出仍保留原件Rotate/CropBox。相同baseline的连续实际命中字形合成行quad，跨行多quad；不按run长度比例切矩形。仅四分之一周轴向文字可精确标注，倾斜文字、命中带裁切路径的文字对象、未知字形位置与无命中明确拒绝；不能为被遮挡原文创建完整字形标注。单页200000字符，线性匹配，单次至多200处/10000命中字形；全部核验后同一pdf-lib图追加与序列化一次。Catalog安全守卫保持，原正文/字体/图片内容流保留；独立PDF.js读回数量后才发布。

`apply-text kind=layout`是只读准备：items使用`PdfInsertLayoutInput`（pageIndex/text/fontSize/color、可选font/bold/italic/align/maxWidth、成对x/y或anchorText/placement）。返回原始字节、原请求版本及`layouts`，不写库存或新增画布历史。无坐标默认真实显示页顶部36pt、按实际宽度水平居中；anchorText须唯一真实片段，placement为right（默认）/below/above，间距6pt，不能与坐标混用。用丢弃的真实PDFium字体探针测量advance，再生成wrappedText/lineLeading/lineXOffsets；CJK沿原字体覆盖回退，不宣称所选西文字体覆盖中文。宽度、整块高度与位置须在显示页面内，源至多50MiB/1000页。

`insert`真实writer透传font/bold/italic/align/lineLeading/lineXOffsets/rotate；HTTP颜色0–1在宿主转换为PDFium0–255。逻辑text与实际wrappedText、字体属性、换行宽度、行距及偏移都属于pending T的工作副本状态，capture/restore/history、保存期间重放、编辑/删除和apply_ops幸存T全部保留。移动及批次重放也须核验已知排版width/height，不能只检查首行fontSize。旧pending读取默认为自动字体/左对齐，省略全部编辑属性及相同编辑/移动不增加版本。修改文字或格式后从同一raw base重新计算；布局准备和最终写入由同一取消/版本控制器覆盖。失败、关闭、换源、迟到结果不发布，保存期间继续插字仍沿既有基线重放合同。

手动插字、待保存文字编辑与语义标注复用320px Inspector，内部滚动内容、固定底部单一primary与有界错误；点击纸面定位保留。已知真实排版尺寸的T可在纸面拖移、拖宽度手柄或键盘移动/调宽；只预览轮廓，结束后一次原生重排与一次history。文字编辑草稿绑定当前history epoch，撤销、重做或外部写后不得继续覆盖新当前值。手势捕获单指针，坐标按实际纸面DOM尺寸换算，仅所属指针的取消或capture丢失结束手势，Escape/失焦/pointercancel不发布；宽度重排超页时保留原件与草稿错误。真实420×500、纸面手势、保存重开由浏览器另验，组件与native测试不能替代浏览器通过。
