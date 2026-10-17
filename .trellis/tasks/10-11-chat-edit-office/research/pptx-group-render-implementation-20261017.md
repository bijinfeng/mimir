# PPTX 父组渲染 C0 实施与验证

2026-10-17。Active task `10-11-chat-edit-office`，仅实施 approved `office-crop-remaining-plan-20261017.md` §4 C0。源码冻结，可交独立 checker；整体任务不完成。

## 边界与根因

`pptx-svg.ts:groupNode` 原来仅 `translate(x,y)`，父组 rotation/flip 完全未绘制。`buildGroup` 已按 ext/chExt/chOff 把子节点放置在 group-local 像素坐标中；再次加组缩放会把几何缩放两次。

修复使用 `T(center) R(rotation) F(flip) T(-halfExtent)`，匹配固定上游 Konva `boxPivotProps`。嵌套组通过实际 SVG `<g>` 自然组合。不改变子节点字形大小、路径、文本、定义或可点击身份。未旋转/翻转的组保留原有 translate-only markup。

### 实际修改

- `packages/office/src/pptx-svg.ts`：groupNode 接入中心轴矩阵（仅该分支）。
- `packages/office/src/pptx-group-placement.ts`：纯矩阵类型、父×子组合、点映射、有限可逆校验、group-local→parent-local 及高精度 SVG matrix 序列化。无 DOM/Editor/native 写入。
- `packages/office/src/pptx-group-placement.test.ts`：全 flip×角度、四角、逆变换、非零原点、嵌套/viewport、坏尺寸与奇异矩阵。
- `packages/office/src/pptx-group-svg.test.ts`：实际 SVG 四角、身份/XML escaping、普通文字保持 `<text>`、native fixture/已烘焙子几何、不改变源模型。
- `packages/office/src/pptx-group-render-fixture.test-helper.ts`：五份全新原生 PPTX fixture；不上传知识库。
- 本报告及 `research/pptx-group-render-raster-20261017.mjs`：可复现独立实际栅格验证和残余几何证据。

没有修改 vendor、PptxEditor、现有 picture/top-level crop helper、host、schema 或原生保存路径；没有暂存/提交/归档/删除。

## 固定参照核验

主参照 GenOffice **480548fd55f1be3593ee0d8e316a734751d58309**，读取本地固定 checkout `/tmp/mimir-genoffice-html-git`：

- `apps/slides/src/renderer/konva-adapter.ts:24–45`：box 中心、rotation、scaleX/Y flip、offset halfExtent；即 R·F，不是 F·R。
- `packages/pptx-render/src/build-slide.ts:625–672`：children 的 ext/chExt 缩放和 chOff 已烘焙入 box，childScaleX/Y 是编辑反算信息，绘制不可再次缩放。
- `packages/pptx-render/src/coords.ts:118–145`：非等比近90/270°交换 width/height 缩放轴；其他角仍按轴放置，是既有 renderer 的约定近似。

