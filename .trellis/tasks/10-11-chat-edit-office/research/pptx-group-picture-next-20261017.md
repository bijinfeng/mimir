# PPTX 下一切片：直接组成员图片与来源格式（2026-10-17）

## 结论与建议顺序

本轮仅源码调研，未实施、未运行测试或构建、未进行浏览器验收。现行总盘点为 `editor-remaining-tools-current-20261017.md` §6；旧 Ribbon 96 回调审计是历史快照，不能据此把已完成项重新列成缺口。

1. 最小切片：**一个顶层组合的一个直接普通图片成员**，补真实当前不透明度、四边数值裁切/重置、替换与同尺寸去背景输出回写。保留已有轮廓与几何入口，不重复开发。普通替换重置旧裁切，同尺寸去背景才保留裁切。
2. 图片来源格式另作一个闭环：上游允许 PNG/JPEG/GIF/BMP/WebP/TIFF；先完成服务端实际格式/尺寸检测与原字节保存，再开放对应入口。TIFF 必须同时有仅用于显示的解码路径。
3. 组内画布拖裁切、组内新增效果参数、深层组合、媒体封面、多图批量替换均单独评估。不能把顶层裁切画布直接套到组内坐标；也不能将这些边界写成固定上游已实现而 Mimir 漏接的命令。

## 固定参考与适用范围

- GenOffice 固定源码：`/tmp/mimir-genoffice-html-git`，本轮 `git rev-parse HEAD` 实际为 `480548fd55f1be3593ee0d8e316a734751d58309`。本报告优先核对这一版 Office 原生工具、交互与保存实现。
- `apps/slides/src/renderer/components/Ribbon.tsx:3051` 起：图片上下文含去背景、替换、透明度、边框、裁切、旋转/翻转；透明度菜单约 `3080–3115` 是预设档位。可借鉴按目标显示图片工具；Mimir 继续沿紧凑 Ribbon + Inspector 风格，不复制整套上游大图标功能区。
- 上游 `slides-main.ts:2418–2448` 文件选择器与 `pptx-engine/src/insert.ts:452–461` 原生 `IMAGE_MIME` 一致允许 `png/jpg/jpeg/gif/bmp/webp/tif/tiff`；这不包含 SVG/EMF/WMF 的新增写入。已有文稿能读取这些格式，不等于新增图片允许这些格式。
- WeKnora 官网 `https://weknora.weixin.qq.com/` 本轮实际 HTTP 200，113529 bytes；标题为「WeKnora — 帮你找到答案，并将知识付诸实践」，已有本地页面缓存 `/tmp/mimir-pptx-chart-weknora-site.html` 的说明标明 v0.8.3。公开源码固定 `Tencent/WeKnora@3e22822c1d2397be730c458c7539d0eb8c113a24` 的 `internal/agent/tools/definitions.go` 本轮网络重读超时，使用已取得的 `/tmp/mimir-pptx-chart-weknora-definitions.go` 缓存：14–22 知识检索、35–49 sandbox capability、69–78 wiki scope。能力与权限应真实绑定的原则适用；没有 PPTX 组内图片 OOXML/工具栏合同，不作为 Office 图片工具主参考。未将超时记作公开源码重新抓取成功。

## 现有能力和真正缺口

