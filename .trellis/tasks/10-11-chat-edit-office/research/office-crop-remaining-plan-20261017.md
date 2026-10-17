# Research: Office 剩余裁剪手势、浮动表格与媒体参数

- Query: DOCX 图片拖裁剪/浮动表格位置；PPTX 直接组合图片拖裁剪及实际媒体/参数差距，给出下一片最小实施方案。
- Scope: mixed；当前 Mimir 源码 + 固定 GenOffice 可执行处理器，复用同任务 WeKnora 固定公开证据。
- Date: 2026-10-17
- Active task: `.trellis/tasks/10-11-chat-edit-office`。
- 本文只研究，不是实施、测试、构建或浏览器通过记录；没有生产修改、上传、模型调用、暂存、提交或删除。

## Findings

### 1. 先纠正能力分类

| 项 | 当前结论 | 下一片的准确范围 |
| --- | --- | --- |
| DOCX 数值裁剪/替换/去背景 | 已实现且已有真实像素和 history 证据，不重做 | 在当前图片 Inspector 的原图预览加入八把手和移动保留区域；沿现有像素输出/原生替换 |
| DOCX 正文画面上的非破坏裁剪 | 固定上游没有这样的执行器 | 上游是预览内选区拖裁后生成新图片；不能把预览裁剪称保留原图的 Office Canvas srcRect 编辑 |
| DOCX 浮动表格位置 | 上游实际可执行，Mimir 手动入口缺 | none/left/right 环绕、X/Y、距正文，沿原件锚点和 native tblpPr 保存；不是表格自由拖动需求 |
| PPTX 顶层普通图画布裁剪 | 已验，不重做 | 保留现有路径，扩展不能回退顶层旋转/翻转/恢复原图语义 |
| PPTX 直接组内图画布裁剪 | Mimir 缺；固定上游 startCrop 也只取顶层 | 用户已接受的补齐队列要求，作为新增手势适配，不能宣传为固定上游已有深层支持 |
| PPTX 父组旋转/翻转渲染 | 当前 SVG 明确漏用父组 transform | 组内裁剪前置修复；原生 XML 保真通过不等于父组在画布中显示正确 |
| PPTX 顶层媒体封面非破坏裁剪 | 固定上游允许；Mimir Canvas 明确拒绝 | 独立小片开放 srcRect+box，不得调用像素替换、去背景或改写音视频关系 |
| PPTX 容器插入与布局 | 已有五种；另五种实际缺，默认几何也不同 | MOV/M4V/AVI/M4A/AAC；真实视频比例、音频64pt方形、MOV预览MIME，明确不可播放但可保留嵌入 |
| 持久化媒体音量/截取/自动播放/循环 | 固定版未找到可执行设置/writer | 不凭常见 Office 功能扩充成确定缺口；浏览器播放器自带音量/进度不代表保存播放参数 |

### 2. 已读上下文与主要文件

已读 workflow、prd、design、implement 与 `all-tools-completion-ledger-20261017.md`；研究角色未读 implement/check JSONL。任务旧 PRD 的格式范围以 implement 与用户后续扩展为准。DOCX forms/OCR 当前另有实现者，本片不得写其文件；以下仅建议下一所有者范围。

已读前片：

- `research/docx-picture-toc-20261017.md`、`docx-picture-check-20261017.md`：真实像素、共享媒体、无 xfrm、保存 history；已明确没有八把手。
- `research/docx-pptx-toolbar-browser-20261017.md`：DOCX crop PNG120×80及 cutout 角像素、各 ZIP history；组合复制不是组图 Canvas 裁剪证据。
- `research/pptx-picture-crop-20261017.md`：顶层任意旋转/翻转及平面相机，crop+frame 同操作。
- `research/pptx-group-picture-next-20261017.md`、implementation/check：直接普通成员数值/opacity/replace/cutout 已完成，禁止套用顶层几何。
- `research/toolbar-pptx-image-formats-browser-20261017.md`：六图片来源、直接组 TIFF/cutout 与所有 entry history 已验；父45°/flip XML保留不是其像素位置已验。

