# Research: PDF 视觉签名与印章的下一实施切片

- Query: 对照固定 GenOffice，核对手写、输入姓名、导入图片签名与字段行为，提出可保存、可撤销、具备紧凑交互的最小实施方案。
- Scope: mixed；只读源码与网页核对，不实施、不创建/上传测试文件。
- Date: 2026-10-17
- Active task: `.trellis/tasks/10-11-chat-edit-office`

## Findings

### 1. 建议切片及明确边界

建议 **S1：普通 PDF 页面上的视觉签名/印章**，一次完整覆盖三种输入、页面上预览放置、移动/等比缩放、自有对象删除、保存重开、单步撤销重做。手写输出原生 `/Ink`；姓名与图片输出原生 `/Stamp`，而非普通正文图片或 `MimirDrawingLayer`。标题使用“签名与印章”，紧邻说明仅需“视觉签名，不包含数字证书”。普通表单、书签与原件既有非目标批注保留。

S1 不声称以下能力完成：

1. **数字证书签名/验证、密码签名、可信时间戳、签名者认证**。不能生成 `/Sig`、`/ByteRange`、`/Contents` 证书字典，不能显示“数字签名有效”。
2. **现有 `/Sig` 字段的视觉适配**。当前守卫连空 `/Sig` 控件也拒绝；保留拒绝，不以“没有 /V”一项判断安全。此项是 S2 独立合同，见 §8。
3. **跨设备持久签名库**。GenOffice 的 userData 文件存储不能照搬浏览器；S1 可保留本次编辑会话中最近使用的素材，不显示“永久保存签名”。若要对齐跨文档持久复用，须单独定义当前账号隔离、登出清理、用户显式保存/删除和存储预算，不能直接用全局 localStorage。
4. OCR；本轮范围问题尚待主会话处理。

该切片是“视觉签名”类别的可独立验收增量，**不能将剩余全部编辑器工具标为完成**。

### 2. 固定 GenOffice 实际证据

主参考为 GenOffice commit `480548fd55f1be3593ee0d8e316a734751d58309`。证据路径相对 `/tmp/mimir-genoffice-html-git`。commit 身份沿用主会话已核对结果；本研究未运行 git 命令，也未启动上游 GUI。

| 文件与行号 | 实际行为及适用点 |
| --- | --- |
| `apps/pdf/src/renderer/SignatureDialog.tsx:9–28,140–163` | 三模式 draw/type/image；420×150 手写区；图最长边1600；系统字体回退；当前颜色；默认保存供复用。Mimir 应复用行为，不能复制固定420px弹窗。 |
| 同文件 `31–53,56–107` | 图片浏览器解码→等比降采样；黑白处理是亮度>200透明、<120黑色、中间渐变且乘原alpha；输入文字按实际glyph边界用200px Canvas栅格化为透明PNG。字体预览与落纸一致。 |
| 同文件 `217–269,272–273` | 手写按路径提交，多笔保留；路径少于2点过滤。`canConfirm` 在draw模式始终true，空白点击虽无结果但仍可按；Mimir需修正为空白禁用、显示实际可用状态。 |
| `apps/pdf/src/renderer/SignDropOverlay.tsx:6–9,17–90` | 指针跟随真实尺寸ghost；默认宽≤显示页宽1/3、高≤显示页高1/6；点击居中且夹在可视页内；位置使用显示页scale1坐标。 |
| `apps/pdf/src/renderer/App.tsx:3784–3832` | Ink逐点view→PDF；图片按最终Rotate反向旋转其appearance；显式放置后清pending。字段适配调用独立helper。 |
| `apps/pdf/src/renderer/signature-field.ts:5–47` | `/Sig` field rect中内缩8%、等比居中；`formFieldName`关联可视Ink/Stamp。**不是证书签名。** |
| `apps/pdf/src/main/save-pdf.ts:95–103,234–273,349–444` | 图片是真Stamp，PNG XObject经Form appearance，F=4打印；Ink有`InkList`、`BS`与显式AP/N。`GenOfficeFormField`和Contents前缀仅表示视觉关联。 |
| `apps/pdf/src/renderer/App.tsx:1584–1591` | required signature字段始终不算完成：明确因无法核验证书，视觉Ink/Stamp不得使required digital signature变成已完成。 |
| `apps/pdf/src/main/signature-store.ts:7–32,66–96` | 最多10个，payload去重，新优先；userData JSON原子tmp+rename。其图片验证只有非空string，Mimir不能复制这种宽松输入验证。 |
| `apps/pdf/tests/signature-field.test.ts:25–60` | 只证明字段居中与Ink Y翻转；不替代真实保存、Rotate/CropBox、浏览器或签名证书验证。 |