按 AGENTS 检查 WeKnora 站点与公开源码，**复用本任务同日已成功取回的缓存，而非本片重新联网**：v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24`。重新只读并校验：

- `/tmp/mimir-group-flip-weknora-site.html` SHA256 `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`。
- `/tmp/mimir-group-flip-weknora-definitions.go` SHA256 `3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0`。
- fixed `definitions.go:14–21,29–49` 是知识检索与真实 sandbox 能力门控；可用于诚实标注功能，不能为 PPTX matrix、Office Ribbon 或 OOXML 几何提供依据。详细 HTTP/version 证据沿 approved research §3。

## 红→绿与门禁

1. 实际暂时恢复**仅 groupNode 返回值**为原 translate-only，目标 SVG 测试 **3 fail / 4 pass**；同一 finally 恢复本片源代码。失败包括 synthetic parent45flip、native parent45flip、native nested。日志 `/tmp/mimir-pptx-group-c0-red-20261017.log`。本实现者未运行生产构建。
2. 最终 `pnpm --filter @mimir/office exec vitest run src/pptx-group-placement.test.ts src/pptx-group-svg.test.ts src/pptx-svg.test.ts`：**3 files 28/28 green**。
3. 五个本片源码/测试定向 oxlint、oxfmt --check：通过；`git diff --check` 本片路径通过。
4. Office typecheck 尝试两次：均被并行 `PdfTextControls.test.tsx:92,104` 的空 tuple mock 类型阻断，无本片类型诊断；已通知 root/PDF owner。不能记作全 Office tsc 通过。该失败后未扩大全套测试/构建。
5. 未运行全 Office/server suite、Web build 或 browser/desktop；由 root 统一后续门禁。无 Antd 代码变动。

## 实际 SVG 栅格验证

不是只匹配 transform 字符串。使用仓库既有 desktop `@napi-rs/canvas@1.0.9` 加载**实际生成 SVG**；另一路用独立 Canvas translate→rotate→flip→halfExtent 绘图，未调用本片 matrix helper。真实 native PPTX 经 openPptx→buildRenderSlide，96dpi、960×720。每份四个彩色矩形，每矩形4×4内部点，64点逐通道精确比较；全画布像素另比较差值>8的像素数。

| 原生样本 | 内部色样 | 实际SVG与独立参照差异像素 / 691200 |
| --- | --- | --- |
| identity | 64/64 | 0 |
| parent45-flip | 64/64 | 25 |
| nested（外45°flipH，内90°flipV） | 64/64 | 7 |
| 原 translate-only 同 parent45-flip | 不适用 | **18342**（断言必须>10000） |

25/7个差异是边缘抗锯齿与既有子框 .01px 序列化，内部点全部精确相同。实际查看 `parent45-flip-actual.png`：四色矩形随父组沿中心45°并水平镜像，保持各自矩形比例；绿色在上、蓝色在左、红色在右、黄色在下。

复现：

```sh
MIMIR_PPTX_GROUP_FIXTURE_DIR=/tmp/mimir-pptx-group-c0-20261017 pnpm --filter @mimir/office exec vitest run src/pptx-group-svg.test.ts
node .trellis/tasks/10-11-chat-edit-office/research/pptx-group-render-raster-20261017.mjs
```

输出 `/tmp/mimir-pptx-group-c0-20261017/`：

- `identity.pptx`、`parent45-flip.pptx`、`nested.pptx`：root 宽/420浏览器验收可直接上传。均非零 chOff(200000,100000)，外组 ext/chExt=(1.5,2)，四矩形原生普通形状，非首张幻灯片保持 title-layout 旧夹具，不将其当新增功能。
- 同名 `.svg`、`.json`（完整实际 render tree）、`-actual.png` / `-reference.png`。
- `parent45-flip-legacy.png` 为旧错位对照。
- `raster-results.json` 为实际栅格统计。
- `child37-flip.pptx`、`shear37.pptx` + svg/tree/actual/upstream-reference PNG + `known-child-and-shear-corners.json` 供以下 C1 前置修复。

## 必须接续的两个几何问题（不在本片偷偷修）

### 1. 当前叶子节点旋转/翻转顺序不同于固定上游

`pptx-svg.ts:transformAttr` 现为 **F·R**；`editors/pptx-picture-crop.ts:pictureCropToSlide/pictureCropTransform` 明确同样 F·R。固定上游 `boxPivotProps` 是 **R·F**。两者仅旋转或仅翻转时无差，但37°+flipH会明显不同。本片父group按正确 R·F，保留已批准 C0 外的旧 child/top-level crop 行为。Root 已要求把纠正作为 C1 前置审查，不能继续把错误烘进新crop。

独立原生 `child37-flip.pptx`：外组无旋转flip，子红形状37°+flipH，group nonuniform1.5×2，当前 child rendered box (15.748031496,20.997375328,62.992125984,41.994750656)。第一角屏幕坐标：

| 表达式 | x | y |
| --- | --- | --- |
| 当前 Mimir F·R | 269.735186182 | 174.249699847 |
| 固定 GenOffice renderer R·F | 295.008258020 | 212.159307605 |
| 原生 S·R·F 解析几何参照 | 291.849124041 | 218.477575564 |

四角完整数据与可复现脚本均已落盘。这里叶子是普通矩形以排除图片解码差异；同 transformAttr 同时用于 picture，C1需增加普通图片及其crop的专项证明。不能把该差距当作免责后遗忘。

### 2. 非均匀组缩放+任意子旋转的 shear

`shear37.pptx` 无子flip，当前Mimir与固定renderer均对已缩放 box 旋转（近似 R·S），与原生先子旋转再父非等比缩放（S·R）不同：

| 第一角 | x | y |
| --- | --- | --- |
| 当前/固定renderer近似 | 244.700509356 | 174.249699847 |
| 原生 S·R 解析几何参照 | 241.541375376 | 167.931431888 |

这是约7.064px几何差，不能以 EMU舍入容差掩盖。本片只证明父group与固定renderer的容器变换一致；没有 PowerPoint/LibreOffice raster实测，`nativeScaledRotation` 是按原生 transform 次序独立算出的解析参照，不能称 Office 实机像素证明。C1必须选定精确图像几何适配并证明原像素前后不移，或明确拦住尚未可靠支持的非等比斜角目标，不开放错误裁切。

## 接续与限制

- Root：独立check、本批统一type/build、真实浏览器父组45flip/nested像素与选中/宽420检查；本片不抢PptxEditor。
- C1：先纠正 childorder 与相应旧 top-level crop，再落实非均匀/shear适配，才接直接组内画布裁切。现有矩阵 helper 可复用 group-local 的正确父映射，但不能替代 native chOff/ext反算或旧子transform纠正。
- 未新增自由编辑/深层组crop/媒体crop，不声称全部工具完成或真实模型调用通过。