| 当前文件 | 责任/证据 |
| --- | --- |
| `packages/office/src/editors/DocxImageControls.tsx:148–162,193–224` | 原始 crop 当前值与纯显示预览，无手势 |
| `packages/office/src/editors/docx-image.ts:69–144,206–235` | 冻结 PM doc/node、一次 history、像素 crop、替换清旧 crop/fill |
| `packages/office/src/docx-image-save.ts:12–71` | 原件缺 xfrm 的最小 baseline 适配，保持不改 vendor |
| `packages/office/src/editors/docx-table-design.ts:161–218,248–320` | 当前 draft只有样式/look/align/AutoFit/margins，无 float 参数 |
| `packages/office/src/docx-table-save.ts:16–37,186–219` | float attrs已纳入变化集合，生成后按属性只替目标 tblpPr/tblOverlap |
| `packages/office/src/editors/PptxEditor.tsx:1039–1050,3202–3211,3318–3364` | 直接组图单独context；cropTarget当前只接顶层 selectedObject |
| `packages/office/src/editors/PptxPictureCropCanvas.tsx:24–68` | 当前API仅顶层target，绑定key未含parent；可提取手势而非复制第二套 |
| `packages/office/src/editors/pptx-picture-crop.ts:39–100,102–204` | 本地/slide互转、四边srcRect、crop+native box；43行显式拒media |
| `packages/office/src/pptx-svg.ts:615–642,753–758,977–989` | 图片有transformAttr；groupNode只有translate，调用者没有补组旋转/flip |
| `packages/office/src/pptx-picture-edit.ts:20–65,67–115` | 精确直接child slice、目标原生XML补丁；edit目前仅crop/opacity，不带box |
| `packages/shared/src/pptx-picture.ts:14–23` | 私有 manual_picture 没box，不能忽略严格schema直接传 |
| `apps/server/src/services/pptx-manual-picture.ts:10–26` | 工作副本原生编辑到一次结果，不应另造发布链 |
| `apps/server/src/services/pptx-manual-upload.ts:29–64,136–172` | 仅五容器，固定视频65%×60%/音频25%×20%几何 |
| `packages/office/src/editors/PptxAssetControls.tsx:51–133,370–438` | 插入previewError会挡嵌入；已存在MOV预览映射video/quicktime，缺m4v；player不写文稿 |

### 3. 外部版本与具体执行证据

#### GenOffice：主参照

固定 checkout `/tmp/mimir-genoffice-html-git`，任务既有固定版本 **480548fd55f1be3593ee0d8e316a734751d58309**；本研究直接读取该 checkout，不升级版本，不执行 Git 操作。

- DOCX `apps/docs/src/renderer/components/PictureDialogs.tsx:8–10,244–268,320–340,356–395`：八手柄与move，原分辨率 drawImage；JPEG质量0.92，其余PNG；新图不保留可恢复原图。Enter应用342–352。
- DOCX `components/Ribbon.tsx:938–971`：原图 imageReplace/new genImage，保持当前显示宽度，新高随新像素比例；清imageCrop/imageFillRect，保留drawing身份与环绕位置。
- DOCX 同文件`:1205–1264,3963–4001,4077–4117`：表属性按钮真实执行 AutoFit + float attrs；none/left/right、signed X/Y、distance。保留现有margin/page/text锚点，缺省margin；right且X为0有按有效当前表宽求右边缘的便捷语义；高表 floatSuppressed 保留。
- PPTX `apps/slides/src/renderer/picture-edit-actions.ts:12–36,39–69`：`slide.nodes.find(sourceId)`只取顶层；从旧crop恢复fullBox，提交同时改srcRect+box，不拉伸回旧框。`:79–85`只在去背景时明确排除media。
- PPTX `components/Ribbon.tsx:3185–3190`、engine `packages/pptx-engine/src/index.ts:1075–1088`：crop入口与实际writer只判picture，均未排除media；媒体封面crop是真实固定版能力。
- PPTX `apps/slides/src/renderer/SlideCanvas.tsx:2192–2236`、`NodeBody.tsx:1146–1165`、`konva-adapter.ts:23–45`：父group与child均通过中心pivot rotation/flip。Mimir group仅translate与此不同；需要渲染回归。
- PPTX `apps/slides/src/shared/media-kinds.ts:1–23`：video mp4/m4v/mov/webm/avi；audio mp3/wav/m4a/aac/ogg。不是接受所有audio/video MIME。
- PPTX `apps/slides/src/main/slides-main.ts:3717–3725,3740–3778,3782–3822`：真实选文件和embedMedia；AVI/部分ISO-BMFF音轨先警告仍可嵌入，不能播放不是坏容器。`:3826–3858`明确MOV以video/mp4供Chromium，原包ContentType仍可为video/quicktime。
- PPTX `apps/slides/src/main/video-size.ts:9–21,25–68`：实际可从MP4/M4V/MOV/WebM/AVI取尺寸；视频1像素=1pt、只缩不放大、居中；未知尺寸明确16:9回退；音频64pt方形。`:71`以下为有界元数据读取参考，移植前仍需审查坏盒/预算。
- PPTX `insert-actions.ts:395–415`：drop的centerPx、kind/ext/name是真实参数。固定GenOffice `slides-skill.ts:379–437`只声明分析和图片URL插入替换，并无专用insert_media工具；媒体插入主要手动/通用native op，不应凭空新增公开Agent工具名。

