# 原型首轮独立审查（只读）

2026-10-18，检查首次构建的 prototype/main.tsx、review.css、fixtures.ts、scenes.json、coverage.json；builder 正在集中修复，本轮未修改其文件。此清单是修复输入，不能充当最终通过记录。

## 阻断：状态覆盖必须有实质路径

58 项 / 299 个状态 URL 已生成，但大量状态仅切换标题或 phase 字符串，不能认为全部已覆盖。应逐项给出明确初始画面、真实动作或具体交接页及检查预期；只有自然微状态（hover/focus/keyboard）可共享画面，但必须有可到达和可验证的准确交互路径。

1. **容量与同数据**：maxCount 仅将头部改为 100，listDocs 始终是 8 份文档；LIB-006.100-cap / LIB-050.100-limit / LIB-P04.100-loaded 显示虚假数量。创建 100 条同源样例并真实滚动，前后保持相同样例、次序、来源、count。
2. **初始读取/根库缺失**：LIB-006.loading、LIB-019.loading 未初始化 listState=loading；LIB-016.zero-roots 只令 hasLibrary=false，却不令 missingRoot=true，落正常内容。LIB-P03.zero-roots-folder 才有正确分支，current 同样须保留真实缺口并明确呈现。
3. **成功/取消/未改状态**：例如 LIB-024.success、LIB-038.success 仅初始 phase=success，仍显示删除确认；LIB-003.cancel/success/unchanged 仍为相同编辑窗。不能以相同初始弹窗充当已完成结果。可用明确“先操作→结果”路径，但 coverage 必须写清触发器/预期，不写所有状态同一句泛化说明。
4. **目录/标签/滚动边界**：LIB-018.empty-child 没有子目录路径；LIB-047.long-list 没有长列表、scrolled 也没有展示滚动后状态；LIB-031.long-excerpt 未注入长摘要；LIB-032.narrow-failed、LIB-033.narrow-hidden 未切换窄容器。通过具体 fixture 或明确可操作路径体现差异。
5. **微状态**：LIB-049.pressed/disabled/keyboard/focus-return 在目前普通列表上没有相应目标与验证步骤；主循环根本没有 disabled 目标。需要可用目标/准确步骤、禁用无法执行、按压不改盒子尺寸的细节。

## 阻断：当前侧忠实度

6. 当前文档列表源码是整行 button，原型只有标题 button 可开，行空白无行为；文件夹列表源码空白可进入，原型同样缺失。卡片当前源码有专属文件类型 glyph（Word/Slides/PDF 等），原型使用同一 FileText，弱化真实现状。
7. 源码当存在 failed 文档时启用独立“状态”列，原型将失败塞到“详情”列、未显示“状态”表头。当前卡片源码文件夹有“文件夹” chip，原型未画。应依据 baseline 和源码还原，不能悄悄美化/降级 current。
8. 当前 failed 保留徽标，ready 为 quiet；对比文案元数据 LIB-032 / LIB-045 应同步研究材料已修正的事实。
9. 当前页内 UploadPanel 位于 topbar 之前，原型放在列表末尾；既有模块 4 不应在 current 改布局后称忠实。

## 阻断：跨模块与危险操作

10. **删除目录真实结果**：finish(folder-delete) 仅移除文件夹行，原属此子树的 doc 仍留当前 KB 列表，违反 folder=null 后不再属于该 KB 的真实结果。准确移除这些归属文档（全局仍保留），不实现不存在的自动重新归库。
11. **知识库删除交接**：LIB-043.delete-empty/nonempty 只打开普通 kb 菜单；选择 kb-delete 却弹“删除文件夹 参考资料”，对象、后果与下一步全部错。区分顶层库/子目录对象、空/非空、删除后首库或无库引导；知识库编辑复用模块 2 名称+描述/稳定 code 对账，不用泛化错误弹窗替代。
12. **文档移动合同**：当前 Select 的空值标签真实为“知识库根”，prototype 两侧都改为“无目录归属（清空 folder）”。应 current 忠实保留，若 after 纠错需明确是本轮提案或只做解释性交接。folders-loading/error 时提交仍可用；read-refresh-error 的重试仍走同一写请求（request），违背模块 3 仅重新读取的合同。当前目标/未改应不写直接关闭。
13. **详情目录菜单**：LIB-046.current-disabled/other-folder/no-folder/move-out 的菜单目前全是“选择目录 / 移出目录”且两个动作均开同一个 move 窗；实际当前目录禁用、可直接选择其他路径、无目录时不显示移出。交接应准确呈现既有分支。
14. **替换结果**：评审按钮 finish(true,'error'/'empty') 只改 toast，modal Notice 却依据静态 scene.state 生成，可能同一画面成功 toast 与“提取失败/无正文”内容矛盾。结果必须由同一 parse outcome 状态驱动。失败重选、原生取消/同文件重选的交互路径须分别明确。
15. **危险取消行为**：当前 confirmDanger mask.closable=false，原型通用 backdrop 单击可关闭所有危险确认。pending 锁定/初始取消焦点/错误保留对象应两侧沿用已批准基础合同。

## 阻断：键盘和回焦

16. openMenu 后既不聚焦 menu 也不提供 trigger ArrowDown 路径，菜单内 ArrowUp/Down handler 通常没有机会接管；必须可从键盘进入菜单，Escape 返回原 trigger。
17. menuAction→openModal 又 rememberFocus，保存的是将被卸载的菜单 item；关闭时 origin 不再存在就落“添加文档”fallback，无法回到具体文件夹/文档更多按钮。保留原触发器，重命名 reconcile 后按稳定对象恢复，必要时才合理 fallback。
18. 输入法处理中通用 pane Escape 仍 dismiss；当前层与提案层没有区分既有缺口/修复，提案 IME 时应阻止误关/误提交。目录请求 pending 的同帧防重不应仅依赖下一次 render 的 phase（可用 ref 模拟同步锁）。
19. 直接打开 #scene=LIB-048.390-dark 时 App 只从 hash 初始化 scene，size/theme 仍桌面浅色，只有 select(next) 才切换；直接可定位状态必须初始化对应约束或明确提供可达路径。

## 非阻断但须诚实记录

- 本次不打开浏览器、不执行 OS 文件操作；主会话负责批量 GUI 抽验。代码审阅发现不能替代运行时证据。
- 不需改变产品规范或产品代码；仅独立 HTML 规划，所有拟修复依旧待用户认可。
- scoped lint/type/build 应在 builder 修复完成后独立重跑；本首轮不抢占其构建产物所有权。