### 3. 现有 Mimir 文件与可复用代码

| 文件 | 作用与代码模式 |
| --- | --- |
| `packages/shared/src/pdf-agent.ts:370–393,447–587,588–595` | 严格local操作schema与`PdfLocalInfo`。现有drawing只支持单points数组，不表达多笔签名与Stamp；不能把多笔串成一条连接线。 |
| `packages/office/src/editors/PdfEditor.tsx:1370–1420,1499–1586` | 同一画布句柄，currentBytes/source/expectedVersion/signal守卫；local工具可临时物化pending页面布局。非apply_ops遇待保存插字明确拒绝。 |
| 同文件 `1909–1937,2089–2147,2603–2640,3680–3718` | 手动入口用`manual:true`；drawing预览/草稿绑定；Inspector互斥、busy延迟回焦。签名应走同一发布/历史，禁止另造bytes状态。 |
| `packages/office/src/editors/PdfDrawingCanvas.tsx:33–94,110–246,349+` | 仅临时工作副本预览；source/layout/revision绑定；异步abort；草稿移动/手柄与一次显式应用。可复用几何和事件模式，保留各工具状态独立。 |
| `packages/office/src/editors/pdf-drawing-canvas.ts` | 坐标、move/resize/hit handles纯函数。签名应保留比例；不能把普通绘图的任意非等比resize直接套到姓名。 |
| `packages/office/src/editors/PdfInspector.tsx:15–84` | 真实入口→同组→live tab焦点回退；Escape仅最近层；用户已移焦不抢回。 |
| `packages/office/src/editors/editors.css:717–854` | 实际PDF Inspector已320px，max-width留32px文档；**当前PDF实现断点900px**，不是其他DOCX工具的800px。body内滚、底部区域须放body外。签名切片不全局修改断点。 |
| `packages/office/src/agent/pdf-working-copy.ts:8–120` | 显式保存/local共享pending页面物化；每一步assertCurrent。旋转/crop/paper/复制/导入均须用物化后的真实viewport。 |
| `packages/office/src/agent/pdf-history.ts:3–88` | 50项/64MiB唯一字节预算；保存rebase不多新增历史。 |
| `apps/server/src/services/pdf-local.ts:146+,395–402,454–485,856–898` | 现有local保留原对象图、flush→去不可达对象→save后重读；绘图写page私有JSON+MimirDrawingLayer，**不是原生签名批注**。 |
| `apps/server/src/services/pdf-preserving-guard.ts:6–53` | 未知Catalog、动作、XFA、SigFlags、FT=Sig、Type=Sig拒绝；允许普通AcroForm/Outlines/Metadata/StructTreeRoot但不允许任意写法。 |
| `apps/server/src/services/pdf-page-layout.ts:25–35,39–137,139–211` | 等比纸型同步scaleContent/scaleAnnotations；CropBox原点变化；duplicate克隆批注/AP/P和NM，普通Widget保持字段树。**现有NM复制是randomUUID，签名pending副本重复物化会变ID，必须针对自有签名做稳定复制标识。** |
| `apps/server/src/services/pdf-drawing-geometry.ts:10–38,45–115` | 用户上传的自有缓存同样不可信；finite/schema/count/ID验证，显示pt→原生→最终显示空间模式可参考。不能把旧drawing cache直接扩成图片大JSON。 |
| `apps/server/src/services/pdf-annotations.ts:22–78,92–111` | NM与旧ref定位、重复ID拒绝、原生批注保留。现有catalog只列Text/Highlight/Underline/StrikeOut，不会列Ink/Stamp；签名需独立目录。 |
| `apps/server/src/services/pdf-image-codec.ts:8–79` | 已有pngjs7.0.0/jpeg-js0.4.4验证codec，8MiB/8192边/16M像素，PNG完整chunk与CRC检查。签名采用更紧预算，不新依赖。 |
| `apps/server/src/routes/conversations.ts:455–522` | local鉴权、已知PDF文档、50MiB文件、101MiB总multipart；仅import/replace可有asset；计算后不持久化库原件。 |
| `packages/renderer/src/lib/api.ts:284–322` 与 `components/document/OfficeSourceEditor.tsx:194` | 现有hostLocal传operation+bytes+version+signal，返回bytes/info。新local操作不需新renderer上传接口。 |

