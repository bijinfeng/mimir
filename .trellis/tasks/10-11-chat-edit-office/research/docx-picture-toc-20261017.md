# DOCX 图片上下文与目录手动入口

2026-10-17；实施切片，整体任务继续 in_progress。

## 最小行为缺口与边界

- 目录沿现有 `apply_ops.insertToc` 接位置选择/标题预览，保留 Agent 版本与真实历史。
- 图片沿 PM `docProtected` 原生属性接尺寸/比例、旋转/翻转、排列与环绕、裁切/替换/去背景；右侧 Inspector，内部滚动、底部一次应用。草稿不写正文，异步结果核对冻结文档与节点；卸载/取消 abort。
- 图片字节沿原生 `imageReplace`（原件）或 `genImage`（未保存新图）；原生 convert/patch 保存。禁止替换整个 drawing 以伪造旋转。
- 代码范围为 DocxEditor、新 DOCX 控件/纯适配/CSS/专项测试；不改公共 shell、renderer、其他格式与 vendor。

## 经原生回读发现的必要保存适配

真实 kitchen-sink 原图的 `<pic:pic>` 没有 `<pic:spPr>/<a:xfrm>`。固定引擎
`generate.ts:53` 的 `patchImageParagraphXml` 只替换现存 xfrm 开标签，导致原图
旋转/翻转在画布生效，保存重开后丢失；新插图不受影响。专项测试先证实失败。

根会话已同意最小跨层扩展：`src/docx-image-save.ts` + `docx.ts` 一处调用。
仅在原图当前变换确实改变且缺少可写 xfrm 时，向该 baseline block 的 XML 副本补
标准 pic:spPr/xfrm；后续变换、尺寸/effectExtent 仍交原生 patch。保留原 pic、rId、
媒体和兄弟 XML。no-op 不改变基线，不修改 parsed 原始块，不手改 vendor。
自闭合 shape properties/xfrm 也需覆盖；结构歧义明确失败，不静默降级。

## 固定参考与适用范围

GenOffice commit `480548fd55f1be3593ee0d8e316a734751d58309`：
`apps/docs/src/renderer/components/Ribbon.tsx:938–1025` 为替换/原件身份/清旧crop/
旋转/翻转/厘米尺寸；`:2179–2350` 图片上下文；references tab 的 insertToc。
本地像素去背景复用同版本 `packages/ui/src/cutout.ts` 边缘颜色 flood-fill，无模型。
裁切输出全分辨率 PNG，像素操作明确限制 2000 万像素，不静默降采样。

WeKnora 复用本轮 HTTP200站点与 v0.8.3 固定 commit
`3e22822c1d2397be730c458c7539d0eb8c113a24` 的 definitions.go；路径和行证据见
`editor-remaining-tools-current-20261017.md`。知识检索/能力门控与本片图片几何、
DOCX补丁保存不对应，不能作为 Office Ribbon 的实现模板。

## 验证计划

原生真实保存重开、两次保存、保存后撤销/重做及全部 ZIP entry 对照；原图/新图、
替换/裁切/去背景 PNG、无 spPr/xfrm、自闭合结构与无操作；失败/取消/过期不得改正文。
控件测试验证可发现性/当前值/草稿/无标题；独立 checker 后由根会话做浏览器宽区与420、
下载/保存/history证据。单测不替代浏览器。

## 本片代码检查（冻结交接）

- `pnpm --filter @mimir/office exec vitest run src/editors/DocxImageControls.test.tsx src/editors/docx-image.test.ts src/docx-image-save.test.ts src/editors/DocxAdvancedControls.test.tsx src/docx.test.ts`：5 文件 32/32。最后调整预检深拷贝后，控件 7/7 重跑通过（重叠证据，不相加）。
- Office typecheck、目标 Oxlint、目标 Oxfmt check、`pnpm lint:styles` 通过。未重复全 Office 测试，未运行生产构建或浏览器；后两项由根会话整合。
- 适配覆盖缺 spPr、空 spPr、无 xfrm、自闭合 xfrm、普通 xfrm；no-op 字节不变，变换只改 document.xml，原图/新图/替换两次保存与保存后 undo/redo。
- 共享媒体实证：构造两张原图共用同一 rId/media，仅替换首图；次图原绘图 XML 和原像素不变，原媒体保留。单图替换时允许原生清理已无引用的被替换媒体，其余原 ZIP entry 逐字节一致。
- 图片 UI 在应用前用深拷贝快照预检宿主保存结构。异步本地像素结果核对当前 PM doc 与目标节点，取消/关闭 abort，迟到结果不发布；所有暂存调整只有底部应用才进正文/history。

## 真实 Editor 保存历史与下载目录加工排查

- 新增 `DocxEditor.picture-history.test.tsx`，用 kitchen-sink 原件构造固定
  `MimirHistorySentinel` 自定义属性及对应根关系和 ContentTypes；挂载完整
  `DocxEditor`，通过图片 Inspector 应用旋转30°/水平翻转，真实 io 捕获保存字节。
  save → undo/save → redo/save 的全部非目录 ZIP entry 逐字节对照通过1/1：
  首次仅 document.xml 变化，undo 与完整基线全等，redo 与首次保存全等；
  custom.xml 原字节、根关系、ContentTypes 全保留。
- Downloads 内的浏览器验收文件会在落盘后被外部异步加入 CWM 自定义属性。
  同一路径 `(3).docx` 首次读取11条目无custom，数秒后重读12条目且出现CWM属性；
  baseline/(1)/(2)/(3) 的CWM名称和内容各异，上传源 `/tmp/mimir-docx-picture-toolbar-fixture.docx`
  本身没有custom.xml。根会话直接HTTP下载到 `/tmp/mimir-docx-picture-response-redo.docx`：
  11条目键与上传源全等，仅预期 document.xml 变更且与首次保存主XML全等。
  因而不增加生产适配；后续文件保真证据用HTTP响应直接写入/tmp，避开下载目录加工。

## 明确边界

- 本片目录只补现有 insertToc 的可用手动入口；更新已有目录、浏览器真实页码回填仍未扩展。UI 标明 Word 更新页码，不能把插入字段当手动更新已齐。
- 图片只作用于真实选中的 `docProtected` 图片节点；VML/同块多 pic 变换等歧义结构明确拒绝。不改 public Agent setImageProperties 参数白名单。
- 裁切支持四边百分比和实际保留区域预览，输出原分辨率 PNG；本片没有新增八手柄拖裁切手势。去背景是固定上游边缘颜色算法，不是模型抠图。
- 真实宽/420视觉、下载/保存/历史、焦点返回和真实 canvas 像素输出待根会话浏览器验收；模型配置和 Desktop 依用户指示不阻塞本轮。
