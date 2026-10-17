# PDF 图片当前任务修正：实施边界

2026-10-17。依据 root 的真实 420×500 截图与 `pdf-image-current-task-followup-20261017.md`。

- 最小缺口：翻转等非素材操作仍显示来源选择，挤走真实方向参数；Undo/Redo 后当前 bytes 没有匹配 snapshot，却显示“0 张图片”。
- 行为归属：`PdfImagePanel.tsx` 持有任务与素材身份；`PdfEditor.tsx` 持有当前 bytes/version/history 与只读宿主读取。
- 改动范围：上述两文件及对应面板、真实 Editor 回归测试；如既有 320px body/footer CSS 已够用，不新增样式。
- 不改：PDF 原生编辑算法、OCR、正文、表单、服务端、vendor、其余格式或通用 Inspector 架构。保留九种操作与实际外部能力门控。
- 方式：目标之后先显示操作，仅插入/替换挂载来源；素材身份包含操作、来源、目标、页和版本。可见面板当前读取绑定文档源、字节、版本和页，失败提供刷新，不把未知当空；读取不写历史或 dirty。
- 参考复用：固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 与同日 WeKnora v0.8.3 缓存证据沿任务既有计划；这是已支持操作的 UI/lifecycle 修正，无新增竞品能力结论。

## 验证（待实施）

面板九任务来源显隐、素材切换取消/不复活、未知/失败状态；真实 Editor flip/save/Undo/Redo 保持面板并自动读回、失败重试及关闭/换源/版本迟到拒绝；Office/shared types、scoped lint/format/Antd/style。生产构建与 1280/420 浏览器验收由 root 完成，本文不会将组件测试称浏览器已通过。

## 实施与冻结结果

- `PdfImagePanel.tsx` 将操作提升为独立当前任务：目标→操作→仅插入/替换的来源→实际参数。九种操作保留；插入与替换现在由显式操作决定，选中了已有图片时仍可明确插入新图。既有 320px 内滚动 body 与固定唯一 primary footer 沿用，无新增 CSS。
- 操作、来源、目标、页、源会话与版本共同作废素材；切任务卸载素材组件，终止待返回准备请求并释放预览，切回不能复活旧选择。非素材任务不请求素材能力，也不显示来源条。
- `PdfEditor.tsx` 在可见且当前 snapshot 失效时直接调用只读图片宿主。请求固定 source session/bytes、Agent version、history revision、页与刷新身份；关闭、换源、页/历史变化、内容操作和保存忙碌会取消旧请求；响应核对 controller/handle/version/bytes，无字节写入、无 history/dirty 增量。
- snapshot 缓存按源会话、源字节、当前字节和已物化布局身份匹配；相同原生字节的纯保存/版本推进可复用已验证图片数据，避免自身成功后无谓读取。任何异步响应仍须通过当前版本检查。Undo/Redo 回到不同字节会自动重新读取，失败不冒充 0 张，也不自动重试循环；头部刷新可显式重试。
- 未配置搜索/生成保留实际能力门控与原因。未知状态明确“图片列表未读取”或“正在读取图片”；只有读到空 snapshot 才显示 0 张。

## 已执行验证

- Office 定向 5 文件 **80/80**：图片面板、真实 Editor 图片/外部图片、原有 local 页面历史与 content 生命周期。日志 `/tmp/mimir-pdf-image-task-final-tests.log`。
- 最后源会话绑定修正后，图片 3 文件再次 **47/47**（`/tmp/mimir-pdf-image-task-freeze-tests.log`）。真实 native fixture 翻转→保存→Undo→保存整件原字节精确；Redo→保存整件与首次翻转精确。自身成功只有原生 read+flip，无额外自动读；Undo/Redo 各一次 read，不增加额外编辑历史。
- 新增未知/失败显隐、显式重试零 dirty/version/history、关闭/换源/页/人工编辑后的延迟回复拒绝；九任务来源显隐、任务切换已准备/待返回素材销毁、未配置两类能力门控。既有上传、裁切、旋转/翻转参数、删除确认、Escape、只读与版本取消继续通过。
- Shared/Office typecheck 通过；4 文件 scoped oxlint 零诊断，oxfmt、样式守卫、diff whitespace 通过。Antd 对两个生产文件分别检查通过，CLI 不支持一条 lint 传两个路径，初次命令错误后已改为逐文件执行。
- 本片未运行全局 pnpm check（统一全仓门禁由 root 执行）；没有运行浏览器/server/provider/桌面，也没有构建或删除测试文件。

## 交接

源码和测试冻结，交由主会话安排独立 checker、新 Web build 和 1280/420×500 浏览器验收。保留 root 原浏览器 flip 首次状态重置的未定原因记录；本片不宣称该偶发重置已定位或修复。组件测试和 native 字节验证不能替代新构建的视觉/焦点实机证据。

