# 收集与导入 HTML 独立检查

检查日期：2026-10-18。范围仅本任务规划、研究与独立原型；未启动实施、未改产品组件、未运行业务请求、未操作共享浏览器。依据 `check.jsonl`、PRD/design/implement、完整 `capture-inventory.md`、91项 `capture-scenes.json` 与参考研究。补读实际 CaptureDialog mutation/timer、UploadPanel 串行请求/guard、LibraryView 独立drop与共享 detectSource，核对当前列语义。

## Findings (fixed)

- `prototype/main.tsx`：未保存保护的「继续编辑」和 Esc 回结果后，通用初始焦点会落在关闭按钮。统一恢复路径，保留结果/phase，优先回到结果的「打开」动作；不重发导入。普通关闭记录真实触发入口，入口卸载后才回退知识库触发点。
- `prototype/main.tsx`：Tab候选可能包含 `tabIndex=-1` 的未选页签，以及显式tabIndex的disabled页签。筛掉负tabIndex和disabled，使忙碌无可用控件时留在dialog，保留F6进入外部评审工具。
- `prototype/fixtures.ts`、`check-artifact.mjs`：拟改进列原本改用hostname识别来源，超出「保留共享来源标签」合同。经主会话确认，完整URL/2000上限校验后继续使用共享子串检测；补断言保留查询中 `github.com` 的现行识别边界，并调整原型标签/路径与README。
- `prototype/main.tsx`：默认部分失败样本包含网络响应丢失，却仍只提示重新选择上传。拟改进列对任何含网络/连接/响应失败的批次优先提示先核对目标知识库，再决定是否重传，覆盖partial和全失败，不声称安全去重。当前列保持原有通用提示。
- `prototype/main.tsx`：标签范围的评审工具仍可显示Files覆盖/增加模拟批次。补明确范围阻挡与说明；不制造非folder上传能力。
- `prototype/main.tsx`：展开相对路径使用固定目标常量，切换目标样本会不准确。改传本次folder；根目录不添加虚构目标前缀。后缀拆分同时对齐现有「末尾点不算后缀」规则。
- `prototype/review.css`：窄屏清除按钮触点仍为24px。改为44px，边框宽度不随hover变化；评审工具checkbox补可见键盘焦点。
- 重新生成单文件HTML、结构检查结果及revision2来源哈希。

## Findings (not fixed)

没有遗留的已知源码阻塞项。以下是明确保留的任务/验证边界，不标作通过：

- 当前列是有实拍依据的源码/合同复现。等待、错误、结果和未保存缺口未执行真实网络数据采集，不能宣称所有状态像素一致。
- URL来源子串误判、规范URL去重无响应标志、目录在打开后改名/删除时的旧路径风险是现有共享/服务合同；本轮不新增后端或目录协调设计。
- 原生文件/目录选择器、文件系统权限、实际文件拖放/目录遍历、OS输入法候选、触屏、读屏播报、Electron、真实抓取/解析/保存/请求中断未验。HTML工具明确标模拟，不替代这些验收。
- 最终浏览器键盘/回焦、hover几何、浅深、390px、低高度和大文字抽验由主会话独立记录。此报告未操作浏览器，源码样式推断不能证明实际绘制无偏差。
- 按主会话要求，仅调用现有本地二进制，没有 `pnpm`、install/sync 或全仓扫检。其他会话的miniapp/主题/Office/配置/锁文件WIP均未修改。此前全仓lint外部阻塞不因本报告变成通过。

## 覆盖核查

全部91ID与研究清单顺序一致，9组分别为入口8、URL10、阶段12、上传24、目录5、drop9、结果6、生命周期9、布局8。映射60个基础数据视图；复用场景均有独立的操作路径或交叉状态核查，不宣称91个独立页面。

核对入口→参数/目标、URL编辑/清除/校验/组合输入/单飞、请求等待/明确失败/未知阶段/防御响应、串行队列/原件成功/空正文笔记/长内容/24项、目录首段/混合结果/原生边界、独立整页drop/统一反馈提案/重复阻挡/非Files、首个成功打开/刷新提案/未保存继续/丢弃/保存中/失败/恢复、忙碌/settling锁定、重开/退出/焦点，以及主题/尺寸/键盘/ARIA。产品画布外工具控制模拟响应；没有虚构实时百分比、取消后台任务、续传、幂等重试、逐行打开或新目标选择器。

## Verification

- Lint：pass。`node_modules/.bin/oxlint --no-ignore --deny-warnings` 检查main.tsx、fixtures.ts、build.mjs、check-artifact.mjs；`--debug files`确认隐藏任务目录的源文件实际被选中。
- TypeCheck：pass。`packages/renderer/node_modules/.bin/tsc -p .trellis/tasks/10-18-interaction-capture/prototype/tsconfig.json`。
- Format：pass。用 `oxfmt --stdin-filepath <普通源文件名>` 输出与源文本逐字比较，检查6个源码/样式/构建/场景文件。此版本不支持stdin与`--check`组合，因此采用文本比较，未把被ignore跳过当通过。
- Build：pass。`node prototype/build.mjs`，Vite本地构建并内联JS/CSS。
- Artifact/fixtures：pass。`node prototype/check-artifact.mjs`，91ID/9组/全部入口/基础view存在/来源校验断言/无产品导入或业务请求/无外部script-link资源。是结构与夹具检查，不是91项浏览器测试。
- Diff whitespace：pass（本任务限定路径；未跟踪文件另由格式文本比较覆盖）。
- 本轮不重跑产品Renderer测试：仅独立规划原型变更，产品文件未变；功能与真实业务回归留实施轮。

冻结候选：`capture-review-v1` revision2，`approval=pending-user-review`、`productImplementationApproved=false`。

`review.html` SHA256：`fa66bdc5e0ed6a4c7d1383342b7e554754b9f88ce69db162a56fc947b93061e1`。

只有用户认可具体版本后才可按另轮流程实施产品代码。主会话完成最终浏览器检查、审批台账与限定提交。