#### WeKnora：已检查相同固定证据，适用性有限

按 AGENTS 要求检查官方站点 `https://weknora.weixin.qq.com/` 与公开源码 `https://github.com/Tencent/WeKnora`。沿用本任务同日已实际HTTP200的 **v0.8.3 / 3e22822c1d2397be730c458c7539d0eb8c113a24**，不把复用缓存写成此次重新联网成功。

- `research/xlsx-pivot-next-plan-20261017.md` §3已有HTTP200站点113529bytes、tag API固定commit及源码13533bytes。
- 本研究重新只读缓存 `/tmp/mimir-group-flip-weknora-site.html` 与 `/tmp/mimir-group-flip-weknora-definitions.go`；SHA256分别 `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe` / `3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0`，与既有证据一致。
- 固定 `internal/agent/tools/definitions.go:14–21` 为KB search/read/list；`:29–49`明确文件工具按真实sandbox能力注册，不能提供无效checkbox。可借鉴真实目标/能力门控，不能拿WeKnora Markdown做Office Ribbon、crop坐标或OOXMLwriter参考。视觉继续按用户已有紧凑Inspector和Obsidian风格。

### 4. 最小顺序实施与所有权

建议每片implement→独立check→root浏览器。一个所有者串行完成每片，禁止DOCX与PPTX共享Editor多代理交叉写；只共享研究。不改vendor或共用Shell。以下是建议，不代表已派发/批准的产品改动。

#### A. DOCX 预览拖裁剪（可先做，等待forms释放DocxEditor接缝）

**所有权**：`DocxImageControls.tsx`、`docx-image.ts`、`docx-picture-controls.css`，新 `DocxImageCropPreview.tsx` + 纯 `docx-image-crop.ts`及tests；实际Editor回归沿`DocxEditor.picture-history.test.tsx`。必要DocxEditor接缝由根协调，通常不必改Editor。

1. 在当前crop mode原图预览直接加八把手和框内move；保留四边数字并与同一insets草稿双向同步。不要新增全宽表单/520px modal。八把手的视觉尺寸与可触目标分开，320px面板内按原图比例等比fit，长横图/竖图不能被min-height撑变形。
2. 初值沿现有`:148–162`：原件已有imageCrop时以原图坐标还原真实保留区；已有replacement时对replacement完整像素起算。`imageFillRect`不是crop，不能当裁剪百分比静默写；保留当前可见预览差异及明确处理说明。
3. 比例采用[0,1]纯几何；拖动用实际图像content rect（不含letterbox）换算；pointercapture、单pointer、移动区域clamp、最小1源像素且可触目标保持可用。数字与手势不能两套舍入产生二次crop。纯几何允许非常小保留区，视觉把手不能决定损失的最小源像素。
4. 与上游一致为**像素裁剪**：最终`processDocxImage(source,{kind:'crop',insets})`输出原分辨率保留区，`draft.width`保持、新height按输出像素比；旋转/flip/align/wrap保持，`applyDocxImageDraft`清旧crop/fill。原件JPEG可扩展输出JPEG以对齐上游；若沿现有PNG输出，应明示为现有Mimir编码合同，不声称JPEG保持。GIF像素加工静态PNG，应在操作处说明。
5. 单一固定主动作：可保留“预览”仅作为草稿准备，最终一次“应用图片格式”才写PM；更简洁是crop mode的“应用裁剪”先处理后**同一次**提交当前格式草稿，仍只一次publish/history。不得预览成功就改文档、再要求另一不可见Apply。no-op打开/关闭、全图未改不能重编码制造dirty。
6. 绑定editor实例+源文档+PM doc/node/pos及附加options身份。外部transaction/切文档/保护策略变化取消；decode/toBlob每次await后再核对。成功filterTransaction拒绝不得显示成功或更新target。自己的busy不使自身卸载。Escape先取消手势，再退出crop返回图片格式，最终关闭Inspector回live入口；不要全局Enter吞掉数字输入提交。