| 目标/能力 | 当前事实 | 代码证据与限制 |
| --- | --- | --- |
| 顶层普通图片 | 已有 PNG/JPEG 插入/替换，任意不透明度，数值/画布裁切，去背景，旋转/翻转、轮廓和效果相关入口 | `PptxEditor.tsx:1943,2404,3893,4361`；`PptxObjectControls.tsx:646`；`PptxPictureTools.tsx`。不应再次列为整体缺失。 |
| 直接组成员选择 | 已有画布首次选组、二次或 Alt 点选直接成员，以及统一对象列表 | `PptxEditor.tsx:1530`；`editors/pptx-selection.ts:24–53` 提供 ref/group/depth/ancestors。 |
| 直接成员几何/轮廓 | 已接原生组成员路径 | `pptx-agent.ts:157–170` 的 `GROUP_OPS` 含 setTransform/flipElements/setStroke；engine `editGroupChildStroke:4488` 明确支持 picture。不要重复开发。 |
| 直接普通图片的透明度/裁切/替换 | 当前 UI 与宿主均未接完整链路 | `selectedObject` 在 `PptxEditor.tsx:1035` 故意只取 depth=0，因此 objectTarget/图片菜单/cropTarget/去背景不适用于组成员。`PptxSelectionControls.tsx:93–120` 仅特别嵌入组成员文字控件，未有图片专属面板。 |
| 形状图片填充/纹理 | 已有组成员路径，但语义不同 | `pptx-manual-fill.ts`、engine `setElementImageFill:1640` 只接受 shape/text；不能拿它替代 `<p:pic>` 位图替换或 `<a:srcRect>` 裁切。 |
| 深层组合 | 可发现列表层级，写入明确受限 | `pptx-selection.ts:101–106` 拒 depth>1；engine `findGroupChild:4350` 只找顶层 group 的直接 child；嵌套子组合当整体。不能靠递归改查找来宣称保存/坐标已支持。 |
| 音视频封面 | 与普通图片应分开 | PictureElement.media 标记媒体；去背景、拖裁切已有明确限制。当前旧 manual-picture host 的顶层 replace 判定仅 type=picture，新增链路须显式排除 media，不能复制这个宽判定。 |
| 新增图片格式 | 当前 UI/host 硬限制 PNG/JPEG | 两处 `accept=image/png,image/jpeg`；`pptx-agent-host.ts:99` 的 imageInfo 只识别 PNG/JPEG、8 MiB、单边≤16384；manual-upload 重用它。 |

图片外观中的轮廓是已接项；阴影/发光/倒影/柔化的顶层 `setEffects` 在 `element-ops.ts:574` 仍用顶层 resolveElement，不能假定已有组内效果支持。本次“外观”最小范围应明确为图片不透明度与现有轮廓保留，不将色彩校正、亮度/对比度等未核实能力一起承诺。

## 原生保存与宿主接缝

### 不可直接扩大目标的原因

- engine `editPictureSrcRect:1077`、`setPictureOpacity:1722`、`replacePictureBytes:1758` 都使用 `slide.elements.find`；原生 `setPictureSrcRect/setPictureOpacity/replacePicture` 对应的 resolveElement 同样只找顶层。传 `group` 不会自动支持。
- `agent/pptx-agent.ts:174–207` 会在发往宿主前拒绝不在 GROUP_OPS 的组内操作。因此 UI 增加 group 字段还不足以贯通。
- group 保存真相在父 `grp.anchor.originalXml`。engine 导出 `patchGroupChildXml:4338` 按直接 slice 的 nvId 定位；只改 child 的模型/anchor 可能使预览变化但保存丢失。该 patcher 不处理 mc:AlternateContent 子分支，且只找第一个 nvId 匹配，适配器应先要求唯一直接 child/slice，遇到分支/缺 ID/歧义明确拒绝。
- `replacePictureBytes` 保留 frame/z-order/边框/effects，新增媒体+关系，移除旧 r:link 和替换后不再适用的 SVG 扩展；默认去掉 srcRect。原生 `cleanupSupersededSlideResources` 依赖**整张当前 slide** 的前后 XML 与跨页引用活性。不能在只含 child 的伪 slide 上替换并清理资源，也不能解组→替换→重新组合，后者可能改变 ID、动画、超链接和几何。

### 最小可评审落点

