# PPTX 组内目标与统一多选 Agent 接缝（2026-10-17）

## 固定证据与适用性

- GenOffice 只读仓库 `/tmp/mimir-genoffice-html-git` 本次 `git rev-parse HEAD` 为 `480548fd55f1be3593ee0d8e316a734751d58309`。`apps/slides/src/renderer/App.tsx:3292–3405` 的轮廓、样式和填充回调遍历全局 `selectedIds`，选择组合时只下穿一层成员，并传 `sourceId` 与 `groupId`。它是本片多对象和直接组合成员格式的主要参考。
- 固定引擎 `packages/pptx-ops/src/prompts/ops/text.md:5–7` 与 `ops/{text-ops,core-ops}.ts` 定义已有 `{target:{slide,el:child},group:parent}`，分别接 `setGroupChildFont`、`setGroupChildParagraphFormat`、`setElementFill(...,{groupId})` 和 `editGroupChildStroke`。`ops/registry.ts:315–352` 从顶层组合解析其直接成员，并接受成员自身的 GUID 与 cNvPr 别名；`pptx-engine/src/identity.ts` 的 `groupChildDurableId` 从组合原生 XML 解析成员 GUID。不是新增模型操作协议。
- WeKnora 官网 `https://weknora.weixin.qq.com/` 本次 HTTP 200，下载主页到 `/tmp/mimir-group-weknora-home.html`；公开固定 v0.8.3 commit `3e22822c1d2397be730c458c7539d0eb8c113a24` 的 `internal/agent/tools/definitions.go` 本次 HTTP 200，下载到 `/tmp/mimir-group-weknora-definitions.go`。该文件列出知识检索、文档读取、Wiki 和沙箱能力，并明确沙箱文件/执行工具由会话能力授予，不因普通工具复选框隐式开放。适用于继续保留 Mimir 当前文档、宿主能力、版本和取消边界；该源码没有 Office 组合选择语义，因此不用于决定 Ribbon 或组合编辑方式。

## 最小变更边界

原适配器 `hostedOps` 只规范化顶层对象；本地 `setFont`/`setText` 会忽略 `group` 并查顶层，Agent 上下文和冻结选区也只读顶层。仅改 `packages/office/src/agent/pptx-agent.ts`，加独立 `pptx-agent.group-selection.test.ts`，修复已有宿主目标 transport 和当前选择读取。没有修改 vendor、通用 schema、Editor、工具栏或其他格式。

- 带 `group` 的既有操作必须走宿主。只准原生实现了 group 分支的 11 类操作；组合 ID 必须指向当前页顶层组合，成员必须直接属于它，二者均转换为持久 ID 后送宿主。无效组、外来成员、深层组合或不支持的 group 操作明确拒绝，不会降为顶层操作。
- 已有白名单：`setText`、`setFont`、`setParagraphFormat`、`setFill`、`setStroke`、`setTransform`、`flipElements`、`setShapeGeometry`、`setShapeAdjust`、`setShapeCustomGeometry`、`setImageFill`。本片真实专项验证前五类；其余沿既有原生实现，只补 transport，不扩大全部编辑能力的验收声明。
- `getContext` 与 `read_slide` 递归显示 `children`，每个成员给出原生持久 ID、父 `group` 与实际文本。深层结构可读，当前写入仅支持顶层组合的直接非组合成员。
- `currentSelection` 兼容原单选接口并接受可选 `elementIds`。`freezeSelection` 解析顶层及直接成员，返回主 `elementId`，组内主目标带 `groupId`；传入多选时补 `elementIds` 与 `elements:[{elementId,groupId?}]`。运行时 ID 规范化，已选 cNvPr `e_*` 别名保留，不因 creationId 升级更换原选择身份；失效目标过滤。
- 批量原子执行、版本/停止、onChange、保存与整轮撤销继续复用原句柄。真实模型未配置，本片只验工具执行层，不声称通过真实 Agent 生成。

## 验证

- 专项测试由真正 `createBlankPptx` + `addElement` + `groupElements` 创建两个原生有文字形状与组外对象；host 运行真正原生 `openPptx/runTxn(isolation:'atomic')/savePptx`。
- 新专项 5 项：嵌套上下文/统一冻结；两成员字体、段落、填充、轮廓八操作一次宿主/一次发布；保存 commit 后再保存逐 ZIP entry 相等和未触及部件保留；GUID/cNvPr 别名持续与同轮 setFont/setText 整轮撤销；错误父组/外来成员/不支持操作/空组整批拒绝；原生参数失败不发布和无宿主不降级。
- `pnpm --filter @mimir/office test src/agent/pptx-agent.group-selection.test.ts src/agent/pptx-agent.test.ts`：2 文件 **11/11** 通过（新 5 与原有 6，不累计其他切片）。Office typecheck 通过。目标 Oxlint/Oxfmt/diff 结果见本片最终报告。
- 工具栏多选、画布框选、对象树、宽屏/420px 和真实浏览器保存下载由主会话统一集成验收。本片不将原生专项测试当浏览器或真实模型验收；不提交、暂存或归档整体任务。