**专项验收**：

- 纯geometry：8handle+move，四角/越界/反向/最小区，298px可用宽、20:1/1:20、DPR1/2、preview缩放、数字→拖动→数字一致；不按页面boundingRect猜图片rect。
- native：240×160四象限PNG，保留右下120×80精确像素；半透明PNG；JPEG/GIF；已有srcRect10/5/15/20%、rotation30/flipH及front/inline两种原件。保存两次及save→undo/save→redo/save，原图/新图/共享媒体及custom sentinel保留，目标rels/media允许集合之外每个ZIP entry精确。
- actualEditor：真实NodeSelection、初值、drag不写/一次Apply一次Undo、失败保持draft、并发正文改动/失效target/迟到decode/abort/关闭零写入、filter拒绝不假成功、按键让位与焦点。
- browser：1280与实际420×500，图片preview比例、每个把手可操作、内部scroll、footer唯一primary在Inspector内，Escape层级/回焦；下载后用root rawHTTP/native像素核对，不用被CWM加工Downloads做基线。

#### B. DOCX 浮动表格位置（A后或独立控件，避免同表设计并行编辑）

**所有权**：`docx-table-design.ts`、`DocxTableDesignControls.tsx`、局部css及tests；`docx-table-save.ts`必要保真补丁。若单独新`DocxTablePositionControls`，仍通过当前TableDesign固定footer提交同一draft。

1. 在现有布局区增加“文字环绕：嵌入/文字在右侧/文字在左侧”和X/Y/距正文。side='left'意为表在左、正文在右，避免label反了。初值读tblFloatSource优先保留suppressed事实；不是只有tblFloat，不能把高表原件冒充inline。
2. 保留未触碰原始integer twips、四边不同distance、page/margin/text anchors及XSpec/YSpec；不要把显示0.01cm精度的回显整体写回。距离可用四边或显式linked统一距离；混合值显示混合，未修改不归一。已有alignment关键字时显示实际关键字，修改数值应显式替换该轴spec。
3. 数值signed X/Y，distance≥0，厘米到twips统一`1440/2.54`并四舍五入；不要抄上游567的近似常量导致往返漂移。新float default margin；既有anchor完整保留。right预设仅在用户新选right并未自填X时按当前节内容宽和实际表宽求边缘，已有真实X=0不能一打开就跳位。
4. float width、AutoFit、tblFloatSuppressed按真实当前模型：table太高不可float应保留source及明确当前为分页流式显示；不简单把suppressed设false。Window AutoFit与right宽度同步；不多次`runTableCommand`产生多个history，把所有变化和cells/grid更新合一个PM transaction。
5. 现有`docx-table-save.ts:214`整体替tblpPr/tblOverlap有可预见保真风险：vendor generate`:2133–2140`生成新tag会丢原未知attributes、XSpec/YSpec和overlap设置。为此片补目标属性增量patch（只改触碰轴，保留其他属性/扩展/命名空间）；inline明确移除tblpPr及其位置生效参数，不能把无触碰既有非overlap改成overlap。复杂未知定位不具备可靠解释时按目标禁用且原件no-op精确，不把数字零当真实当前值。

**专项验收**：

- fixture：top-level4×3表，后随长中文段落便于观察真实wrap；另一节不同纸宽；原left/right/page/margin/text锚点，signed负Y、非对称distance、XSpec=center与YSpec=bottom、allowOverlap=false、未知tblpPr属性/注释，vMerge/对角边框/超链接/field/custom sentinel；另高表suppressed。
- UI：嵌入→左→右→自填负X/Y→嵌入；初值原整数不动、只改一轴不损另一轴spec；AutoFit fixed/window/contents与有效宽；不同节右边缘；真正文字环绕而非浮动位置只写XML。
- native：只目标tblpPr预期差量、取消和noop完整原件、文本及所有格/merge/field原XML保持，save/reopen两次、Undo/Redo全entry；同一Apply一个history，结构变化/删表/切目标拒绝零状态。
- 1280/420×500、320pxbody内部scroll/footer固定，数字单位完整，Select Escape先收弹层再回入口。

