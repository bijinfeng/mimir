# PDF 图片 Inspector 上传交互实施

2026-10-17，`pdf_image_upload_ui`。依据已批准 `pdf-image-inspector-upload-followup-20261017.md`，本片为既有工具交互修正。

## 来源与边界

沿用已记录 GenOffice 固定 `480548fd55f1be3593ee0d8e316a734751d58309` 的图片工具能力；复用同日 `pdf-external-images-next-plan-20261017.md §8` 的 WeKnora 网站与公开源码 v0.8.3、commit `3e22822c1d2397be730c458c7539d0eb8c113a24` 核对证据。未重新发送 HTTP、未扩展竞品研究；WeKnora 仅用于真实能力配置门控，不作为 Office 工具栏样式来源。样式沿当前紧凑 Ribbon / 320px PDF Inspector，应用 Impeccable 的现有产品窄范围整理与 Ant Design 指引。

最小缺口在 `PdfImagePanel` 的旧上传分支：全部命令同时展开，应用按钮位于滚动内容，选文件立即开始写操作。此次只改面板、局部 CSS 和针对性测试；未改共享 PdfEditor/Agent/OCR、renderer preset、vendor、服务端、公开合同或原生 writer。

## 实现

- 保留九类操作：插入、替换、位置尺寸、旋转、翻转、不透明度、去背景、裁切、删除。具名操作选择器只展示当前操作参数；未选原生图片时，其余操作准确禁用。
- 位置、尺寸、层次和可读 opacity 使用当前原生值；未知 opacity 明确提示目标数值，不冒称读取成功。旋转提供右90°、左90°、180°，翻转提供水平/垂直；容差和四边裁切保持原工具参数，百分比到0–1转换仅在提交时进行。相对两侧裁切和≥100%时预拒绝。
- 文件选择只保存当前 File 与 object URL 预览/文件名，不读取 base64、不调用工具、不产生 dirty/history。PNG/JPEG MIME 与8MiB门槛在准备时验证，宿主的实际编码/结构守卫保持。
- 应用按钮统一位于 section 的直接 footer；body min-height:0 内部滚动。每次只显示一个主按钮。长文件名、错误和原因可折行，预览高度封顶140px。删除通过明确 Popconfirm 再调用同一原生动作。
- 底部应用冻结当前 agent version，reader/host 全程使用 AbortSignal；本地 pending 与同步 controller 引用共同防止重复提交。开始时重验绑定版本，读取完成再验 live/version。
- FileReader 在取消时真实 abort，挂起 Promise 结算；读取错误可重新应用，成功清除素材。object URL 在重选/切操作/换目标/卸载时释放。
- 原件身份、页、目标、来源或 history version 改变会更换草稿组件；原生 snapshot sha 变化也重绑定字段。旧请求卸载取消，迟到结果不发布文件操作或成功状态。自己的成功版本可重新绑定新原生值，并显示真实已应用状态。
- Escape 先取消删除确认；再取消当前读取或清空素材/参数草稿；无草稿时冒泡至现有 Inspector 关闭/回 live 入口机制。pending 时先聚焦稳定 Inspector，避免尝试聚焦仍 disabled 的按钮。
- 搜索/生成来源与私有素材引用接缝保持，原生只读原因在外部来源也可见。

## 改动文件

- `packages/office/src/editors/PdfImagePanel.tsx`
- `packages/office/src/editors/pdf-external-images.css`
- 新 `packages/office/src/editors/PdfImagePanel.test.tsx`
- `packages/office/src/editors/PdfEditor.images.test.tsx`：最小适配按操作显示字段/显式应用读取，并保留原真实 host/history 测试。
- `packages/office/src/editors/PdfEditor.external-images.test.tsx`：新增本地 PNG 准备→应用→真实原生保存/撤销/重做；两旧 Editor 测试 mock 补已被 OCR 使用的 `loadPdfDocument` 导出。

## 验证记录

最终结果见下方冻结补记。过程中三文件21/21曾通过，随后新增本地上传真实 host 用例。收尾两次测试在任何用例执行前被并行 shared PDF schema 的重复 hexColor/textHexColor 声明阻断；已通知 root，由该文件 owner 修复，本片没有越界改共享 schema。不得将该过渡失败描述为图片功能缺陷，也不抹去失败记录。

专项行为包括：选择零写/零读、唯一固定主动作、防双击、所有修改参数、真实原生值、只读原因、无效裁切、删除确认、Escape、读失败重试、源/页/目标/version/卸载取消、native 请求取消、迟到结果拒绝、自身成功重新绑定。实际 Editor 使用真实 PDF writer 验证本地上传后保存→Undo/保存→Redo/保存字节精确。

## root 后续验收

独立 checker 审核本片五文件及针对性测试。root 统一生产构建和真实浏览器1280、420×500：确认320px面板、内部滚动与固定主按钮，实际PNG选择零dirty、显式应用单次写、保存/撤销/重做与非目标条目、长错误/文件名、全部操作可达、删除确认、未配置搜索/生成、Escape/回焦。组件 DOM 不具有真实布局引擎，不能替代420×500视觉证明。本片不声称真实 provider/model、Desktop 或全仓检查通过；未运行全套或重做已知480条技能 lint，未暂存/提交/归档/上传或删除测试件。

## 最终冻结补记

2026-10-17 11:38，本片五个生产/测试文件冻结，待独立 check。

- `pnpm --filter @mimir/office exec vitest run src/editors/PdfImagePanel.test.tsx src/editors/PdfEditor.images.test.tsx src/editors/PdfEditor.external-images.test.tsx`：**3 文件 23/23，exit0**。其中专属16，既有原生图片2，外部来源+新增本地真实上传5。
- `pnpm --filter @mimir/office typecheck`：**exit0**，最终轮在 root 通知 schema owner 稳定后运行。
- 五个改动源码/测试/CSS `oxfmt --check`：**exit0**。
- 四个 TSX `oxlint`：**exit0**，无告警。
- `antd lint packages/office/src/editors/PdfImagePanel.tsx --format json`：**0 issues**。
- 本片 tracked 生产/测试 `git diff --check`：**exit0**。

未执行根全套、build或真实浏览器；以上都只代表本片代码/针对性 gate。下一步由 root 派独立 check，再统一生产浏览器验收。
