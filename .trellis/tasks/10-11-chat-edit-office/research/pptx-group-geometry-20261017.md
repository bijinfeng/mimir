# PPTX 单对象与组成员几何 Inspector（2026-10-17）

## 固定来源与边界

- 主参考 GenOffice 固定 `480548fd55f1be3593ee0d8e316a734751d58309`，只读 `/tmp/mimir-genoffice-html-git`。`packages/pptx-ops/src/ops/element-ops.ts:78–155` 明确：顶层 `setTransform.box` 是幻灯片 EMU，组内 `box` 是含 `chOff` 的父组合局部 EMU；另一个可选 `absBox` 才由引擎换算，此换算也没有覆盖父组合旋转/翻转。Mimir Inspector 直接展示和写回真实局部值，不把画布绝对坐标充当 child-space。
- 固定 `packages/pptx-engine/src/index.ts:4365–4384` 的 `editGroupChildTransform` 保留当前 transform 其他属性，只更新 offset/rotation，并通过 `patchGroupChildXml + patchElementXfrm` 补写父组合原生 XML。`setGroupChildShapePresetGeometry:4529–4559` 仅替换几何，保留文字/样式，移除原调节值和自定义路径。`pptx-ops/src/ops/element-ops.ts:234–294` 的 `flipElements` 是保持当前旋转后中心的翻转，原生执行会同步调整 offset。
- 现有 Mimir 的 `pptx-selection.ts` 是唯一选择上下文适配，不另建一套 parent/child lookup。形状选项与几何预览复用 `pptx-shape-presets.ts`（来源同固定 GenOffice 的 `packages/ui/src/shape-gallery.tsx` 与 slides `components/ribbon-shared.tsx`），不复制形状数据。线条、连接符和自由几何暂不直接替换预设。
- WeKnora 官网 `https://weknora.weixin.qq.com/` 本次 HTTP200（`/tmp/mimir-geometry-weknora-site.html`）；公开固定 v0.8.3 commit `3e22822c1d2397be730c458c7539d0eb8c113a24` 的 `internal/agent/tools/definitions.go` 本次请求20s超时（HTTP000），改读本会话前片HTTP200下载的同一固定源码 `/tmp/mimir-group-weknora-definitions.go`。源码列知识检索、文档读取、Wiki和能力限定的 sandbox 操作；可参考其基于实际会话能力开放工具的原则。本片仍沿当前文档宿主/版本/取消合同；该文件没有PPTX坐标或组合几何实现，不作为Office工具栏形态或几何算法依据。

## 最小实施

只新增 `PptxSelectionGeometryControls.tsx`、`pptx-selection-geometry.ts`、局部CSS及各自专项测试。不改vendor、通用schema、模型白名单、Agent校验或原有SelectionControls；Editor由根会话整合。

- Props：`elements/selectedRefs/slide/version/sourceKey/disabled/applyOps`，与原选择Inspector共用发布版本和稳定ref。恰好一个顶层对象（含组合自身）或顶层组合的直接非组合成员可写；无选择、多选择、深层组合和未建模原件对象显示具体原因。多对象的相对几何语义尚未定义，不提供误导的混合数值或隐式批改。
- 当前位置、宽高以pt（12700EMU）显示，旋转显示度。顶层标“幻灯片坐标”，成员标“父组合局部坐标”，并说明随父缩放/旋转/翻转，不是画布绝对位置。仅用户编辑过的字段转EMU；未编辑字段沿原整数和flip属性，避免显示四位小数后的反向量化。
- 单对象的几何、翻转和形状预设共用一次显式原生`apply_ops`，不改变原保存/历史。表格只有明确尺寸改动时才重分配网格（原`resizeTableGrid`合同）。选择形状不立即写，应用时才替换预设；取消恢复当前值，数值Escape先取消草稿。
- 草稿组件key绑定文档/页/发布版本/选中refs。版本或目标变更永久丢弃旧草稿，失败保留，未应用不dirty。自身pending ref防同tick重复；所有Select明确disabled，原生输入用fieldset。卸载后不接受迟到UI反馈；实际宿主取消和提交前复验继续由Editor已有`applyPanelOps`所有权守卫负责，根会话须把任务tab切换纳入取消绑定或禁用处理中切换。
- 采用现有小控件、可见标签、两列位置尺寸、一列旋转和预设、44px几何预览；内容区独立滚动，底部动作固定。Operate模式沿用现有视觉，`impeccable context`确认仅扩展现有界面，不替换视觉体系；依照craft-floor核对间距/状态/焦点，浏览器宽与420实机由根会话整合后验收。

## 固定引擎的组内翻转补写

真实 `Agent.apply_ops → applyPptxOpsOnHost → savePptx → openPptxForEdit`（只mock文档lookup与不涉及的模型服务）证明：单独`flipElements`只改成员模型的dirtyTransform，父组合XML未补写；宿主返回成功，但重开后成员transform完全等于原值。

不拦截所有模型翻转，也不手改vendor。该Inspector纯适配只为明确选中的直接成员生成同一原子批次：如有数值修改先`setTransform`，随后所需`flipElements`，最后追加一个`setTransform.box`把翻转后的成员模型补进组合XML。最终box严格沿固定原生orbit公式计算，保留旋转后的中心；最后的原生writer会连同实际flipH/flipV写回。顶层翻转已有保存路径，不追加此flush。当前通用Agent单独组内flip仍沿原生限制，待统一宿主适配真实修复；本片没有增加拒绝合同，也不声称其已独立修复。

## 验证

- `pptx-selection-geometry.test.ts` **5/5**：真实原生组合中设置非零chOff、1.5×/2×缩放、45°父旋转+水平翻转及30°成员旋转+垂直翻转；验证局部数值没有absBox转换。通过真实宿主写位置/宽/75°旋转/圆角预设，父变换不变、另一个成员原生XML逐字相同；保存commit后再次保存逐ZIP entry相等，未触及部件不变，undo/save回原件、redo/save回修改后逐entry相等。
- 复现原生flip未落地并验证显式flush后H/V实际位、补偿box、视觉中心误差<0.5EMU；相同两次保存/undo/redo闭环。另验顶层组合缩放+旋转+翻转后childOffset与全部成员XML不变；数字/预设错误、过期版本、已取消和原生失败不发布部分写入。
- `PptxSelectionGeometryControls.test.tsx` **5/5**：真实当前值/局部标签/预览/翻转态、先草稿后一次应用、取消、不合法数值、失败保草稿、同tick重复、Select显式禁用、版本A→B→A不复活、换文档迟到结果、切选择、数值Escape、多选空态。ConfigProvider small；不将happy-dom当实际窄屏尺寸验收。
- 以上2文件 **10/10**，Office `tsc --noEmit`、目标Oxlint/Oxfmt/diff检查通过（未宣称全仓通过）。不涉及真实模型或Desktop验收；宽/420与实际文件下载由根会话完成。整体任务仍in_progress，不提交/暂存/归档。