#### C0. PPTX 父组渲染与共享几何前置（必须先于组图Canvas）

**所有权**：`pptx-svg.ts` + 新纯group-placement/matrix helper与tests；必要选择overlay bbox工具同一个所有者修，不动vendor。根先确认这一前置范围，避免把问题藏在crop组件。

1. 目前`groupNode`只translate且`renderNodes`直接接结果，父rot/flip没有其他外层补偿。补父组中心pivot，与当前图片SVG transform顺序一致；子坐标已烘焙ext/chExt，**不得再次scale整个父组**导致双倍缩放。
2. 参考vendored `pptx-render/src/build-slide.ts:625–672`：childOffset/chExtent→childScale与parentOffset；`coords.ts:118–145`：center先缩放、近90/270°子角在非等比scale时交换X/Y宽高因子。组中child box不是原始EMU；不能按slideSize直接换回。
3. overlay和底图共用有限可逆二维矩阵，正向/逆向带同样的父中心flip/rotation、child centerflip/rotation、viewport变换。原生chOff/chExt只应用一次。记录determinant与finite验证，任何零/坏extent先禁手势，不做猜测。
4. 非等比组+非90°子旋转可能涉及真实OOXML shear，而固定renderer的placeTransform是约定近似；必须把“与现有renderer一致”和“与PowerPoint真实几何一致”分开证明。不得凭简单S×R矩阵就称已覆盖任意Office仿射。至少为37°子角+1.5×2缩放补固定上游render/原生四角参照；若两者不同，先完成图片几何适配再开放该case，不默许错误位置或列为已齐。

#### C1. PPTX 直接组内图片拖裁剪（C0后）

**所有权**：`PptxPictureCropCanvas.tsx`/`pptx-picture-crop.ts`或提取新group helper、`PptxGroupPictureControls.tsx`、`PptxEditor.tsx`最小接缝；native `pptx-picture-edit.ts`；strict shared `pptx-picture.ts`与server manual-picture/host tests，同一所有者顺序完成。

1. 从现有groupPictureContext拿唯一顶层parent和唯一direct普通pic，保留`resolvePptxGroupPicture`的MC/歧义/deep/media guard；入口加“在画布裁剪”，不造第二长面板。入Canvas冻结document/source/native slidePath/首次parent+child durable refs/published version/viewport+workspace identity，键含group避免与顶层或兄弟目标串用。
2. 提取原有Canvas手势层接受geometry/commit adapter，不复制八把手状态机。pointer先由CSS/viewport变换到slide，再经父矩阵逆变换到group-local，再经child逆变换到crop坐标；屏幕方向键也经同一inverse，Shift10px。原图幽灵和清晰区使用同样矩阵。
3. 初始fullW=当前显示frameW/(1-l-r)，fullH同理；crop四边永远相对原像素，向外拖恢复既有裁掉内容。提交新srcRect与**新的child局部EMU box**，不能拿屏幕AABB或原始top-level commit除slideScale后直接写。
4. 一种可审查的逆placement：从新crop中心逆child变换取group-local中心，再用buildGroup的parentOffset/childScale和viewportScale解回native中心；宽高反解placeTransform使用的scale（quarter旋转需交换）；native off=center-ext/2，保留原rot/flip。parent transform/chOff/chExt全部不改。以“同一保留源像素前后屏幕位置相同”做最终不变量，不以box数字看起来正确判通过。
5. `manual_picture`严格schema加可选box（safe整数EMU、cx/cy>0，finite、预算）；box必须与srcRect同事务，不允许box-only偷扩成任意几何工具。native helper只补目标pic的a:xfrm off/ext并保留rot/flip/未知xfrm属性、兄弟节点和parent自身。结果模型/anchor与parent XML同步，最终save/reopen后一次publish，noop不增version。
6. attached connector应像顶层crop原语一样处理：先找与该child身份关联的connector；可证明引用映射时同一候选内更新并记录允许差量，不能原生已位移却留connector旧端点。未实现可靠关联前该目标明确禁Canvas，不能静默忽略并记全兼容。
7. 成功采用当前published revision重绑目标，不能自己的成功version触发旧effect取消；失败保留draft可重试；换页/选择/parent编辑/手工写/源/保护/卸载/失焦abort并清手势，迟到结果不覆盖新对象。Escape只取消这一层，恢复“在画布裁剪”live入口。