1. **上传字节优先走现有 manual-asset**：`pptxManualUploadSchema` 的 picture 分支当前已有 elementId/keepCrop，新增可选 group（仅替换允许）。`api.documents.applyPptxManualAsset` 已传 File、MIME、文件名、signal，Editor `applyLocalAsset` 也已有 abort 与版本整合。不必为组内图片同时扩大旧 manual-picture 和两个 multipart 协议。
2. 普通本地参数可新增受控 `manual_picture` 私有 action/schema，冻结 `{slide, group?, elementId, patch}`，仅支持 opacity/srcRect；或在 `runPptxHostTxn` 同步 wrapper 中显式适配既有两个 op 的 group 分支。前者权限面更小，适合先交手动工具；后者必须同时更新 hostedOps 的 GROUP_OPS、native validation、op 文档/Agent合同和原子批次测试，不能只放行字符串。
3. 新增 Mimir 自有 helper（例如 `packages/office/src/pptx-picture-edit.ts`）实现严格直接成员定位、当前原生 XML 取值及写回；复用导出的 `patchPictureSrcRect`、`patchGroupChildXml`、`patchedElementXml/patchSlideXml`、`addImageMediaAndRel`、`cleanupSupersededSlideResources`。透明度/替换参考固定 native 语义编写有来源说明的窄适配。**不改 vendor**，不在 live slide 临时把 child 冒充顶层再跑 replacePicture。
4. 先完成所有输入、目标与 XML 可写性预检，再在新 openPptx 的工作副本内做 native mutation；若任何一步失败，不发布字节。父 XML 与 child 模型/anchor同步后，再以完整 slide 前后 XML 做关系清理。最后 save → BoundedZip → 必要读回，成功仅返回一份 bytes、expectedVersion+1、一次记录。session.replaceFromHost 仍是唯一发布点，不能先发布媒体再发布裁切。
5. 当前 `PptxEditor.hostPicture` props 没声明 signal；旧 applyLocalPicture 只有版本比较。新功能沿 applyLocalAsset/受控 handle 的取消链。documentId + slide.path + parent durable ref + child durable ref + version 作为绑定，晚到响应需同时核对；选区变化、切页、文档卸载、取消或外部编辑均不落旧结果。目标以 groupChildDurableId 为主，兼容稳定 nvId 别名但必须唯一；不把重开后的临时 index 当身份。

## UI 和交互方案

- 放在现有统一对象 Inspector 中，一个选中的直接普通图片才显示具名「图片」入口；面板顶部显示「组合名 › 图片名」及紧凑原图预览，明确正在编辑成员。不要解除 selectedObject 的 depth=0 限制来让所有旧顶层控件误作用于组成员。
- 建议独立 `PptxGroupPictureControls.tsx` + 局部 CSS；宽度沿现有约320–340px Inspector，窄420容器适配。分为「图片来源」「外观」「裁切」少量具名区块，保持统一数字控件/间距；避免每个参数再造卡片、长解释或大号横排按钮。
- 外观显示真实 `opacity ?? 1`；四边当前值来自 srcRect。未触碰的字段不写入；本地 draft 绑定目标/版本；非法或对边和≥100%时就地提示。修改仅预览/草稿，显式「应用修改」一次提交；底部动作常驻，取消不制造 dirty/history。替换文件尚未应用可取消，成功回选同一成员。
- 旋转/翻转/轮廓继续调用既有成员工具。去背景可复用算法和预览，但当前 `PptxCutoutControls` props/upload没有 group，需显式适配目标；同尺寸输出 PNG，keepCrop=true 前在 host 再核对原图实际尺寸。不要把去背景说成 AI 能力。
- Escape 先关文件/颜色子层，再退出 Inspector；完成/取消回到真正可见的来源入口。提交期间同步 pending ref 防双击，错误留草稿并可重试；内部滚动时不误关面板，底部动作不出420px可见区域。
- **首片组内只开放数值裁切**，显示「组内图片暂不支持画布拖动裁切」。现有 `pptx-picture-crop.ts` 只用图片自身 transform 和 slide viewport，不合成父 group 的 chOff/chExt、非等比缩放、旋转/镜像。下一片若做画布裁切需完整 affine / inverse 变换与像素位置不变证明，不能误用几何 Inspector 的 bounding box。

## 格式闭环