## 独立检查返工边界

checker 的唯一生命周期红证明外部素材 footer 最后一步没有自己的 AbortController。返工仅为 `PdfImagePanel` 的外部应用增加按现有外部身份挂载的局部执行控件：冻结版本、互斥、将 signal 传入真实 perform、卸载取消；上传 run 和 native 发布算法保持原逻辑。保留 checker 成功读取清旧错误及 Undo→Redo 毒响应回归。增加真实 native 延迟成功与来源/任务/页/版本失效回归；不以禁用关闭或放弱失败断言处理。


## 外部应用取消返工最终冻结（2026-10-17）

### 修复

`PdfImagePanel.tsx` 新增局部 `ExternalImageApply`，仅拥有最后一步外部插入/替换请求。它冻结真实版本，以 controller ref 防止双击重复调用，将同一 signal 传给真实 `perform`；其 key 绑定源会话、页、目标、操作、素材来源及 contextVersion，切换或 Inspector 卸载会同步取消所有权。busy 重渲染保持同一拥有者，不因自身请求变 busy 而取消自身；已接受成功后的新版本重绑定保留真实文档和单次历史。原上传 `ImageControls.run` 和所有原生写入算法不变。

checker 生产机械修复（成功发布当前原生 snapshot 时清除旧 imageReadError）及三个独立回归均完整保留，未修改失败断言。

### 新增行为证据

- 真实 Editor / native 延迟 source 与 page：生成素材为测试宿主 fixture；最后插入等待时切“上传”或导航第 2 页，signal 取消。宿主故意忽略取消，仍实际生成含 1 图的有效 PDF 字节；Editor 不接收，版本/dirty/Undo/保存均不变，生成预览不复活。
- 面板 operation/context/target/sourceKey 取消：最后应用均携带信号，身份改变后信号已取消、无重复调用、旧选择不复活；返回 Editor 实际取消结果形状，不能将宿主取消视作成功。真实 native 忽略取消的发布拒绝由上述 Editor 测试及 checker 原关闭回归验证。
- 真实 Editor/native 延迟成功：busy 期间 signal 不取消，连续点击只有一次 native insert；释放结果后版本恰 +1、真实图片出现且单个历史项。保存→单次 Undo/save 整件原 bytes 精确→Redo/save 整件与首次保存精确；自身成功不会被 cleanup 反转。
- checker 原“关闭 external 插入后真实 native 迟到”回归已由红转绿；旧读错误清理与 Undo→Redo 毒响应取消继续绿。

### 冻结门禁

- Office cwd 下 `pnpm exec vitest run` 明确 5 文件并指定 `--maxWorkers=1`：**90/90 PASS**，`/tmp/mimir-pdf-image-cancel-rework-final-tests.log`。未启动全仓或 server suites。
- 新增等待条件最初将 AgentContext 的 unknown dirty 直接作谓词，Office tsc 报一项类型错；已改为显式 `dirty === true`，未改变实际成功等待语义。Office tsc 最终通过日志 `/tmp/mimir-pdf-image-cancel-rework-office-types-freeze.log`；Shared tsc 通过 `/tmp/mimir-pdf-image-cancel-rework-shared-types-final.log`。
- 5 文件 scoped oxlint、oxfmt、style guard、diff whitespace 均通过；两个生产文件分别 Antd lint：issues=[]、partial=false。日志统一前缀 `/tmp/mimir-pdf-image-cancel-rework-final-`。
- 增测启动时曾在 repo 根目录误用 `src/editors/` 过滤路径，Vitest 退出 1 且没有运行测试；随即改为 Office cwd。该无匹配运行不计入任何验证结果。
- 首次 flip soft 状态重置根因仍未知；本片没有浏览器、真实 provider、Desktop 验收，也没有构建、提交、暂存、归档、上传或删件。

本次返工修改 `PdfImagePanel.tsx`、`PdfImagePanel.test.tsx`、`PdfEditor.external-images.test.tsx` 和本报告；`PdfEditor.tsx` 的 checker 清理修复与 `PdfEditor.images.test.tsx` 的独立新增测试保留。交由 root 正式独立复查和新构建浏览器验收；稳定窗口前的全仓绿灯不覆盖本次后续返工。

最终类型谓词修正后，`PdfEditor.external-images.test.tsx` 明确单文件再跑 **9/9 PASS**（Office cwd，`--maxWorkers=1`），`/tmp/mimir-pdf-image-cancel-rework-external-freeze-final.log`；Office tsc、最后文件 scoped lint 与 5 文件 format/diff 均 exit 0。本片所有启动进程均已结束，无需保留的运行进程。
