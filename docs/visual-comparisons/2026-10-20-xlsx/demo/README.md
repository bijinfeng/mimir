# XLSX 真实组件前后演示

基线：`dcb9a40`，由 git archive 导出到 `/private/tmp/mimir-xlsx-baseline-dcb9a40`，没有建立正式 Git worktree。两端使用相同依赖、fixture、主题和尺寸；真实 `XlsxEditor`、`MimirProvider`、editor-theme-bridge、Ribbon/Inspector/Canvas 均直接从对应源树导入。

## 启动与访问

仓库根目录运行（配置路径需为绝对路径；不在工作树中改 vendor）：

```sh
GALLERY_SOURCE_ROOT=/private/tmp/mimir-xlsx-baseline-dcb9a40 pnpm --filter @mimir/web exec vite --config /Users/admin/Desktop/mimir/.trellis/tasks/10-20-interaction-xlsx/gallery/vite.config.mjs --port 5204 --strictPort
pnpm --filter @mimir/web exec vite --config /Users/admin/Desktop/mimir/.trellis/tasks/10-20-interaction-xlsx/gallery/vite.config.mjs --port 5205 --strictPort
node .trellis/tasks/10-20-interaction-xlsx/gallery/local-host.mjs
```

- Before：`http://127.0.0.1:5204/?scene=rich&capture=1&width=1100&height=760`
- After：`http://127.0.0.1:5205/?scene=rich&capture=1&width=1100&height=760`
- 隔离 Node helper：`127.0.0.1:5206/before`、`/after`。两端分别执行冻结/当前树的原生宿主逻辑。
- 静态永久归档：HTTP 打开 `dist/before/index.html`、`dist/after/index.html`。若由5194服务仓库，则路径为 `/docs/visual-comparisons/2026-10-20-xlsx/demo/dist/before/index.html`。静态默认拒绝宿主操作；仅在显式 `helper=1` 且本地helper运行时接通。`file://` 不适用于JS模块与原生文件读取。

参数：`theme=light|dark`、`width` / `height` 是编辑栏尺寸（最小280×220）、`capture=1` 隐藏辅助区，`Alt+Shift+H` 恢复。`scene` 只选原件或IO条件，**不会自动打开工具/Inspector，也不会注入画布选择或搜索结果**。

## 原生工作簿

| scene | 原件语义 |
| --- | --- |
| rich | GenOffice 原有 xlsx-fixture.xlsx，逐字节复制，不重新生成内容 |
| pivot / data | 复用 xlsxPivotFixture：区域、部门、日期、金额、成本、渠道原生数据；保留原件属性、公式与customXml |
| cross-sheet | 复用 xlsxCrossSheetPivotFixture：五表、长中文源表名、汇总、隐藏、受保护来源 |
| validation | 复用 xlsxValidationFixture：原生列表、命名范围、whole/custom规则；stop/warning/information和提示；需在实际第二表选择格子 |
| fill | 复用 xlsxFillFixture：原生继承填充、条件格式、字体/数字/边框属性 |
| objects | 复用 xlsxShapePreviewFixture：6种原生形状（渐变/旋转/透明/主题/自定义等）、冻结窗格、隐藏行；不是手绘UI替代物 |
| search | 基于原件的本地OOXML数据适配：240行含“项目”的真实文本、数值、公式和C2的#DIV/0!缓存；第二表内容不同。必须真实输入“项目”检索，未预置任何结果 |
| load-pending / load-error | 同rich原件；仅宿主读取Promise等待/首次失败，重试走组件真实路径 |
| save / save-error | 同rich原件；保存行为由下述IO控制，不自动点击保存或制造已保存状态 |

fixture SHA/字节数、来源函数与builder源指纹见任务 `gallery/fixture-manifest.json`。原生测试builder通过独立构建时脚本执行，只生成ZIP原件；没有复制产品的UI或编辑逻辑。

## 两种 IO 边界

**加载与保存是可控的宿主 IO 模拟。** 原件只从同源固定asset读取。保存模式：`controlled` 手动完成/失败、`success` 立即成功、`error` 立即失败。成功ACK后将编辑器实际输出的XLSX字节仅存当前页面内存；“重开最近模拟保存原件”更换documentId，从已保存字节重新解析，不写知识库/数据库/用户文件。刷新会丢失这份内存副本。辅助区展示pending/dirty及操作日志。未接入全局离开页面未保存拦截。

**范围、对象、表格、透视等是原生本地 Node 执行。** helper调用原有 `applyXlsxOpsOnHost`；唯一身份查询替换为`gallery-xlsx-数字`的fixture文档声明，不导入真实documents/数据库模块。全部业务校验、XML变更、版本和changedCells来自实际产品逻辑。结果字节返回当前页面，不写原件或后端。helper仅监听127.0.0.1，限制Origin、2MiB工作簿和4MiB请求，未授权来源拒绝；请求取消沿AbortSignal传递。远程图片获取和重算执行在打包时替换为明确失败的边界，上传图片同样明确拒绝，无外网、模型或计算工作进程。

静态文件没有Node运行时，默认对此类提交给出“未连接本地Node helper”错误，**不会假成功**。上传、远程图片和独立公式重算需要在真实产品宿主另行验收；不能将此页视为其通过证据。浏览器下载/剪贴板等仍是实际浏览器权限与行为。

## 指纹与验证边界

- `gallery/build-manifest.json`：每个静态资源字节数/SHA和variant聚合SHA；`headAtBuild`仅是构建时HEAD，未提交源码以逐文件SHA为准。
- `dist/{before,after}/source-manifest.json`：实际参与构建的项目输入SHA。
- `gallery/helper-source-manifest.json`：两端Node宿主实际源码/产物SHA和三个隔离替换。
- `gallery/helper-smoke-verification.json`：真实HTTP set_cell smoke，**不等同GUI验证**。
- 完整索引见相邻interactions.html及上级interactions.html，共447个研究来源记录（32界面、242静态控件、63分组、60动态标签模板、30状态、20动态族），没有展开相乘。source-only条目、组件测试和浏览器观察分别登记，不把“源码列出”当成GUI通过。

GenOffice来源固定 `480548fd55f1be3593ee0d8e316a734751d58309`，Apache-2.0许可见相邻 `LICENSE-GenOffice.txt`；vendor来源以 `packages/office/vendor/UPSTREAM.json` 为准。原有OFL字体许可随dist保留，但本XLSX演示未额外引入DOCX字体资产。
