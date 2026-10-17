# PPTX 父组合渲染 C0 独立检查（2026-10-17）

状态：C0 独立检查结束，代码冻结，交 root 统一构建与浏览器验收。本片没有额外生产代码修复。

## 范围与证据

- Active task `.trellis/tasks/10-11-chat-edit-office`，批准方案 `research/office-crop-remaining-plan-20261017.md` §4 C0，对照 `research/pptx-group-render-implementation-20261017.md`。
- 检查所有权：`pptx-svg.ts` groupNode 分支、`pptx-group-placement.ts`、两个专项 test、专属 native fixture helper 与 raster script；未修改 PptxEditor、crop、共享 schema、host、vendor 或上一片已冻结的表格文件。
- 直接读取 fixed GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 的 `boxPivotProps`，及本仓同版 buildGroup/placeTransform 实际路径。
- 本次为独立代码检查，WeKnora 依据沿批准研究与实施报告中同日 v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24` 已取回缓存；未称本次重新联网。WeKnora 的真实能力门控适用，不能作为 PPTX 原生矩阵依据。

## Findings (fixed)

无新增明确机械缺陷，无生产代码修改。

确认：

1. 父 group 矩阵为 `T(center) R(rotation) F(flip) T(-halfExtent)`，与固定上游 Konva 的中心 offset/rotation/scale 语义一致。四种 flip 与0/30/45/90/270/-37/397°四角和逆变换均覆盖。
2. buildGroup 已将 ext/chExt/chOff 烘焙到子 box；groupNode 不再乘 childScaleX/Y，非零 chOff 的原生 fixture 能排除重复缩放。
3. 嵌套矩阵 parent×child×viewport 顺序及 inverse roundtrip 正确。identity group 维持原 translate-only 输出；非finite、零/负extent与奇异逆矩阵有明确 null。
4. 实际 SVG 保留 source ID 点击身份并转义，普通文字仍是真实 text 且经过 XML escaping；原生模型未因渲染改变。
5. 独立 Canvas 参照使用 Canvas translate/rotate/scale API，没有调用待测 matrix helper；下方结果来自重新生成 native→render tree→实际 SVG→真实 Canvas SVG 解码，非只比较 transform 字符串。

## 实际栅格复跑与查看

专属检查输出 `/tmp/mimir-pptx-group-c0-check-20261017/`，避免覆盖 root 原始上传 fixture 目录。

复现：

```sh
MIMIR_PPTX_GROUP_FIXTURE_DIR=/tmp/mimir-pptx-group-c0-check-20261017 pnpm --filter @mimir/office exec vitest run src/pptx-group-placement.test.ts src/pptx-group-svg.test.ts src/pptx-svg.test.ts
node .trellis/tasks/10-11-chat-edit-office/research/pptx-group-render-raster-20261017.mjs /tmp/mimir-pptx-group-c0-check-20261017
```

| 样本 | 实际内部颜色点 | 差值>8的像素/691200 |
| --- | --- | --- |
| identity | 64/64 | 0 |
| parent45-flip | 64/64 | 25 |
| nested | 64/64 | 7 |
| 旧 translate-only parent45-flip | 原缺陷对照 | 18342 |

通过 view_image 实际查看 `parent45-flip-actual.png`：绿色在上、蓝色在左、红色在右、黄色在下，四色随父组合中心旋转/镜像；查看 `nested-actual.png`：四色呈两对小矩形，按外45°flipH与内90°flipV组合，无第二次父缩放。

统计与实施者独立记录一致；25/7边缘差异不作为任意像素完全相等的声明，192个内部点全部精确匹配。无 PowerPoint/LibreOffice 实机栅格或浏览器截图，本记录不代替 root UI 验收。

## Findings (not fixed)

### 1. 既有叶子旋转/翻转顺序差距，属于 C1 前置范围

当前 `pptx-svg.ts:transformAttr` 与旧 picture crop helper 为 F·R，fixed upstream 是 R·F；父组 C0已按R·F，未越界更改旧叶子或crop。复跑 `child37-flip` 第一角：

- current SVG：269.735186182, 174.249699847。
- fixed renderer：295.008258020, 212.159307605。
- 原生非等比 S·R·F 解析参照：291.849124041, 218.477575564。

四角在输出 `known-child-and-shear-corners.json`。差距明确且远大于舍入，必须由 C1 前置审查同步修正普通图片/相关旧crop，不能仅修新组合入口。

### 2. 既有非等比+37°子旋转 shear，属于精确几何决策

`shear37` 当前与fixed renderer均按已缩放box旋转，第一角244.700509356,174.249699847；原生 S·R 解析为241.541375376,167.931431888，约7.064px差。该解析参照不是外部Office实机像素。需要 C1 选择精确图像几何适配或明确禁用无法证明的非等比斜角裁切；本片没有扩大 renderer/native 接口，也未声称全仿射已齐。

### 3. 并行 XLSX 类型错误

本轮Office tsc失败仅：`src/xlsx-validation-list.ts:72` 的 reduce 累加器推断引发 TS2531/TS2365/TS18047（4诊断）。不属于 C0，已通知 root，遵照分工没有修改 DV owner 文件，也未反复重跑 tsc。

### 后续验收与规范

root 仍须本批统一 type/build/full gates，并在真实1280和420×500浏览器验证父45flip/nested显示、原有选中身份与工具可达；公共spec同步由root协调。C0不能记为 C1 group crop完成或所有工具完成。

## Verification

- Tests：PASS，3files28/28，exit0。日志 `/tmp/mimir-pptx-group-c0-independent-tests-20261017.log`。
- Actual SVG raster：PASS，exit0，192/192内部色样；日志 `/tmp/mimir-pptx-group-c0-independent-raster-20261017.log`。
- Lint：PASS，五个本片TS源码/测试路径oxlint无诊断。
- Format：PASS，五个本片TS路径oxfmt --check；research mjs在仓库忽略路径，不将其计入格式通过文件数。
- Script syntax：PASS，raster script `node --check`。
- Diff whitespace：PASS，本片路径 `git diff --check`。
- TypeCheck：FAIL，外部进行中的 XLSX 文件四诊断，无 C0 文件诊断；日志 `/tmp/mimir-pptx-group-c0-independent-types-20261017.log`。
- Antd：不适用，无Antd改动。
- 未运行 full Office/server suite、Web build、browser/Desktop、真实模型。没有上传/删除/暂存/提交/归档，也没有派发子代理。
