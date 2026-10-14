# 五格式上游能力的运行边界（2026-10-13）

固定上游版本与 WeKnora 适用性见 `genoffice-five-format-inventory.md`、`reference-check.md`。本页只解释 Mimir 的平台适配决定为何影响架构。

Mimir 的 `packages/renderer` 与 `packages/office` 编译成浏览器端代码，`apps/web` 是浏览器壳，`apps/desktop` 的本地模式运行同一 `apps/server` 宿主，云端模式直接加载远端地址；页面与宿主之间使用同源 HTTP，不走文档编辑 IPC（`.trellis/spec/project/architecture.md` §3、§14.1）。因此“只在 Electron 主进程调用上游函数”会使浏览器版和桌面云端模式缺少功能。

上游 XLSX 的 55 种工作簿操作依赖 `packages/xlsx-gateway/`、Univer 网格及 `apps/sheets/native/xlsx-engine/` Rust 侧车。Mimir 现有网格是轻量解析和单格补丁，不能直接承载公式重算、复杂格式、图表、透视等同等语义。若目标是浏览器与桌面同等可用，需要研究浏览器侧引擎与服务端托管侧车的边界、实时画布同步、文件大小/内存限制和保存保真。

上游 PDF 的 45 个工具中，文字、图片和 OCR 的真实实现穿过 `apps/pdf/src/main/`；`text-edit.ts`、`wasm-path.ts`、`save-pdf.ts` 等是主进程代码。Mimir 的 `pdf.js + pdf-lib` 页面模型不能仅靠增加按钮实现文字改写。两端同等可用时，应把需要 Node/原生处理的能力放在 Mimir 宿主服务，并以有版本约束的请求返回画布更新；浏览器不得访问任意本地路径。

2026-10-13 用户决定所有高级能力在浏览器版和桌面版保持一致。因而共享宿主服务是需要 Node、Rust、WASM 或原生处理时的优先适配边界；浏览器和桌面本地模式均通过有鉴权的同源 HTTP 调用，桌面远端模式调用其连接的自部署宿主。每项能力只有在两个入口都能真实执行并验证后才能标为完成。
