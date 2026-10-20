# 验收记录

## 范围与结果

用户要求验证后移除 Mermaid 回退。`diagram-render.ts` 仅动态加载 Pele 1.6.0，失败直接返回可恢复错误；加载失败会释放失败 Promise 供后续请求重试。SVG 净化、隔离 img、禁用 links/images、50,000字符上限和原 Markdown 源码合同继续有效。WaveDrom 不变。

正常渲染路径与上一轮相同；没有宣称完整 Mermaid 兼容或速度提升。

## 验证证据

- 独立 implement/check 子代理分别通过4文件34测试、Renderer类型检查、定向 lint/format 与源码空白检查。
- 独立审查按锁文件结构核对：只有 renderer importer 删除 Mermaid，删除103个 packages 与103个 snapshots 均属于不再使用的 Mermaid 闭包；保留条目及 pnpm 自举锁文档不变，无悬空引用。
- 真实浏览器：后态15样例×2主题×2宽度=60组，前态流程/错误×2主题×2宽度=8组；全部图片已加载且有有效自然尺寸，无页面/预览横向溢出。8组错误均是固定无效源码的预期结果。
- 最终构建以1280×720固定视口重采68组截图；主组件实际宽度与条件一致、padding为20px。早期整页截图捕获出现临时重排，已全部替换为固定视口版本，不用作验收。
- 四张总览人工复核：正常图表、普通代码、WaveDrom均显示；长中文缩小与部分深色连线低对比保留既有表现。
- 真实编辑器按钮：错误源码保留，替换有效图表后成功绘制，读取Markdown后重开再读取字节一致。撤销恢复相同原始源码；Tiptap补充段尾空白，去除段尾空白后正文一致，未将此记作逐字节无损。
- 后态静态HTML成功构建，118个资产中没有 Mermaid/Dagre/Cytoscape引擎命名的chunk；产品源码及依赖移除另经独立审查确认。旧档保留原依赖资产，不代表产品仍加载旧引擎。

## 兼容性边界

Pele1.6的无空格长中文不自动换行，390px列内整图缩小；Mermaid theme/themeVariables及部分布局配置并不等价，宿主CSS变量不穿透隔离图片。深色连线、mindmap、pie部分颜色对比度依旧有限。Pele不支持的语法直接报错，源码仍可编辑，不再调用 Mermaid。

本轮不升级Pele、不扩展主题或布局。版本及竞品证据沿用 `.trellis/tasks/archive/2026-10/10-20-pele-mermaid-trial/research/pele-evaluation.md`，包括 WeKnora v0.8.3 / eecfe4b3c8c34c94e9b559e5dd02187b4ae447cd 的集中严格 Mermaid入口；该项目没有给出Pele迁移成熟度证据。本轮未新增竞品调研。

## 完整质量门

完整命令为 `VITEST_MAX_WORKERS=1 pnpm check`，结果另见 `quality-result.json` 与 `full-check.txt`。不缩小检查范围或改断言/超时。

最终完整运行退出码0（exec session56118）：Renderer84文件/627项、Office235/2774、Server122/1365，以及local10、fnOS4、backup2、Desktop7/57和仓库脚本6项通过。完整日志同档保存。归档源码与记录额外执行format:check，2121文件通过；未改变检查范围、断言或超时。
