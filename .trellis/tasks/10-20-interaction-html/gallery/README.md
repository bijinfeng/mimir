# HTML 真实组件交互 Demo — 暂停交接

2026-10-20：用户要求优先处理 `/chat?scope=all`，HTML 模块暂留规划状态。本目录为已保存的未验收准备稿，尚未启动 Vite、运行构建、做浏览器验证或生成静态 bundle，不能据此宣称场景可用。

## 已保存内容

- `main.jsx` 直接导入真实 `HtmlEditor`、`MimirProvider`、renderer `editor-theme-bridge`，无手绘编辑器、假 Inspector 或假图片弹窗。
- `vite.config.mjs` 使用动态 `GALLERY_SOURCE_ROOT`，默认当前工作区；基线为 `/private/tmp/mimir-html-baseline-0c44cde`。仅沿真实 HTML 文件入口编译，未引入 Office 总入口。
- 固定 HTML 含标题、正文、布局容器、数据图片、链接、表格、列表与长内容；没有外部字体或图片地址。
- 场景导航、`theme`、`width`、`height`、`capture` 参数；`Alt+Shift+H` 显隐辅助控制。
- 加载/保存/规划/写作 IO 使用手动 Promise，辅助按钮驱动公开 `HtmlAgentHandle.execute` 的问题、提纲、写作、撤销与版本失效路径。默认不连接后端、调用模型或写入用户数据。
- 真实演示、新窗口与导出动作尚保留，应在浏览器验收时明确它们会触发真实浏览器展示/下载，而非模拟回调。

## 恢复后待办

1. 阅读当前任务最终设计与实现边界，按实际 ID 清单补 `coverage-map.json`。
2. 审核 fixture，运行格式与 React 规则检查；处理任何启动/组件接线问题。
3. 检查 5200/5201 未占后，以 `--strictPort` 启动前后真实入口；报告 ready URL。
4. 用真实 iframe 点选元素、图片、链接、容器及表格验证 Inspector；不可手造 postMessage 或读取隐藏内部实例。
5. 手动结算写作增量、停止、失败、保留、丢弃与过期。验证加载失败/重试、保存等待/失败与恢复。场景导航目前只切固定内容或 IO 条件，不自动打开各菜单。
6. 产品冻结后生成前后静态 bundle、完整 source/bundle SHA 与构建清单；当前尚无这些证据。

计划启动命令（尚未执行）：

```sh
GALLERY_SOURCE_ROOT=/private/tmp/mimir-html-baseline-0c44cde pnpm --filter @mimir/web exec vite --config /Users/admin/Desktop/mimir/.trellis/tasks/10-20-interaction-html/gallery/vite.config.mjs --port 5200 --strictPort
pnpm --filter @mimir/web exec vite --config /Users/admin/Desktop/mimir/.trellis/tasks/10-20-interaction-html/gallery/vite.config.mjs --port 5201 --strictPort
```

注意：gallery 自身样式只调整辅助导航及固定尺寸宿主，不应覆盖实际组件控件。真实与模拟边界需在最终 README 补齐，不把未验项写成已通过。
