# 搜索模块独立实现检查

日期：2026-10-18。执行角色：独立 `trellis-check`。本报告检查产品实现；冻结HTML仍为 SHA256 `0e8a90da0c37c509f8fcda8027c9f01bac5f58607c45db83f10d41f8fb950535`，未修改。

## 范围与核对

- 完整检查 CommandPalette、command-palette 子文件、NavSidebar 搜索触发器标识、AppShell 的命令宿主，以及 DocumentPanel / DocumentCommandModal 和相应测试。
- 对照任务 PRD / design / implement、搜索源码盘点、项目完成定义、Renderer / 表单 / 文档规范。
- 核对真实执行路径：最近12个ID中的笔记子集及错误恢复；IME已确认输入、500字、查询隔离；服务器顺序和独立chunk身份；键鼠等待锁；宿主拥有关闭时机；新建单飞与失败保留；显式AI只预填；离开保护；文档ID绑定和迟到请求隔离；查找门槛；metadata刷新失败保留已挂载编辑器和本地正文；移动8秒撤销与既有citation定位。
- 不修改搜索后端、共享API、Office、其他模块、主题tokens或冻结原型。

## Findings (fixed)

1. `DocumentCommandModal.tsx`：命令弹窗打开时，Ctrl/Cmd+K仍会到达AppShell并打开第二个搜索弹窗，等待请求期间也可发生。增加仅在命令弹窗打开时生效的capture监听，包含字段、footer及pending状态。组合输入仅阻止传播，保留原生默认行为；关闭后恢复AppShell快捷键。增加真实DOM事件回归。
2. `CommandPalette.tsx`：打开时的局部Ctrl/Cmd+K监听未排除Alt，与AppShell关闭状态不一致。统一忽略Alt组合并加入回归。
3. `CommandPalette.tsx` / `command-palette/Feedback.tsx`：搜索/最近重试成功后按钮消失，焦点可能落到body（由主会话GUI发现）。重试点击时立即将焦点交回搜索输入，再发请求；不在异步完成后夺取焦点。回归同时确认用户后来移动焦点时，迟到成功不会抢焦点。
4. `CommandPalette.tsx`：未保存确认取消或新建失败后，disabled→enabled的输入恢复缺少主动焦点衔接。补busy→ready时的输入聚焦；保持原输入、原面板和宿主关闭协议。加入暂停恢复的焦点断言；实际guard动画时序由主会话GUI确认。

## Findings (not fixed)

- 本模块未发现剩余确定性的行为/类型/lint缺陷。现行产品与文档命令合同的规范同步已提醒主会话，由主会话在唯一归属文档更新，避免并发改同一规范。
- 初次完整Renderer在全仓并行负载下，`src/lib/nav-collapse.test.ts`首个测试超时：56/57files、487/488tests通过。未改超时/测试代码；其他进程结束后仅做一次低并发完整确认，全部通过。
- 全仓门仍失败：主会话执行的`pnpm check`受其他小程序工作的7项lint阻断；其单独全仓test还遇到Office加密测试settle失败。属于其他会话/模块，未越界修改。最终准确的全仓输出与后续确认以主会话集成验收记录为准，不能把本轮Renderer通过写成全仓门通过。

## Verification

- Scoped lint：pass。`pnpm exec oxlint`，本轮14个Renderer文件/相应子目录，无诊断。
- Scoped format：pass。`pnpm exec oxfmt --check`，本轮14个文件，最终改动后再次确认。
- TypeCheck：pass。`pnpm --filter @mimir/renderer typecheck`，最终快捷键修正后再次通过。
- 定向测试：5files、33tests通过（Palette11、AppShell9、DocumentCommandModal9、Panel缓存刷新1、snippet3）。
- 完整Renderer确认：`pnpm --filter @mimir/renderer exec vitest run --maxWorkers=2`，57files、490tests通过，46.63秒。
- 随后的IME快捷键两行微调：重新执行DocumentCommandModal单文件9tests、全范围lint/format、Renderer typecheck，全部通过。
- 冻结HTML哈希核对通过。
- 真实浏览器搜索、浅深/窄屏、guard时序、片段位置与焦点效果由主会话执行并独立记录；本报告不把DOM测试冒充浏览器验收，也不声称原生Electron/OS输入法、软键盘或读屏已验证。
- 无提交、无推送；限定提交由主会话处理。