**专项验收与稳定fixture**：

- 复用`editors/pptx-group-picture-test-fixture.ts:15–89`，已有45°/flipH父组、非零chOff(200000,100000)、ext/chExt=(1.5,2)、child37%与非零crop、兄弟和跨页共享媒体。**新建独立生成样本**，不要用已多轮被浏览器改过的库文档作为baseline。
- 新fixture矩阵：parent0/30/45/90/270°×四flip；child0/37/90/270°×四flip；parent均比/1.5×2；child自身crop10/5/15/20%；图用200×120四色格带细网格与编号，允许精确观察任一源像素。另child平面镜像相机、透视拒绝、deep/MC/duplicate IDs/坏extent/缺媒体/同图兄弟、attached connector。
- geometry：正反变换roundtrip、8handle、屏幕1/10px方向键、向外恢复、frame/crop同时改；非零chOff与quarter交换不能只测试原点/等比组。EMU四舍五入后允许屏幕误差以实际viewport的≤1EMU投影+srcRect十万分位界定，不能放宽为数px掩盖反算错。
- native：只目标slide XML变化，无媒体/rel变化；parent transform、所有兄弟和另页XML精确；crop目标xfrm仅off/ext变化，rot/flip/effects/opacity/links/animation身份保持；save两次，再save→Undo/save→Redo/save全entry精确。
- actualEditor/host：一次manual_picture发布一次history，schema拒绝box-only、非法box、错parent、过期/取消、host工作副本末步失败均零bytes/version/dirty/history；原cNvPr别名升级后连续crop→save→crop仍绑定原目标。
- root浏览器实际1280及420×500、100/150%viewport、side Inspector重叠、8handle和长竖图、primary不被footer挡住、Escape/回焦、下载原生回读。截图必须看parent45°/flip的像素显示，不能只报告XML保留。

#### D. PPTX 媒体实际差距（C1后，避免Editor/host文件冲突）

**所有权**：新`pptx-media-info.ts`/尺寸helper；`pptx-manual-upload.ts`、`PptxAssetControls.tsx`、shared manual-upload可选natural/center参数与renderer接缝；媒体tests。顶层媒体封面crop可与此片一起接，组内媒体封面另评估，不放宽普通组图片replace保护。

1. 五种已支持容器不重做；添加MOV/M4V/AVI/M4A/AAC的真实签名/有界容器校验和合理MIME别名。仅扩accept或用extension判断不算完成：AVI必须RIFF+AVI不是WAV；AAC识别ADTS而非任意FF sync；ISO-BMFF检查盒长/brands和可读track类型，避免音频改名MOV混过；预算、截断和溢出预拒绝。
2. 生成/获取natural video size后保持原比例，沿上游videoFrame的EMU语义；音频64pt方形。未知尺寸明确16:9fallback而非任意slide65%×60%；预览poster按同一比例，不受视频HTML默认宽高拉伸。可选center只在用户drop/放置时提供，严格finite+范围；当前手动chooser可居中，无需新增一排X/Y字段。
3. “无法预览”与“文件无效”分开：AVI/浏览器不支持codec可显示清晰提示仍允许合法原字节嵌入，使用原生placeholder poster。根用户不需安装转码器、无需模型。上传过程中选择切换kind须清前个选择或重新验证kind，关闭/切页取消，poster await迟到不能提交旧页。
4. MOV/M4V preview MIME用video/mp4（供浏览器），保存原文件ext/ContentType保持；播放仅临时状态无dirty/history，外链媒体不自动fetch当前权限策略保持。媒体gallery不要出现“可播放”未经验证承诺。
5. 顶层media picture裁剪：仅合法可读poster走现有srcRect+box原语；保留a:videoFile/audioFile、p14:media、全部rIds/原媒体hash、timing。媒体去背景/replace继续拒绝，不能为了crop把它转换为普通图片。自有播放pane可停止旧播放并用新frame显示；所有crop/cancel/history同顶层普通图。
6. 没找到固定版持久化trim/volume/loop/autoplay设置与writer；不新增无执行器字段。mediaPlay/Pause/Stop动画已有PptxAnimationGallery和native op，不应因媒体分类重新列缺。公开Agent参数另按固定工具catalog核，不把手动上传扩展当真实模型调用已验。

