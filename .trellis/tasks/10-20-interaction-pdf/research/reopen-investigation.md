# 隔离 Demo 重开后批注列表空的定位

日期：2026-10-20。仅定位；未修改冻结产品、Demo、helper 或构建资源。原始 GUI 观察由主会话提供，本检查没有操作浏览器。

## 结论

Demo 的“重开最近模拟保存原件”只增加 epoch 并改变 `PdfEditor.documentId`，没有相应 React `key`。这会重新加载字节，但保留当前编辑器实例中的 `annotationsOpen`、`noteId`、`annotationList`。新原件的 `Uint8Array` 身份不同，原列表按 `annotationList.bytes === currentBytes` 正确失效；保持打开的面板没有经过再次打开入口，所以不会自动执行 `read_annotations`。残留选中 ID 与空列表是该演示生命周期组合的结果，不能据此认定保存丢批注。

主会话补充：重开后手动“刷新批注”立刻恢复原 3 项及新增、修改和回复，证明所保存字节含数据。本次只将它记录为主会话观察，不冒充本检查的 GUI 结果。

产品 `OfficeSourceEditor.tsx` 的 PDF 分支已有 `key={doc.id}`，`FilePreview.tsx` 同样以文档 ID 给宿主设置 key；不同文档的模型/面板按实际实例重建。`use-source.ts` 则独立按 documentId/attempt 重新读取。**这不是同一个 ID 或 revision 未变化造成未加载**：Demo 的 ID 确实变化，问题是演示“重开”没有重建实例。产品没有 Demo 这项内存重开动作，不能把该现象直接外推为生产重开故障。

最小建议：只在 Demo 的 `<PdfEditor>` 增加 `key={epoch}`（或与 documentId 同一 key），保留 Fixture 层 `savedRef`，重建编辑器后从最近 ACK 字节加载；基线与当前 Demo 应采用相同机制，再冻结配对。无需为本轮改动扩写产品重开或批注自动刷新合同。若未来提供保留 Inspector 的原地换源能力，再单独决定自动刷新/草稿身份。

## 源码证据

- `.trellis/tasks/10-20-interaction-pdf/gallery/main.jsx`：保存仅在 `await deferred(...)` 成功后复制 bytes 到 `savedRef`；load 优先复制 savedRef；重开按钮只 `setEpoch`，`PdfEditor` 只传 `documentId=gallery-pdf-${epoch}`，未传 key。
- `packages/office/src/editors/PdfEditor.tsx`：`annotationList`、`annotationsOpen`、`noteId` 是实例 state；批注入口仅在 `!annotationsOpen` 时读取；下拉选项/线程按精确 currentBytes 身份筛选。基线 HEAD 中的读取与身份判据相同，不是本轮 footer 重排引入。
- `packages/renderer/src/components/document/OfficeSourceEditor.tsx`：PDF 分支 `key={doc.id}`；组件注释明确换文档重建实例。`FilePreview.tsx` PDF 分支同样 key 宿主。

## 绘图与批注的原生交叉验证

直接向已有 loopback helper 发送请求，只使用隔离 fixture 和内存字节，无数据库、浏览器注入或产品写入：

1. before 和 after 各读取同一 `annotations.pdf`（2142 字节）；添加矩形，宽 140、高 80、位置 40/100。
2. 得到 5546 字节工作副本；通过批注 read 的 SHA 添加一条便笺，得到 3166 字节。
3. 独立再次调用 native local read 和 annotations read：**两版本都保留 1 个矩形，宽度 140 及原几何/颜色完整，批注 3→4**。完整返回数据和真实字节 SHA 保存在 `check-native-cross-tools.json`。
4. 再用实际 PDF.js 解析添加批注前后页面，`annotationMode: 0` 排除便笺外观；两版本均为 68 个页面绘制操作，1 次 constructPath、1 次 form XObject begin，前后 fnArray 完全一致，见 `check-native-operators.json`。这是绘制指令证据，不能替代浏览器像素验收；脚本未配置标准字体 URL，产生相应标准字体警告，故不据此声称字体像素一致。

因此，文件体积由约 5.5 KiB 变为约 3.2 KiB 不能当作绘图被删除的证据。代表性原生服务交叉路径没有复现绘图丢失；当前主会话所见外观仍应在修正 Demo 重建后实际检查，不预判它为引擎或原件特征缺陷。

## Helper 合同边界

helper 的 annotation read 返回了低层服务的输入 bytes，版本保持不变；生产 route 则省略 read bytes。当前 `executePdfContentTool` 的 read 分支只消费 `annotations` 并返回 data，不发布这些 bytes，因此该差异不解释本次空列表或绘图外观。本检查没有更改 helper；若后续校准 Demo 适配，可将只读响应形状同步到生产 route，不能通过改变产品原件/版本规则迁就演示。

外部参考版本及适用边界沿用本任务 `pdf-external-references.md`，本次为内部生命周期/字节合同诊断，没有新增外部产品调研结论。