### 4. 原生存储与精确接口建议

建议新增自有服务 `apps/server/src/services/pdf-visual-signatures.ts`，在已有local端点/工作副本链路执行；不改vendor、不复用PDFium正文图片writer、不改严格原文编辑guard。

#### 4.1 操作与手动执行入口

在 `pdf-agent.ts` 添加严格签名payload与local union项（名称为建议，可由实施者统一）：

- `list_visual_signatures`：只读当前字节目录；`info.visualSignatures?`新增可选字段，避免让现有unrelated目录mock与调用者必须制造空值。读取不返回新字节/不推进版本。
- `add_visual_signature`：`{page, rect:{x,y,width,height}, signature}`。page从1；rect为最终显示页左上pt；signature是`ink:{width,height,paths,color,thickness}`或`image:{width,height,png}`的严格判别联合；姓名在浏览器栅格化后是image，`origin:'typed'|'uploaded'`仅用户类型展示，不是认证。
- `transform_visual_signature`：`{id,page,rect}`；改本编辑器签名位置与等比尺寸，保持原生ID、source、内容与其他批注；未知/重复/页错目标拒绝。
- `delete_visual_signature`：`{id,page}`；只删除本编辑器可验证的自有签名；不可删普通外来Ink/Stamp，也不可清空整个Annots数组。

**手动边界必须在执行器显式检查**：新建`PDF_VISUAL_SIGNATURE_MANUAL_TOOLS`常量；`PdfAgentHandle.execute`只在`options.manual===true`时接收这四项，`PdfEditor`将它们按local物化/发布。`PDF_LOCAL_TOOLS`与server模型catalog不自动扩签名能力。不是将任意模型传来的手写/姓名说成用户签名；需要Agent协助时可后续提供“打开签名工具等待用户创建”，另立工具合同。

#### 4.2 标准PDF外观与自有可编辑数据

- 每次创建仅增加一个`/Annots`间接引用；`/Type /Annot`、`/Subtype /Ink|Stamp`、`/Rect`、`/P`、`/NM`唯一ID、`/F 4`和`/AP /N`。Ink另外写真实多笔`/InkList`、`/BS /W`与`/C`；没有连接不同笔的隐藏线。Stamp使用PNG真实alpha/SMask，AP绘制image XObject。
- 原生对象带**独立、版本化**`/MimirVisualSignature`标记，而非只凭`/T Mimir`或NM前缀认领；普通外来批注完全保留。不得设置`/FT /Sig`、`/SigFlags`或伪造证书字典。
- 推荐在此标记关联的**有界PDF stream**保留规范化source（多笔矢量或原透明PNG）以支持保存重开后的真实ghost/复用；避免把大base64重复放每页JSON。AP与source可共享不可变资源；保存前flush和现有不可达清理负责删除后的残留资源。目录响应只返回所需可见页的小预览/几何，不能每次local read把全文件source原样base64返回。
- 上传中的自有标记不是可信数据库。读时验证版本、type/subtype/AP形状、source尺寸/预算、ID唯一性、finite Rect/InkList、对应page。未知版本、额外活动关系或结构不符合writer白名单，视为外来只读/拒绝对它编辑，不能按伪造标记删除任意对象。source/AP不一致不允许依据cache静默重绘覆盖。
- transform时基于当前native rect/路径和真实viewport求变换；更新InkList/AP一致。保存重开后的目录从native对象得到**当前**位置，不盲信最初缓存的显示rect。既有原件无触及字段、书签XYZ/C/F等属性、其他批注AP均原样保留。

