# PPTX 轮廓 Inspector 补全（2026-10-17）

## 实施边界

最小缺口：原 Ribbon 仅能选颜色/清除且硬编码1pt，覆盖了原件宽度；当前单个文字、形状、图片需读取真实轮廓，在右 Inspector 编辑草稿后一次提交。新增 `PptxOutlineControls.tsx`、局部 CSS 与测试；根会话唯一整合 `PptxEditor`，此分工不改 vendor、不改其他对象面板、不扩大模型白名单。

API：`PptxOutlineControls({element:SlideElement,target:PptxTarget,apply:PptxApply,version:number})`。Inspector标题及 `data-panel` 用“轮廓”，内容内部滚动，应用/重置固定底部。颜色、任意有效十六进制值（含alpha）、连续宽度、11个OOXML预设线型、无轮廓、cap/join/compound使用已有shell原语。选值不写入，只有显式应用产生一次 `setStroke`。version/target/source stroke变化重置草稿；处理时显式禁用Select，重复提交同步拒绝，失败保留草稿，卸载忽略迟到回调。`PptxApply`现行接口无signal，真正迟到文档写入仍由Editor绑定当前版本与目标的宿主守卫处理，控件自身不宣称能取消服务器已接受的操作。

## 固定参照

- GenOffice checkout `/tmp/mimir-genoffice-html-git` 的 `git rev-parse HEAD` 实测为 `480548fd55f1be3593ee0d8e316a734751d58309`。`apps/slides/src/renderer/components/Ribbon.tsx:3350`后形状轮廓提供颜色、0.5/1/1.5/2.25/3/4.5/6pt、solid/dash/sysDot/dashDot、无轮廓；约1272的颜色提交复用当前宽度/dash。本片保留其主语义并用现有右Inspector替代展开裸表单，连续宽度与更多OOXML线型不增加Ribbon密度。
- 同版本 `packages/pptx-engine/src/types.ts` `Stroke` 包含width/fill/dash/cap/join/compound/headEnd/tailEnd；`generate.ts` `patchLnXml` 原位修改轮廓保留箭头/未知子节点；`StrokePatch` 支持cap/compound/join/线性gradient而无箭头修改。本片helper复制未改动的宽度/颜色/alpha/随框缩放的线性gradient/dash/cap/join/compound，head/tail依照原生writer保留原XML。
- WeKnora站点 `https://weknora.weixin.qq.com/` 本次HEAD请求10秒零字节超时；同固定公开源码v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24` raw definitions请求也10秒零字节超时，没有将失败记成功。继续核已有固定证据 `/tmp/mimir-pptx-weknora-definitions.go`：`internal/agent/tools/definitions.go` 定义search_knowledge/read_document/list_documents、sandbox等知识与Agent工具，无Office轮廓参数或Ribbon交互，不作为本片主要设计模型。

## 保真边界

当前原生StrokePatch不能表示图片/纹理轮廓以及path/fillTo/tileRect或不随框缩放的复杂渐变。只改宽度/线型时须显式拒绝，提示选择纯色后应用或保留原件，避免静默转换。用户明确选择颜色才转换纯色。无轮廓为原生`stroke:null`，保留其他原始线条XML。组和多对象由另一个范围管理实现，本组件只负责已解析的一个strokable对象。

## 验证

专项组件测试覆盖真实原生setStroke、两次保存读回、只改目标slide entry、箭头端点/cap/join/compound保留、alpha渐变width-only保存、无轮廓保存、真实PptxHistory保存→undo/save→redo/save逐entry恢复；并覆盖草稿/重置、失败/异常、复合Select禁用、重复提交、切目标/版本丢草稿、卸载迟到回调、自定义色值校验。浏览器宽屏/420px、分层Escape回焦与实际下载由根会话在Editor整合后验收；本文件不把组件测试写成浏览器已通过。

本分工最终代码门禁：`vitest run src/editors/PptxOutlineControls.test.tsx` 7/7；`pnpm --filter @mimir/office typecheck` 首次本片修复后exit0，最终重跑被并行新增`pptx-picture-crop.test.ts:29`缺少ByteAnchor.spIndex阻断（本分工文件无类型报错）；目标两TSX `oxlint` exit0；目标3代码/CSS `oxfmt --check` exit0；`check-style-backticks.mjs` exit0；目标 `git diff --check` exit0。无需新依赖，未修改 vendor。