**专项验收**：

- 合法真实小文件：320×180及180×320视频，MOV/M4V含H.264、AVI（明确预览警告）、M4A/AAC可听短音；沿现有screen-recording-flower.webm与小WAV生成器。不可用只有伪头空壳作为成功fixture；真实编码样本必要时后续实现者用已存在合法工具生成并记录hash/时长/尺寸，研究本身未安装依赖或执行转码。
- 包含坏box length、截断moov、wrongtrack/renamed、大小预算、preview失败可嵌入、poster失败回退、类型切换、取消和迟到；manual上传一次publish/history与两次保存，原媒体hash严格相等、必要双关系和ContentType正确，非目标每entry精确。
- 插入真实16:9/9:16不拉伸，音频64pt平方；播放seek/volume只影响临时HTML节点，切页/Escape停止，保存禁用状态不变化。
- 媒体封面初始crop→拖/向外恢复→保存重开，srcRect+frame正确而AV/timing/所有媒体hash精确；UndoRedo全entry。
- 320px内部scroll/固定一个主动作、420×500真实选择preview+warning、没有因提示长文挤走primary；按键和焦点返回现有入口。

### 5. Related specs / 交付门禁

- `.trellis/spec/project/rules.md`：不改vendor、不抑制React规则、不把未验证判断写成现行约束。
- `.trellis/spec/office/engine/index.md`、`conventions.md`：补丁保存/原件保护/当前句柄，保护不能只靠工具禁用。
- `.trellis/spec/office/frontend/editors/index.md`、`conventions.md`、`pitfalls.md`：Ribbon72px折叠、320pxInspector、内部scroll、唯一fixed primary、published版本、首次durable别名、取消和焦点。
- `.trellis/spec/office/frontend/shell/conventions.md`：表单原语/真实单位、独立滚动和层级；不修改公共Shell布局。
- `.trellis/spec/shared/contract/index.md` 与document-agent合同：严格schema单一来源，私有manual参数不要污染固定公开Agent vocabulary。
- `.trellis/spec/server/backend/index.md`：上传鉴权/预算和工作副本发布，沿既有host。

每片目标native+纯几何+实际Editor+host专项、受影响包tsc、目标oxlint/oxfmt、涉及Antd控件独立lint；独立checker后root统一build和真实浏览器，不能把本研究建议测试计作通过。不要由多个实现者同时跑全套或build，不重跑全仓已知480bundled技能lint找同一问题。用户已选浏览器验收、Desktop自验、无模型时不声称真实Agent模型通过。

## Caveats / Not Found

- 本研究只读源与既有证据；未运行App、截图、测试、build或新的格式实验。行号随其他代理代码变化可能漂移，实施者须按符号定位。
- 父group SVG渲染缺transform为直接源码证据，尚未在真实浏览器复现/量化；必须作为C0测试先红后绿，不能凭本报告改大范围renderer。
- 固定上游Canvas crop只找顶层；组内仿射裁剪和任意深层编辑不是上游完整能力。本片为用户已接受队列补充直接成员，仍不能冒称所有Office结构兼容。
- 常见非均匀组缩放+任意child旋转存在renderer近似和真实Office shear差别，尚无本轮实测外部Office四角结果；不自动接受错几何或将未证case宣称完成。
- DOCX浮动表格定位上游是属性面板，不是自由拖动；DOCXcrop上游是预览像素加工，不是PPTX式srcRect。交付文案必须保持这种语义区别。
- 没找到固定GenOffice持久化媒体trim/volume/autoplay/loop执行器；没有据营销文案扩大数字证书等范围。
- 不修改product/spec/implement；本文属于下一片研究建议，root负责审批/任务记录/所有权排期。当前DOCX forms/PDFOCR实现者不应被这份报告干扰。