#### 4.3 预算建议（实施前写成常量与错误文案）

沿用整个PDF≤50MiB、≤1000页。每份自有签名≤64笔、累计≤2000点；点/维度finite；签名PNG≤4MiB、最长边≤1600、≤2.56M像素；源图片选择先限制≤8MiB且识别编码/原始尺寸，才解码降采样。全文件自有签名≤100个、保留source合计≤16MiB；请求与保存后输出再校验，不因base64膨胀突破现有总请求预算。

空白手写、单点而无可见线段、全透明导入/黑白处理后无可见像素、空白姓名禁用；原始尺寸超限不得靠Canvas绘制后的尺寸绕过。PNG/JPEG输入足够覆盖此片；不沿用上游accept=image/*后静默吞不支持格式。文件读取、字体ready、Canvas栅格化均带单调generation和身份守卫。

### 5. Rotate / Crop / 纸型 / 页面复制 / 表单边界

1. **放置前**：复用`usePdfDrawingPreview/buildPdfWorkingCopy`，只渲染最终物化页；必须等真实PDF.js viewport与渲染身份一致才挂可点层。取指针到scale1显示pt；矩形四角、每一个Ink点用viewport逆变换，不能只以页高减Y。初次Stamp AP矩阵按0/90/180/270逆转，使预览和落纸都直立。负MediaBox/非零CropBox须覆盖。
2. **后续旋转/crop**：原native注释随页面几何自然变化，目录再用新viewport返回显示bbox；不要为了“保持永远朝上”额外重写原批注，导致双旋转。Crop可使历史签名部分/全部位于可视页外，保留原始数据；新放置才要求完整可见且含笔宽padding。移动已有页外签名允许完整移回，不能默认夹点截断原笔迹。
3. **等比纸型**：pdf-lib1.17.1的`PDFPage.scaleAnnotations`会缩放Rect与InkList（源码`PDFPage.ts:1606–1620`），不会缩放`BS.W`。Ink的AP视觉和外部阅读器重绘InkList线宽必须一致；自有签名service需显式同比更新线宽/派生数据，不能假设现有helper已完全处理签名。用独立PDF.js和另一阅读器核验，不能只看JSON。
4. **复制/重复物化**：`pdf-page-layout.ts:103`现为每批注随机NM。给自有签名生成源ID+来源page ref+occurrence的稳定复制ID并避碰，读pending副本→按ID变换/删除→保存仍可命中；保存后再复制必须新唯一。不要无理由改变所有外来批注ID语义。不可变AP/source可以共享，后续编辑只替换目标引用。
5. **普通AcroForm**：复用preserving guard，文档无Sig/XFA/活动动作时允许；不得flatten，保存后字段仍可继续填写，复制后Widget Parent/P仍正确；签名不是填写字段。带签名的PDF不转交严格PDFium图片/原文writer以绕过拒绝。
6. **StructTreeRoot**：S1最小方案明确拒绝在带标签PDF上新增视觉签名，理由是尚未实现新批注的StructParent/ParentTree可访问结构关联；现有带标签页面树迁移拒绝维持。不要把preserving guard允许原树保留误读成任意新增已支持。若要支持此子集需另外证明标记Artifact/关联正确。
7. **数字签名/空Sig**：继续拒绝，加密/未知Catalog/Perms/ByteRange类既有防线不放宽。服务可补局部结构检测以覆盖直接/间接签名字典，但不能只检查已知形状后略过全局guard。
8. **pending插字与保存中**：遵守当前非apply_ops限制，具体提示先保存插字；页面布局无需先保存。拒绝不消费dirty或新建历史。异步失败/取消/换页/源/句柄/版本变化后不发布临时物化bytes。

### 6. 紧凑UI与交互方案

沿用现有界面与Impeccable Operate规则；本研究只提出局部扩展，不创建PRODUCT.md、不改全站视觉。

- Ribbon插入/批注的具名“签名”按钮，图标用既有lucide；点击先关闭窄屏折叠菜单，再开**现有320px `PdfInspector`**。保持PDF当前900px覆盖断点和至少32px上下文。
- 标题“签名与印章”；一行弱化的证书边界说明；`手写 / 输入 / 图片`三个等宽紧凑tab。只展示当前模式控件，不一次堆三套表单。正文使用主题`--me-*`实色底，绿色仅主动作/选中，禁止把字体样张做成夸张装饰卡片。
- 手写区实际宽随内容区（约286px），逻辑坐标用矩形缩放归一，不固定420px CSS宽。原始Canvas backing按DPR，指针capture/pointercancel/touch-action处理完整；清空和撤销上笔是紧邻小按钮；当前颜色短控件。空白时footer不可准备放置。
- 输入仅姓名输入和2×2真实字体预览，约定`document.fonts.ready`后栅格化；选字体和已键入内容显示即所得。字数≤100，结果画布尺寸/像素预算再校验；字体回退不能承诺未安装字体。中文与斜体overhang均不裁字。
- 图片：可见选图按钮+固定最大高度的等比预览；切换“保留原色 / 黑白去浅底”时准确标识当前处理。失败显示具体可执行原因，保留重新选择按钮；旧解码结果不得覆盖新文件。原始与处理PNG分开，不悄悄去色。
- **底部固定单一主动作**：未准备时“准备放置”；准备后进入纸面“点击放置”状态。窄屏准备后折起覆盖Inspector，纸面显示紧凑的“点击纸面放置 / 取消”条，确保420px屏幕真能点到页面。点击后产生**本地位置草稿**，有真实等比ghost和边界框，可拖移/角手柄缩放；浮动简洁“应用签名 / 取消”使触屏、420×500也可达。只有应用才提交一次native写入；不要准备、点位、应用各写一次历史。
- 另提供“放在页面中央”键盘可达动作，聚焦预览后方向键微移、Shift加步长、Enter应用；Tab不会被Canvas困住。移动/尺寸当前值可在具名折叠“精确位置”两列字段中查看，不能默认展开坐标墙。
- 保存重开可选本编辑器签名；显示正确当前页/尺寸，允许移动/等比缩放/删除。新签名失败保留可重试草稿；更换模式、文档、页、源、版本使草稿失效，不能A→B→A复活。
- Escape先取消最接近的放置/拖动草稿，再关闭Inspector；不让Window listener吞掉面板Escape；关闭沿PdfInspector原live入口/同组/live tab规则。用户已转移到别处不抢焦。contentBusy沿现有延迟回焦，不用disabled触发器作唯一回焦点。
- 检查420×720及420×500：page/面板scrollWidth不大于clientWidth；标题关闭不挤；内滚后footer始终可见；PNG等比；所有可执行按钮≥32px且文本完整。以真实截图/DOM矩形证明，不能只用desktop缩略图。

### 7. 明确文件所有权与执行顺序

同一实施者拥有此片跨层变更，**不在PdfEditor上与别的实施者并写**。主会话协调时可先让schema/native冻结，再接UI；不要拆成互相猜协议的并发编辑。

| 归属 | 预期文件与责任 |
| --- | --- |
| 合同/native | `packages/shared/src/pdf-agent.ts`或新增`pdf-visual-signature.ts`及export；`apps/server/src/services/pdf-visual-signatures.ts`；`pdf-local.ts`极小分派/目录；`pdf-page-layout.ts`仅自有NM稳定复制与Ink线宽更新接缝；对应server tests。 |
| Editor/交互 | `packages/office/src/editors/PdfSignaturePanel.tsx`、`PdfSignatureCanvas.tsx`、`pdf-signature.ts`、局部CSS；`PdfEditor.tsx`最小Ribbon/互斥/overlay/identity分派；`agent/pdf-agent.ts`与`pdf-local-agent.ts`手动工具白名单；actualEditor tests。 |
| HTTP | `conversations.ts`仅必要schema/参数或文案适配，继续当前local multipart，签名PNG在operation内有严格预算，不启用`asset`绕过现有导入PDF合同。renderer只需继承共享类型，原则上不新增端点或File上传路径。 |
| 核查/浏览器 | 独立checker审查原生、权限、时序、样式；root用统一构建后浏览器验收，再维护矩阵/现行合同。不得改vendor。 |

推荐顺序：native add/read+独立光栅证明 → transform/delete与页面几何/稳定复制 → 手动execute/history保护 → Panel与真实gesture → 独立check → 构建及一次桌面/窄屏批量验收，修具体缺陷后一次确认。不要在仅有Canvas mock时先改矩阵为完成。

### 8. S2：/Sig字段与持久复用的后续边界

上游具备“把视觉签名放进指定字段框”，因此S1后仍有真实对标缺口。若实施S2：

- 独立研究只允许**可证明未签署**且无DocMDP/FieldMDP/ByteRange/Perms/签名动作或证书对象的空Sig；区分整份PDF已存在签署与空字段；保持其他所有writer的全局拒绝。
- 用专用局部writer建立widget到视觉Ink/Stamp的可逆关联；字段树、Widget/P、required/readonly均保留。required数字签名仍显示未完成，`/V`不写视觉结果。
- 结构不明、已签署、锁定或有认证权限一律拒绝；不提供“无视证书继续”快捷绕过。
- 跨文档复用另定义当前账号命名空间和显式保存；不能直接复制GenOffice userData服务或静默上传签名字样。S1会话缓存不等于该能力已完成。

### 9. 必须的有效测试与浏览器夹具计划

本研究未生成/上传夹具，以下是实施验收计划。

**Native/server**（新`pdf-visual-signatures.test.ts`，合理复用`pdf-drawing-geometry.test.ts`真实render）：

- 多笔Ink真实InkList+AP/N；typed/PNG真实Stamp+alpha；PDF.js `getAnnotations`读回，独立render见非空且位置/颜色/朝向正确，另Poppler核验至少一份真实输出。空白拒绝不改输入。
- 0/90/180/270 + 非零CropBox/负MediaBox，先pending旋转/crop/A5再落签，以及落签后再变换。对比真实像素与期望ghost，不只比较Rect。检查InkList、BS线宽与AP在纸型后同比。
- 普通AcroForm原V/AP与Widget Parent/P、原文、原生XYZ书签/C/F/未知合法属性与无关Ink/Stamp保持；保存两次仍可继续填写。
- pending页复制读取ID→变换/删除命中；保存后再复制唯一；删除复制签名不动原件。操作后实际Page对象数=可视页数，无幽灵临时页、无被删source/AP不可达残留。
- strict schema、预算、畸形PNG/IHDR/CRC、透明图、多笔总点数、伪造自有metadata、重复NM、未知版本/不一致AP、page错/越界、全文件上限在allocation前拒绝。固定source不得可引用远程URL。
- encrypted、动作、XFA、未知Catalog、空Sig与已签署Sig/SigFlags/ByteRange、标签结构拒绝。始终不返回可写字节，不写库原件。

**HTTP/执行器**：

- 扩展现有`pdf-local-route.test.ts`：未登录/非PDF/非法字段/溢出version；新三类操作输出的actualPDF；存储层原件未写回；read版本不变。
- 新`PdfEditor.signature.test.tsx`实际组件及native宿主；新建一次version/history；移动/缩放每次显式apply一次；read/prepare/cancel零历史；manual=false拒绝；选图片慢返回、字体栅格化迟到、关闭、换页/文档、edit→undo、保存中拒绝、挂起宿主取消均零发布。
- 应用→保存→撤销→保存→重做→保存：native内容和实际下载bytes逐次对应；不能只验证undo按钮enabled。输入框原生撤销不被PDF快捷键截走。

**Browser**（测试账号admin@example.com/12345678，既有验收知识库，文件保留）：

1. 由实施阶段生成3页PDF：page1普通文字+checkbox/text表单+原生书签；page2 Rotate90+非零CropBox；page3反向/不同纸型；预置外来Ink/Stamp与空白签字线。另生成专门拒绝的空Sig/真实签名结构和标签PDF，不拿假证书宣称认证成功。
2. 真实指针画至少2笔、改颜色，准备→窄屏纸面点位→连续拖动2次/角手柄→应用→保存重开，检查两笔独立与真实文件InkList/AP；未保存页面变换场景单独测。
3. 输入`张三 Li`选择两种实际字体，预览与下载输出中文/拉丁不裁字；导入真实透明PNG与白底JPEG分别保留原色/去浅底，native图像非透明像素及alpha独立检查。
4. 保存重开移动/删除自有对象；外来Ink/Stamp不可被选作自有；签名不使required数字字段变为已签署；普通表单仍能填写保存。
5. 统一构建后1280×720、420×720、420×500批量截图与DOM量测，检查面板固定动作、菜单关闭、遮罩/纸面操作、focus/Escape、无横溢出。只通过正常UI，无隐藏handle或脚本触发提交。

**验证命令边界**：仅此片有意义的server/native/Editor suites + shared/office/server/renderer tsc +目标lint/format/styles/diff；root负责统一build和最终全Office套件。全仓`pnpm check`已有480条捆绑skill基线失败，不为签名重复发现；旧TIFF整套基线未重跑，不能沿用局部通过称全套通过。无配置模型、未做Desktop，本片不宣称二者验收。

### 10. WeKnora与外部参考

按AGENTS要求，本研究再次直接检查官网与固定public source（内存读取，无新文件）：

- `https://weknora.weixin.qq.com/`：2026-10-17 HTTP200，113529 bytes，SHA256 `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`。
- WeKnora **v0.8.3**固定commit `3e22822c1d2397be730c458c7539d0eb8c113a24`：`https://raw.githubusercontent.com/Tencent/WeKnora/3e22822c1d2397be730c458c7539d0eb8c113a24/internal/agent/tools/definitions.go`，HTTP200，13533 bytes，SHA256 `3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0`。与既有`/tmp/mimir-group-flip-weknora-definitions.go`和site证据一致。
- `definitions.go:14–21`为KB检索，`35–49`按sandbox能力开放文件工具、`69–75`按Wiki范围门控。**适用**：签名工具按实际手动能力/用户输入开放，模型catalog不能因schema存在就冒称用户已签名；KB解析边界保持。**不适用**：该文件无Office Ink/Stamp写回、页面viewport、证书验证与Ribbon视觉，不能用其Markdown工具替代Office签名设计。
- Office主参考维持上表固定GenOffice源码；标准PDF annotation语义采用现有pdf-lib1.17.1（workspace catalog `^1.17.1`）与pdf.js6.3.289（catalog `^6.3.289`）已有原生API。未为本研究安装依赖，也未声称查验新版上游。
- 视觉权威为当前`.trellis/spec/project/design.md`的紧凑工作台和现有PDF Inspector。该文当前已采用用户批准的语雀白灰/绿色操作适配，Obsidian保留为连续工作区布局参照；不得用旧冷灰蓝硬覆盖当前tokens。Impeccable本次`context --target .../PdfEditor.tsx`确认已有incumbent，局部扩展可沿现有视觉，不额外启动全站design init。

### 11. Related specs

- `.trellis/workflow.md`：只读研究持久化、implement/check分离。
- `.trellis/spec/project/rules.md`、`design.md`、`product.md`：产品边界、真实状态、紧凑密度、OCR范围。
- `.trellis/spec/office/engine/index.md`、`conventions.md`、`page-structure.md`：原件保真、页面模型与保存。
- `.trellis/spec/office/frontend/index.md`、`editors/index.md`、`editors/conventions.md`、`editors/pitfalls.md`：Inspector、实际效果、草稿/请求身份与回焦。
- `.trellis/spec/shared/contract/pdf-agent.md`：local HTTP、pending物化、结构拒绝、原子发布、历史与文件持久化分工。现文部分旧段仍称300px，实际CSS320px，后续合同维护应以320px现行实现为准，不把本研究作为偷偷改全局UI的理由。

## Caveats / Not Found

- 本文为建议方案，未修改生产代码/vendor/spec，未调用模型、Desktop或浏览器验收；未创建、上传、删除夹具。
- 真实视觉签名原生写回当前未实现；已有drawing/insert_image只能证明相关底座，不能据此判签名已完成。
- 空Sig字段适配、数字证书签名、持久签名库仍须单独完成或明确产品边界，不可在S1后从全任务矩阵抹去。
- 稳定复制ID、纸型后Ink宽度与标签PDF新增批注是本片具体风险，实施者必须以native+独立光栅回归证明，不能仅照抄GenOffice helper。
