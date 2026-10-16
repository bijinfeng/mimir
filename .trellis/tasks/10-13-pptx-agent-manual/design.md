# 设计：PPTX Agent 与手动编辑

## 2026-10-16 Ribbon 本地工具补齐

本切片以固定GenOffice的 `ribbon-shared.tsx Props` 96回调及Ribbon子菜单为索引，逐项核对App/actions与Mimir真实入口；不能凭基础op可调用标记完成。最小实际缺口：`insert-actions.ts:444`的屏幕录制（getDisplayMedia，静音视频，MediaRecorder WebM，原生媒体插入）未接；图表设计的网格、10个样式、配色及行列互换未暴露（`Ribbon.tsx:432–484,2890–3030`）。通过现有media multipart和edit_chart补齐，不增HTTP/shared schema。录制始终由用户点击启动，停止后可预览/放弃/插入；面板关闭、文档变化和卸载停止真实采集并忽略迟到结果，最多32MiB与10分钟。浏览器不支持或权限拒绝须明确原因。原件只在显式插入后标脏。

图表编辑移入既有340px Inspector，并拆成“样式/配色/数据”三个具名分类；每次仅编辑一个所选系列，保留跨分类草稿，内容独立滚动、主按钮固定底部。字段必须经ToolbarPropertyForm显示真实可见label，primary按钮只传label避免重复文案。保留当前数据/导入转换确认及失败草稿；新增实际参数沿既有严格chart patch传递，行列互换单独提交，禁止和未应用数据混合。短入口具名，使用共享字段原语、当前值、窄宽覆盖与关闭回焦，不增多行工具栏。所有权仅PPTX专用helper/Editor/Controls/engine/service/tests/矩阵，当前不改共享壳、CompactToolbar、跨格式CSS、routes或vendor。WeKnora既有v0.8.3（`3e22822c1d2397be730c458c7539d0eb8c113a24`）证据沿用主任务：Agent注册/权限适用，无录屏或PPTX Ribbon语义，主要依据为固定GenOffice。

固定上游 17 个顶层工具与 `pptx-ops` 文档的 71 种操作（61 种模型可调用）。扩展现有 `PptxEditSession` 和 SVG 画布，保留元素锚点、原始 XML、关系表与补丁式保存；AI 与手动命令都调用同一元素/幻灯片操作执行器。模型专用 `apply_ops` 仅暴露上游可调用操作，图片字节、粘贴内容等非模型操作走受控媒体服务或手动入口。`read_slide` 和选区读取来自未保存模型，元素 ID 与页版本在每次写入时重新核对。

上游写入闭包包含 Node 媒体/压缩依赖；浏览器安全的纯操作留在 Office 包，需宿主处理的二进制操作经统一 HTTP 会话按原件版本和操作修订串行。返回渲染投影与真实变更，再刷新当前 SVG。图表、表格、动画、母版/主题、外部媒体和生成幻灯片须分别证明画布更新、保存重开与未改 OOXML 保真。保留 Mimir 紧凑工具栏，在上下文菜单/侧面板补足上游手动命令，不把上游多行 Ribbon 整体搬入三栏布局。


## 2026-10-16 表格设计切片

八个固定上游样式、RTL、all/none边框宽色、显式行列所选单元格/全表底纹使用原生setTableStyle；表格移入340px三分类Inspector，共享可见字段、八样式缩略预览及当前态、固定底部应用。布局即时生效，内容及样式草稿分别显式提交；保留多run、合并保护及失败草稿。固定上游与引擎仅all/none，四种额外边框属可选扩展，撤回此前错误对标缺口。
