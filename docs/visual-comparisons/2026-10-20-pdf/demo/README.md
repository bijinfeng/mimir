# PDF真实组件Demo

使用 `PdfEditor`、产品主题桥、`useSource`、真实PDF.js worker与canvas，源码基线为 `53285bbdeaa17475e04aae517f07c957776cb6b6`。不是CSS重建或mock。

- 基线：`http://127.0.0.1:5194/docs/visual-comparisons/2026-10-20-pdf/demo/dist/before/index.html?scene=annotations&width=390&height=400&helper=1`
- 当前：同路径把 `before` 改为 `after`。
- 场景：`text` / `annotations` / `forms` / `image` / `rotated`；每份固定原件均3页。另有 `load-error` / `load-pending` 场景。
- 参数：`theme=light|dark`、`width`、`height`、`capture=1`。Alt+Shift+H显示或隐藏辅助区。
- `io=controlled`（默认）手动结算保存，`io=success`立即成功，`io=error`立即失败。保存仅在当前页面内存，刷新丢弃；“重开最近模拟保存原件”从内存中真实PDF字节加载。

在仓库根目录运行 `node .trellis/tasks/10-20-interaction-pdf/gallery/local-host.mjs` 启动5213隔离宿主。任务归档后使用归档目录内的同名脚本。Demo URL须显式加 `helper=1`。辅助宿主调用产品PDF原生服务函数，使用当前请求提供的最多4MiB PDF字节；不查产品数据库、不写产品文档。PDFium/HarfBuzz和本地图片编解码沿产品实现；文档保存ACK仍是页面内存模拟。远程图片URL、外部模型与图片生成明确拒绝；未配置的OCR资源/设备权限/系统打印须另验。

基线组件源码来自冻结checkout，与git show固定SHA逐文件校验。`source-before/`保留实际基线gallery输入；`fixtures/`保留pdf-lib生成原生PDF，生成过程与产品原生批注测试结构一致。`fixture-manifest.json`记录哈希及字段。`build-manifest.json`分别记录所有发布资源哈希，dist内`source-manifest.json`记录实际参与构建的源码输入。PDF.js运行时原名资产和原始许可证随包保留。GenOffice原始Apache许可证保留。

`interactions.html`为可检索完整源码映射，区分分类、命令组、界面、控件、标签声明、动态来源族、JSX条件分支和state hook。异质、嵌套、动态记录不能作为独立动作总数；Select审计是重叠子集；source-only不是逐项GUI通过。真实截图和验收记录由主会话实际操作后另存。
