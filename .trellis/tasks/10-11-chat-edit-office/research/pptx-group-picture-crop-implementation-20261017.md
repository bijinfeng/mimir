# C1：直接组内图片画布裁切实施

- 日期：2026-10-17；实施片已完成，待独立 check 与 root 生产浏览器验收。
- 批准范围：`office-crop-remaining-plan-20261017.md` §C1，含 C0 item4 的图片原生变换前置；root 另批准 `pptx-render.ts` 传入原生 Slide 的最小接缝。
- 参照：固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`。WeKnora 沿批准研究同日已核对的 v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24`，证据及适用边界见上述计划 §3；未把缓存复用写成重新联网。

## 改动与合同

1. 新 `packages/office/src/pptx-picture-placement.ts`：从原生 picture off/ext、rot/flip、flat camera 及 parent off/ext/chOff/chExt 计算矩阵。图片局部坐标是未经过父组缩放的 EMU 框投影。顺序为 child R·F → parent S → parent R·F，非等比父缩放与 child37° 的 shear 被保留；不一律拒绝非等比普通图片。
2. `pptx-svg.ts`、`pptx-render.ts`：生产渲染传入原生 Slide，图片内容/clip/effects 的既有绘制框映射到同一原生矩阵。修正图片旧 F·R 顺序。两参数 synthetic SVG API 兼容保留，但 synthetic 反推不参与写回授权。其他 shape 叶子原有 transformAttr 不在 C1 扩大修正。
3. `editors/pptx-picture-crop.ts` 与 `PptxPictureCropCanvas.tsx`：复用顶层手势状态机，增加 parent/groupRef；底图、ghost、八把手、逆投影与 native frame 提交使用同一原生合同。裁切反算只用 child nativeMatrix，避免将父坐标写入 child off/ext。原生 rot/flip 不变。
4. `PptxGroupPictureControls.tsx`、`PptxEditor.tsx`：320px 既有 Inspector 增加次级“在画布裁切组合图片”入口，未应用数字草稿先提交；进入画布后由原有固定裁切 footer 提供唯一主动作。Escape 优先结束 crop，重开组合图片面板并回焦真实入口。doc/source bytes/workspace/page/ref/group/version 失效会结束草稿，返回原页不复活。pending 取消与迟到返回不发布。
5. `packages/shared/src/pptx-picture.ts`：私有严格 `manual_picture` 增加 optional `box`；signed32bit 坐标、positive32bit 尺寸，仅允许随 srcRect 一起传入。不扩展公开 Agent 工具词汇。
6. `pptx-picture-edit.ts`：自身也校验 strict schema，先精确解析目标原生 slice，仅补目标 xfrm/off/ext 与 srcRect，同一 manual_picture 工作副本一次发布。off/ext 补丁限于 xfrm，保留 unknown attributes、rot/flip、父/兄弟和其他 ZIP；semantic no-op 不制造 dirty。
7. 新 `pptx-group-picture-crop-guard.ts`：固定 parser 的 child anchor.originalXml 为空，按 owning group 中唯一 cNvPr/nvId 找原生 picture，不能按 child 序号猜测。原生 xfrm/off/ext 歧义或缺属性拒绝且零模型变化。

## 连接线边界：显式不支持实际 attached 目标

固定 vendor `pptx-engine/src/index.ts:2324` 的 `updateConnectorsForMoved` 只扫描顶层元素，`connectionPoint` 又不解释目标旋转；不能复用它声称直接组内任意旋转/shear 的端点可正确同步。当前检测 slide 顶层 originalXml（包括 group 内 XML）中的 stCxn/endCxn 原生 id。仅实际 attached 图片的画布裁切被 UI 与宿主同时拒绝，并显示：

> 此组内图片连接了连接线，暂不能同步其端点；请使用数值裁切保留原框

数值 srcRect 保持原框的既有路径可继续使用。没有把普通父非等比缩放拒绝为此限制。该限制须保留在最终完整性台账；不是“全部连接线场景已完成”。deep/MC/身份歧义沿既有原生目标解析边界拒绝。

## 文件

