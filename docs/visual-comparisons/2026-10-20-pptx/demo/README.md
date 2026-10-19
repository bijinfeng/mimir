# PPTX 真实组件交互 Demo

使用真实 `PptxEditor`、`MimirProvider`、编辑器主题桥和原生 PPTX 文件；没有注入 React 私有状态、没有模拟命令成功。`before` 来自固定提交 `3b5d912`；`after` 以本轮最终真实产品源码构建。图库代码和原件一致，主题、编辑区和视口由 URL 与浏览器尺寸控制。

## 打开

从项目根目录启动任意本地静态 HTTP 服务；例如 `python3 -m http.server 5194 --bind 127.0.0.1`。访问：

- `http://127.0.0.1:5194/docs/visual-comparisons/2026-10-20-pptx/comparison.html`
- `http://127.0.0.1:5194/docs/visual-comparisons/2026-10-20-pptx/interactions.html`
- `http://127.0.0.1:5194/docs/visual-comparisons/2026-10-20-pptx/demo/dist/after/index.html?scene=rich`

静态 Demo 默认不调用本地 helper。修改文字和会话内历史由真实编辑器执行；需要原生宿主的工具会明确报未连接，不能当成执行成功。可在辅助区选择 IO 立即成功、立即失败或手动完成；保存 ACK 只把真实输出字节保存在本页内存，点击“重开最近模拟保存原件”重新交给同一原生读取器。刷新页面即清除此保存，不写数据库、知识库或用户文件。

## 原生工具 helper

图库脚本位于活动或已归档的 `10-20-interaction-pptx/gallery` 任务目录，以下脚本均以自身位置发现项目根目录。

`node <gallery目录>/local-host.mjs` 启动固定 `127.0.0.1:5210` helper；需要本地 Node、pnpm 依赖和冻结基线 `/private/tmp/mimir-pptx-baseline-3b5d912`。该目录使用 `git archive 3b5d912` 导出，并只为依赖目录添加指向当前仓库的符号链接。归档中保留实际构建及宿主输入清单与校验指纹。

helper 分别打包基线/当前产品的 `apps/server/src/services/pptx-agent-host.ts`，原生工具、图片及素材上传沿其真实导出执行。仅两处明确隔离：`getDocument` 只认可 `gallery-pptx-数字` 固定身份、不载入数据库；`applyPptxService` 一律抛错，拒绝外部服务、模型生成、远程图片和模板存储。请求最多4MiB，演示文稿最多2MiB；这些演示限制小于产品上限，不是产品能力声明。

在 Demo URL 增加 `&helper=1` 才连接该服务。例如：

`http://127.0.0.1:5194/docs/visual-comparisons/2026-10-20-pptx/demo/dist/after/index.html?scene=rich&helper=1`

helper 只允许本地5194、5208、5209来源，不连接产品后台，不执行永久磁盘写入。断开 helper 后相关工具应显示网络失败而保留当前文稿。真实浏览器原生写入观察与自动化回归分别见验收记录；helper smoke 仅证明已列原生写入，不代表整个工具全集已验收。

## 场景与参数

- `scene=rich`：标题/正文、原生表格、图表及形状。
- `scene=title|text|image|empty|table|chart|groups`：对应固定原生文件。
- `scene=load-pending|load-error|save`：原件读取或保存条件；没有伪造损坏文件。
- `theme=light|dark`：真实 Mimir 主题。
- `width=1100|690|390`、`height=760|640|400`：真实编辑器容器尺寸；浏览器视口另行设置。URL不覆盖浏览器视口。
- `capture=1` 隐藏辅助区，`Alt+Shift+H` 恢复。此项只影响图库辅助UI，不改变编辑器。
- 进入面板、选择对象和修改字段均须通过实际可见控件；URL不注入任何工具私有状态。

## 证据与重建

`fixture-manifest.json` 记录原件来源/字节/指纹；`build-manifest.json` 记录实际输出资源；每个构建的 `source-manifest.json` 记录实际产品与图库输入。`source-before/` 保留基线构建的精确图库输入，文本源使用 `.txt` 后缀避免后续格式化改变证据，映射见 `paths.json`。产品基线源码可由 `git show 3b5d912:路径` 精确恢复。

`python3 <gallery目录>/build-archive.py` 构建真实前后版本；`GALLERY_BUILD_VARIANTS=after` 可只重建当前版。`verify-builds.py` 对照真实资源和源码逐项校验。完整索引保留 AST 原始记录、当前源码指纹、进入提示与来源边界；分类、组、静态标签、动态模板和来源族是不同记录类别，不能相加成“已验证交互数”。Select审计属于控件子集，单独保留而不重复相加。

录屏设备权限、系统剪贴板、外部播放、真实打印/下载位置、AI生成、远程资源和完整 Office 互操作性不由截图或此隔离宿主证明。相关边界见验收。

GenOffice 固定来源为 `480548fd55f1be3593ee0d8e316a734751d58309`，许可原文保留为 `LICENSE-GenOffice.txt`；本轮没有改动 vendor。
