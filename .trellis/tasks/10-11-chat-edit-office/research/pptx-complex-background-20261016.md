# PPTX 当前复杂背景保真复制（2026-10-16）

## 最小缺口与实施边界

原 Inspector 遇多色标、非标准端点、rect/shape 路径、焦点/tileRect/scaled 等背景时，应用全部被禁用，必须先改成双色。现在新增手动 `manual_fill` 的严格 `copy-current-background` 分支，从服务端当前原件解析并复制；无草稿的应用全部沿该分支，显式“改为双色渐变”与草稿应用仍沿原有受控操作。沿用既有320px右Inspector、滚动内容/固定底部动作，不新增表单或布局。

所有权仅共享 fill schema、PptxFillControls/相关测试及 manual-fill 服务/独立copy helper；未改 Editor 实现、Agent实现、公共host实现、vendor、其他格式或任何提交/暂存。根会话负责公共合同、矩阵和真实浏览器验收。

## 固定参考核对

- GenOffice checkout `/tmp/mimir-genoffice-html-git`，`git rev-parse HEAD` 实测 `480548fd55f1be3593ee0d8e316a734751d58309`。`apps/slides/src/renderer/components/FormatBackgroundPane.tsx:73` 的 `currentFillOp` 用 `gradientOp(gradFrom, gradTo, gradAngle, gradRadial)` 重建双色渐变，只表示UI当前两端点，不是任意原复杂背景的保真复制。Mimir保留该显式双色编辑语义，另实现当前原生背景复制，未扩大模型操作白名单。
- 固定引擎 `parse.ts` 的背景继承为slide→layout→master→bg1；图片关系按其实际所属部件读。`bgRef idx` 引用theme fillStyleLst/bgFillStyleLst模板及phClr颜色。本片沿该OOXML语义解析，而非把reset分别施加到各页（后者会恢复各自母版，视觉不等于源背景）。
- WeKnora v0.8.3，固定 `3e22822c1d2397be730c458c7539d0eb8c113a24` README 本轮下载HTTP200，保存 `/tmp/mimir-complex-background-weknora.md`。43/49/53行是知识理解、检索/RAG/Agent/wiki；181/187行是浏览器/MCP与知识检索工具。适合知识库/Agent组织，不是原生PPTX背景语义来源。站点本轮HEAD 10s超时，HTTP000/curl28，未称访问成功。

## 服务与交互合同

输入：`{kind:'copy-current-background',slide:number,allSlides:true}`。严格schema不接受XML、路径、任意关系或其他额外字段；仍走已鉴权PPTX宿主、当前未保存字节、版本与signal合同，不成为模型工具。

1. 源原生 `<p:bg>` 从当前slide、其layout、其master依次读取；无原生背景时物化源bg1（默认白色）。
2. 全部原生渐变色标/位置、alpha与颜色变换、线性scaled/角度、circle/rect/shape路径、fillToRect/tileRect、effect/ext节点均保持。不把任意多色标/路径重建为两个颜色。
3. 源继承背景在目标页物化为本地背景；目标母版、版式、主题及背景图形显示/隐藏开关保持原件。源自身已有本地背景时其slide字节保持原样。
4. 若目标theme colors/clrMap与源不同，将源scheme基色固定为sRGB，保留原有变换/alpha子节点，避免在目标主题下变色；相同映射保留原scheme引用。
5. bgRef按源theme原始填充模板展开，phClr先使用引用颜色的变换，再接模板变换；theme模板部件/关系不改。旧固定vendor模型在bgRef占位色alpha上有损，测试明确使用原OOXML alpha语义而非照抄其缺alpha的读取值；本片不修改vendor解析器。
6. 图片保留原blipFill裁剪、alpha/duotone、tile偏移/比例或stretch等完整XML；按真实来源slide/layout/master/theme的image关系解析，在每一目标slide添加/复用指向同一内部media的关系。不重复拷PNG或接受浏览器mediaPath。外链、缺失或非image关系明确拒绝，不产生部分输出。
7. 源根命名空间/markup compatibility上下文局部保留在复制背景，避免扩展前缀在不同目标根失效。
8. 准备补丁时累计检查既有ZIP单部件64 MiB、总解压400 MiB、10000条目预算，禁止大量复杂背景复制在压缩前无限放大。所有目标补丁先准备，单结果一次发布，一次版本/历史；不自动保存库文件。不变结果`changed:false`且返回原请求字节。前后signal与现有UI epoch/pending保护保留。

## 实现文件

- `packages/shared/src/pptx-fill.ts`：新增严格手动分支。
- `apps/server/src/services/pptx-copy-background.ts`：保留原条目字节的原生背景适配，无客户端XML/路径入口。
- `apps/server/src/services/pptx-manual-fill.ts`：从当前打开的原件分派，ZIP预检与版本结果。
- `packages/office/src/editors/PptxFillControls.tsx`：无草稿all转专用分支，复杂背景说明更新，双色显式转换保留。
- `PptxEditor.complex-background.test.ts`：真实host/native/继承、关系、边界专项。
- `PptxEditor.fill-host.test.tsx`：当前图片all断言更新，新增真实Editor完整保存历史链。
- `PptxFillControls.test.tsx`：复杂背景直接复制及显式转换草稿的行为。

## 已验证

`pnpm --filter @mimir/office exec vitest run src/editors/PptxEditor.complex-background.test.ts src/editors/PptxFillControls.test.tsx src/editors/PptxEditor.fill-host.test.tsx`：3文件22/22（`/tmp/mimir-complex-bg-tests.log`）。包括：

- 4原生色标/alpha、自定义rect焦点/tileRect/effect/ext、scaled=false线性、pattern前景/背景及noFill；未改部件逐条目字节一致，XML独立校验、两次保存、重复all不dirty。
- layout继承、源clrMap与目标不同、保留目标隐藏背景图形开关；theme bgRef三色标/shape路径和占位色alpha/tint变换。
- master图片背景原生crop/alpha/tile偏移、内部media复用与目标关系重映射。
- 真实PptxEditor→handle→authenticated host adapter，复杂背景面板直接all一次host调用→保存→一步撤销保存→重做保存；无媒体fetch、不要求转换为双色。
- 原八纹理、当前图片拉伸/平铺、epoch取消、显式双色、原有填充回归；伪造XML/关系/路径、越界页、取消、陈旧版本、失效图片关系拒绝。

Office/server/shared tsc、7源文件Oxlint和Oxfmt检查、Antd lint（0 issues）及目标diff检查均通过；日志位于`/tmp/mimir-complex-bg-{office,server,shared}-tsc.log`、`/tmp/mimir-complex-bg-lint.log`、`/tmp/mimir-complex-bg-antd-lint.log`。公共接口更新交根会话；当前宽/420px真实截图、Escape/focus与文件下载重开由根会话继续，组件/native通过不冒充真实浏览器或模型调用验收。整体全工具补齐仍未完成。
