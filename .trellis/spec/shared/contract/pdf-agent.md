# PDF 内容、批注、表单与图片宿主合同

## 1. Scope / Trigger

适用于 PDF 原文替换/删除、文字标注、便笺线程、交互表单、图片，以及手动工具栏和 Agent 的共同执行路径。浏览器与桌面共享 renderer，经鉴权 HTTP 调用服务宿主；此合同不代表涂黑、签名、外部图片搜索/生成或全部上游工具已实现。全格式续轮规则仍见 [document-agent](./document-agent.md)。

## 2. Signatures

- `POST /api/conversations/pdf-agent/inspect-text`：multipart `file`、`documentId`、JSON `probe: PdfTextProbe`；返回 `{ target: PdfTextTarget }`。
- `POST /api/conversations/pdf-agent/apply-text`：multipart `file`、`documentId`、`expectedVersion`、`kind: 'edit'|'insert'`、JSON `items`；原文编辑要求单项、已核验 `target`。
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

原文编辑与标注仅开放完整、唯一、无重叠的 pdf.js 文字项，并再核验唯一 PDFium 对象、bounds、原文字和原件 SHA。`edit_text.new_text=''` 是删除；非空替换不能包含原文，且须能独立读回。字号/颜色/三类字体/粗斜体按真实写入字段传递。任意子串、重复命中、`markup_text.all:true` 和自定义标注颜色仍拒绝。便笺 `anchor_text` 在同一执行器定位唯一完整项后转坐标，不能与 x/y 混用。

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

含setFormValue的批次可混合rotatePages/deletePage/setPageOrder，所有操作在单独字节副本完成，任一无效不发布。删除含字段widget的页拒绝；表单仍可编辑、不flatten。其他apply_ops子项仍未开放。页面布局未保存时，表单读取/填写复用`buildPdfWorkingCopy`仅在临时字节物化；读取与dryRun不发布工作字节、不清dirty、不新增history，成功写后才一次发布页面与字段状态。表单缓存同时绑定源字节及当前layout，撤销/重做或页序变化后以可取消后台read刷新，不争用Agent主动执行的内容锁；失败不消费pending布局。未保存插字仍需先保存。

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
