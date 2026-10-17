# PPTX 统一选择：复杂填充与 32 组合样式

## 参考证据

- 本次再次核对 `/tmp/mimir-genoffice-html-git` HEAD 为固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`。`apps/slides/src/renderer/components/ribbon-shared.tsx:120–139` 的 `SHAPE_STYLE_PRESETS` 为 outline / soft / solid 三行八色，`RIBBON_SHAPE_STYLES` 再加八个 dashed 预设，共 32 个；`Ribbon.tsx:3273–3308` 是可见图库及 `onShapeStyle` 调用。
- `FormatPane.tsx:916–997` 从当前真实渐变色标初始化，逐参数合并并增删色标，保留中间色标；`944–968` 对应角度、path 与 focus。Mimir 使用自己的显式草稿、混合值及固定应用动作，不复制上游即时写入行为。
- WeKnora 网站在同轮调研 `curl -I --max-time 10` 超时，exit 28、0 bytes；不将此记作网站成功。公开源固定 v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24` 的 `internal/agent/tools/definitions.go` 在本轮已取得，13533 bytes，缓存 `/tmp/mimir-pptx-bulk-weknora.go`。知识检索、文档读取、联网和 wiki 工具分工可用于知识库 Agent；没有 Office 对象填充或工具栏参数模型，因此本片主参考仍为固定 GenOffice。

## 实施

`PptxSelectionControls` 保持原统一选择、直接组合成员和同一固定 footer，增加“外观”页签。内部“填充 / 组合样式”分类和四列预览图库放在 Inspector 的可滚动内容区；没有向 Ribbon 堆叠额外命令行。当前值、混合值、暂存样式和跨页签草稿均可见。

- 填充支持无填充、纯色、2–16 个色标渐变（含 alpha）、0–360° 角度、线性 / 圆形径向 / 矩形路径 / 形状路径、8 个渐变预设、增加/删除色标。每个对象从自身原值合并，只统一明确修改的参数。数量不同可编辑共同色标，增删前须先统一预设。
- 沿固定原生 `setFill` / `setStroke`，混合顶层和直接成员各携带真实 group，一次事务最多 50 个操作。线性 scaled、tileRect 和未改 path/focus 由原生 patch 保留；显式改 path kind 时补回每个对象自己的 fillTo。没有手改 vendor。
- 32 个组合样式复用现有预设、原生形状 SVG 预览和中文名称，支持 Arrow / Home / End 键。显式替换填充、轮廓颜色和 dash，保留各自线宽、cap / join / compound、箭头和文字。用户随后调整填充或轮廓，只生成每对象各一个最终操作。
- 内置 8 纹理和当前图片平铺/拉伸使用 root 新增的受控 `manual_fill` selection arm；UI 只传可填充目标，当前图片由宿主分别读取每个对象自己的媒体。图片草稿和普通格式草稿互斥，必须应用或重置后再切换；整个 Inspector 始终只有一处固定主操作。纹理下载失败保留草稿，版本、文档源或选择改变会取消尚未完成的读取。
- 原生连接线仅有可见轮廓，解析故意不提供 fill。实际浏览器发现将它们计入填充会错误显示混合；新增纯 `pptx-element-capabilities.ts` 的 `pptxSupportsShapeFill(element): boolean` 供 UI、操作构建及 root 宿主共同判断。填充排除 line / straight / bent / curved connector，组合样式仍修改它们的轮廓。面板明确显示排除数量；仅选线条时保留组合样式和轮廓入口。

## 验证

- Office 最终定向两文件 **25/25**：`PptxSelectionControls.test.tsx` 19 项、`pptx-selection-fill.test.ts` 6 项。组件覆盖混合参数、仅改指定色标、预设当前值、alpha/path、32 个真实预览及键盘、跨页签一次提交、互斥图片草稿、失败重试、纹理读取取消、线条排除和仅线条样式。
- 6 项纯/宿主测试含真实 `createPptxAgentHandle → applyPptxOpsOnHost → native runTxn`。顶层与组成员的不同 stops / alpha / angle / path / fillTo / scaled / tileRect，逐对象保留轮廓/文字/兄弟和其他 ZIP 部件；32 个样式均经真宿主保存重开核对，各对象原宽度、端点、连接、复合线和箭头保持。渐变及样式均覆盖保存两次和 saved undo/redo 的全部 ZIP entries 比对。无效批次原子拒绝；原生五种线条从填充中排除、仍能同批统一轮廓。
- 此前同轮四文件 **33/33** 含旧 selection / GroupText 回归；与上列有重叠，不累计。Office tsc、目标 Oxlint / Oxfmt、两组件 Antd lint 和样式 backtick 检查通过。root / checker 另做跨层及挂载门禁，不把其结果写成自身已跑。
- 浏览器 1280 / 420px、下载、保存历史由 root 验收；本片不将组件和真宿主测试当作浏览器或模型执行。模型未配置，本轮按用户要求先验代码和浏览器；Desktop 用户自验。

## 保留边界

- 深层组合仍只读；原件图案填充只显示，不新增图案编辑。现有超过 16 色标的渐变不会被裁掉；修改该渐变时明确校验拒绝，可显式选择预设统一后再编辑。
- 原生纯色六位色值更新会沿固定引擎保留原 alpha，明确八位色值才替换透明度；没有改动该保存语义。
- 图片符号批量、外部图片上传填充与任意模型 `setImageFill` 不在本片新增范围。整体任务仍进行中，不提交、暂存或归档。
