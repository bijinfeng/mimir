# 独立 HTML 原型构建与静态检查

日期：2026-10-18。所有权仅本任务prototype/及本文；未改产品代码、未启动实施、未代替用户批准。

## 交付物

- `prototype/review.html`：自包含React交互稿，无产品导入、业务API或浏览器存储读写。默认DOC-009.idle提案，支持当前/提案/上下同宽比较、适应窗口、浅深、1024桌面/390窄屏/700中栏/480低高、200%文字、减少动效。
- `main.tsx` / `review.css` / `index.html` / `build.mjs`：可维护原型源与构建。
- `generate-manifest.py` / `scenes.json` / `coverage.json`：从研究权威清单逐项生成78组、422状态；current/proposal states区分。
- `check-artifact.mjs` / `checks.json`：除422条链接外，检查29条实际渲染机制与事件处理源码绑定、关键恢复合同及自包含约束。
- `README.md`：使用路径、原型/宿主边界；`check-logs/`保留构建/类型/lint/格式/静态检查输出。

## 最终检查

下列检查实际执行，exit 0：

| 检查 | 命令/范围 | 结论 |
|---|---|---|
| 独立类型 | Renderer tsc -p prototype/tsconfig.json | 通过 |
| 限定lint | main.tsx、build.mjs、check-artifact.mjs | 通过，无规则抑制 |
| 限定格式 | main/review.css/build/check-artifact/index/tsconfig/README，显式format.json | 通过 |
| Vite单HTML构建 | node prototype/build.mjs | 通过；单文件chunk >500KB为构建提示，不影响静态独立打开 |
| 映射与机制 | node prototype/check-artifact.mjs | 78组/422唯一状态/29条渲染轨道绑定通过 |
| 限定diff空白 | git diff --check -- prototype 本文 | 通过 |

最终HTML SHA256：`2a3aafb4277c37bd06e38ae94ecec085e0f31a062b88e25a000042e5cbdb220d`。具体冻结元数据由主会话在完成独立检查/GUI后登记；本报告不表示获实施授权。

## 集中修正的关键点

- 标题确认取消、blur留稿、IME/同步单飞。已保存刷新失败使用持久metadataSaved状态，GET等待和再失败均不开放重复写；GET成功才清恢复状态。
- 命令Enter与按钮共用submitCommand；查找无命中保留输入且不触发重命名。移动目录错误使用可变读状态，成功重读恢复选择。
- 统计建议/目录读取与标签写入分开；标签只在成功后采用/移除候选，采用错误不混成生成错误；20标签上限/撤销等待与失败有具体界面。
- 当前只读正文不伪装笔记；DOC018当前围栏标题确实误入大纲，提案才排除；DOC020有重复首后/跨节点fixture；无可靠命中保留阅读位置。
- DOC058为同名PPTX宿主与截图草稿；062为同名DOCX和真实修订Switch；063为同名XLSX能力状态。Office不可代存，原生Back/关闭未伪装系统确认。
- 浅深/390/中栏/低高直达同步画布，390含52px导航。真实outside关闭、Escape/回焦/IME和等待锁保留。

## 证据边界

422是静态枚举状态与可定位路径，29是渲染轨道，不是GUI执行次数。主会话负责真实浏览器代表路径与截图，独立检查员负责源码/覆盖复核，本报告不冒充二者。API结果均手动评审模拟，未执行真实后端写入；无媒体轨的audio/video仅原生控件示意，实际解码、Range、下载、外站新标签、剪贴板、读屏、系统刷新关闭与Electron均未在本原型证明通过。完整笔记/Office/Chat内部仍归各自模块。