| 来源 | 写入/显示策略 | 验收要求 |
| --- | --- | --- |
| PNG、JPEG | 保持现有原字节路径 | 不降低8 MiB、尺寸/像素预算、MIME/实际内容校验；补截断、伪后缀与解码失败。JPEG注意 EXIF 方向与PPTX原生朝向一致。 |
| GIF、BMP、WebP | 新增真实magic/dimensions检测，按实际 ext/MIME 保存原字节；无需伪装PNG | 宽高边界、截断/异常头/巨大声明尺寸；真实浏览器可见；动态GIF保留字节但裁切/去背景输出是静态图，应明确说明，不能暗中宣称保留动画。 |
| TIFF | 保留 TIFF 原件，显示/画布解码才转 PNG | 上游 `main/session-state.ts:440–468` 与 `tiff-decode.ts` 明确分离存储/显示。Mimir `pptx-archive.ts:142,312` 当前直接data:image/tiff，Chromium无法解码；仅开放accept会出空图。现有依赖utif2用于DOCX，不代表PPTX已接。选择页/分辨率策略、IFD前置像素预算、读回原字节须专项覆盖。 |
| SVG/EMF/WMF/其它 | 保持已有文稿读取/保留边界，不新增上传允许 | 不在固定原生IMAGE_MIME允许项；不能把读取媒体扩展列表当上传白名单。 |

推荐格式检测提取成服务端共用独立文件（如 `pptx-image-info.ts`），避免 manual-upload、manual-picture、Agent服务各写一套。扩展格式不应误改变系统图片剪贴板目前声明的PNG/JPEG语义；只有真实支持闭环后再同步各入口文案、MIME和类型。TIFF显示适配应独立接入PPTX媒体resolver，不能把所有保存字节预转码。

## 测试边界与分工

### 必要专项

1. 原生 fixture：顶层group含直接picture、共享同媒体的兄弟图片、非目标文字/形状、另页共享媒体、已有srcRect/opacity/边框/effects/旋转翻转/组非零chOff与非等比chExt；逐个修改并save/reopen两次。数值裁切不得改变frame；opacity仅目标blip；replace保留frame/ID/z-order/边框/effects/动画/链接，默认reset crop；去背景同尺寸保crop。
2. ZIP逐entry：opacity/crop只改目标slide；替换只允许目标slide、其rels、新媒体和必要Content_Types/不再引用旧媒体清理，非目标/共享媒体精确保留；反复replace不积累孤儿关系；SVG fallback/r:link清理不得误删兄弟引用。
3. 原子拒绝：错parent、失效/重复ID、deep group、media、mc分支、缺blip、非法数值/格式、keepCrop尺寸不等、取消前后、失败末步，均无session字节/version/dirty/history变化。
4. UI：真实初始37%/非零四边，未触碰字段不写，重置与取消，本地draft切目标/版本失效，双击仅一次，错误重试，420宽及矮窗口底部可达，键盘/子层Escape/焦点，异步切页或手动编辑不覆盖。
5. 集成：一次apply=一次history，save后undo/redo下载逐entry精确；模型未配置时可完成代码/浏览器验收，不能宣称真实Agent模型调用通过。Desktop按用户要求自验。

### 推荐文件所有权

- **宿主/原生适配所有者**：新picture helper与native测试；server `pptx-manual-upload.ts`、新manual-picture/local模块及host/tests；shared `pptx-agent.ts`、`document-agent.ts`必要枚举/类型。若改既有op group合同，其Agent hostedOps/host wrapper也由同一人负责。
- **控件所有者**：新增组图片控件/局部CSS/组件测试，PptxSelectionControls仅一个明确挂载接缝；不改PptxEditor，不动共享Shell。
- **根会话唯一集成人**：PptxEditor冻结选择/版本/Inspector/host回调，必要renderer API接缝，真实宽420与native save/history浏览器验收。先合最小组图片片，再开来源格式/显示解码片，避免多人同时改host与Editor。

本报告未修改产品源码，未测试或构建，未上传或删除测试文件；不能作为上述测试已通过的证据。