- 生产：上述 9 个既有文件，加 `pptx-picture-placement.ts`、`pptx-group-picture-crop-guard.ts`。
- 专项：`editors/pptx-group-crop-fixture.test-helper.ts`、`editors/pptx-group-picture-crop.test.ts`、`pptx-group-picture-native-crop.test.ts`；扩展 Canvas、实际 Editor 与 server `pptx-group-picture-host.test.ts`。
- 本报告、C1 边界 note、`pptx-group-crop-raster-20261017.mjs`；C0 helper/fixture/test 与报告保持此前冻结成果。
- 未修改 vendor、shared shell；未暂存、提交、归档或删除测试件。

## 验证

- Office/shared/server `tsc --noEmit` 通过；导航取消补丁后 Office 再次通过。
- 最终 Office 专项命令包含 group-placement、group-svg、pptx-svg、native crop、top/group crop、Canvas、实际 Editor、GroupPictureControls，最终 9 files /104 tests 通过（12:12:16）；初轮101项后新增2个malformed native和1个导航回归。
- Server host：1 file /19 tests 通过，包含 crop+box 一次版本/一次记录、原生目标差量/no-op/严格参数。
- 几何覆盖 parent0/30/45/90/270、parent4 flips、child0/37/90/270、child4 flips、均匀与1.5×2缩放、960/1440 viewport；独立 raw EMU 四角与逆映射、舍入误差界、保留源像素位置。
- Native8项：37°、90°、child0°、flat camera，原件到两次保存、原生未知属性、父/兄弟与媒体/所有非目标 ZIP entry 精确；attached及 malformed拒绝零模型变化。child0° fixture 文件名为 identity，但父仍45°flipH、child仍flipV，不声称整个组合无变换。
- 实际 Editor7项：原子 crop+box、save→Undo/save→Redo/save 全ZIP、第二次裁切重新绑定、pending Escape+迟到零发布和入口回焦、切页不复活草稿。
- Canvas15项：八把手、真实缩放pointer、group R90/flipH+S1.5×2+child37/flipV 独立原生投影、屏幕方向键、显式Apply、取消/失败草稿、doc/page/target/groupRef/width/height/version失效取消。
- changed20files `oxlint`、`oxfmt --check`；3个UI文件 `antd lint --format json` 均零问题；`git diff --check` 通过。最终静态均exit0（格式初次发现新增导航测试未格式化，修正后复检通过）。

### 实际 SVG raster：独立原生坐标参照

文件 `/tmp/mimir-pptx-group-c1-20261017/`：4种原生 `.pptx`、裁后 `.pptx`、实际生产 renderSlide `.svg`、system/actual/native-reference PNG、geometry JSON、source-grid.png、raster-results.json。

命令：

```sh
MIMIR_PPTX_GROUP_CROP_FIXTURE_DIR=/tmp/mimir-pptx-group-c1-20261017 pnpm --filter @mimir/office exec vitest run src/pptx-group-picture-native-crop.test.ts
node .trellis/tasks/10-11-chat-edit-office/research/pptx-group-crop-raster-20261017.mjs
```

系统 `/usr/bin/sips` 对实际 standalone SVG 栅格化；独立 Canvas 原生 EMU transform 不调用产品 matrix helper。四象限 PNG 含 alpha 与20px白网格，图片 opacity37%；4种fixture各64内点、前后共512颜色点 RGB差≤3；256保留像素位置一致。采样避开白网格和颜色边缘，防止不同引擎的抗锯齿差异。该证据是 ImageIO SVG vs 独立 OOXML/Canvas，不是 Office 外部打开截图。

诊断如实保留：NAPI SVG decoder 连最简200×120嵌入PNG的 href/xlink:href 都丢为透明，因此最初白图失败来自 raster harness；改为 sips 解 SVG，NAPI 只读PNG。Skia getTransform 的 float精度使 matrix比对阈值为线性1e-6/平移0.0002px；产品纯几何测试仍使用 double 与 EMU舍入界。

## 待 root / checker

- 独立 check；root 统一重型 suite/build。
- 真实生产浏览器1280与420×500：入口可发现、Inspector320px内滚、画布八把手和固定唯一主动作可达、Escape层级与回焦；实际37°非等比组图裁切后save/undo/redo下载原生复核。
- 保留 attached connector 精确限制，后续独立端点原生几何片再开放。Desktop由用户自行验收；没有真实模型验收结论。
