# PPTX 画布拖动裁切（2026-10-17）

## 边界与来源

原有 `PptxPictureControls` 只提供四边百分比，未提供画布裁切把手。新增独立 Canvas/纯几何适配/CSS 与专项测试；根会话唯一整合 `PptxEditor`。继续使用原生 `setPictureSrcRect`，不改 vendor、服务端、数值裁切、模型白名单或其它格式。

- 固定 GenOffice：`/tmp/mimir-genoffice-html-git` HEAD `480548fd55f1be3593ee0d8e316a734751d58309`，已实际 `git rev-parse` 核对。
- `apps/slides/src/renderer/CropOverlay.tsx` 1–14、110–124、126–245：8 个把手，从已有 srcRect 重建完整原图范围；向外拖动恢复裁掉内容；Enter 应用、Escape 取消。
- `picture-edit-actions.ts` 11–35、39–77：裁切必须同步改变目标框，保留源像素在屏幕上的比例/位置，而不是把被框选区域拉伸回原框。`pptx-ops/src/ops/element-ops.ts` 294–342 的 `setPictureSrcRect` 已支持可选 EMU `box`，同一个事务保存 crop 和 frame。
- Mimir 画布沿已有 `pptx-svg.ts` `transformAttr` 的中心旋转/翻转顺序，复用 vendored renderer 的 `flatCameraMirror`，支持任意旋转、横/纵翻转和平面镜像相机。实际三维投影、媒体封面、非法几何/已有非法裁切明确提示使用数值裁切；根会话须限制入口为顶层图片，组内坐标转换不在本组件范围。
- WeKnora 官方站点本次 HEAD 12 秒超时，未取得响应；同一固定版本公开源码重新抓取 15 秒超时，未记成功。再读已有固定 v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24` 缓存 `/tmp/mimir-pptx-weknora-definitions.go`：`search_knowledge`、`read_document`、`list_documents`、wiki/sandbox 工具定义与图片裁切几何、Office Ribbon 无关，故不以它作为文件编辑交互模型。缓存证据沿既有来源记录，本轮没有假报网络抓取成功。

## API 与交互

`PptxPictureCropCanvasProps`：documentId / slideKey / version / target 绑定；picture element；width/height 渲染 px；slideWidth/Height EMU；可选 imageHref（原图）；disabled；`apply(srcRect|null, expectedVersion, signal, box?)`；onBusy/onExit。

`pptxPictureCropGeometry` / `pptxPictureCropUnavailableReason` 供宿主复用可用态。`pictureCropCommit` 同步计算原图绝对四边比例和旋转/翻转修正后的原生目标框。op 的 `box` 不可省略，否则拖动预览与提交后会不同。

- 原图幽灵预览 + 保留区域清晰预览、三分线、8 个可 Tab 的把手；方向键按屏幕方向微调 1 px，Shift 为 10 px；Enter 应用。
- 下方紧凑浮动操作条显示保留面积，恢复完整原图只改草稿；明确“应用裁切”和“取消”，按窄栏自然换行。选择外部控件不隐式写文稿。
- 取消、Escape、窗口失焦、文档/页/目标/版本/尺寸/外部禁用变化中止 pending；迟到结果不退出新目标或报旧错误。自身 busy 不应传回 disabled（与 Shape Canvas 相同），否则会自行卸载。
- 失败保留重试草稿及原图片，busy 同步 ref 防重复写。成功/取消后组件即使宿主晚卸载，也拒绝再次写入和重复退出。
- 仅几何和临时预览在本组件内；原生 session/history/save/readback 由根会话现有句柄接线。取消不制造 dirty/history。

## 已运行验证

- 两文件 43/43：纯几何/原生 32 项 + Canvas 11 项。覆盖 5 个角度 × 4 种翻转，裁切前后的同一源像素保持同一屏幕位置；完整范围恢复、8 把手边界和最小范围、极端原裁切舍入、平面镜像与拒绝非平面/媒体。
- 原生事务在 `image-deck.pptx` 上执行同一 `setPictureSrcRect` 的 srcRect+box，实际 save 后由 Mimir 重新解析；旋转/翻转/目标框和四边比例正确；第二次保存再开保持；逐 ZIP entry 只有 `ppt/slides/slide1.xml` 改变。
- Canvas 覆盖缩放后的真实 pointerdown/move/up、未点应用不写、单次提交、方向键/Shift/Enter、裁切向外恢复、Escape 先于父 Inspector 关闭、请求 abort/迟到结果、目标绑定变化、窗口失焦、取消、失败可重试、回调身份变化不自行 abort。
- 目标 Oxlint 通过，Oxfmt/Office tsc 最终结果由根会话合并门禁记录。

## 验收分工与限制

根会话负责真实浏览器宽屏/420px、保存/撤销/重做下载、焦点回到真实 Ribbon 入口的集成验收；不能把组件测试当浏览器验收。无可解码原图时应禁用画布入口并解释，数值裁切保留；图像滤镜/轮廓效果仍由原件与渲染器保留，裁切操作不改变这些属性。桌面用户自验，真实模型无配置不宣称已验。整体任务继续进行，不提交/暂存/归档。
