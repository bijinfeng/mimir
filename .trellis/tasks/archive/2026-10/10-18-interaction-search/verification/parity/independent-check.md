# 搜索 v1 还原修正：独立检查

日期：2026-10-18。检查者为独立 trellis-check 子代理；未提交代码，未修改冻结稿、全局 tokens、Office 或其他会话的文件。

## Findings (fixed)

- 文件：`packages/renderer/src/components/command-palette/styles.ts`、`host-styles.ts`。
- 问题：局部 `margin-top: 0` 的优先级低于 Ant Design v6 的窄屏 `.ant-modal-root .ant-modal { margin: 8px auto }`。主会话实际浏览器测得390×844搜索浮层由目标118.16px下移至126.16px。源码确认该默认规则来自安装的 antd 6.6.6。
- 修正：两种局部 modal 样式均使用 `&&& { margin-top: 0 }`，只提高本模块选择器优先级，不改变宿主布局或全局弹窗默认值。类型、lint、格式和全部Renderer回归通过；修正后的实际坐标由主会话浏览器记录确认。

## Findings (not fixed)

无尚未修复的本轮范围内代码发现。全仓质量门由主会话执行和记录，不能用本报告的Renderer结果代替全仓通过。

## 对照依据与逐组核对

冻结 `prototype/review.html` 重新计算的SHA256为 `0e8a90da0c37c509f8fcda8027c9f01bac5f58607c45db83f10d41f8fb950535`，未改变。阅读 `prototype/main.tsx`、`review.css`，结合 `verification/visual-parity-audit.md` 与 `renderer/frontend/search-parity.md` 进行以下源码核对。16组为152项交互覆盖类别，不能称为152个实际页面。此表表示源码与回归检查，不表示独立代理逐项真实浏览器操作。

| 组 | 独立检查结果与证据 |
| --- | --- |
| entry | 620px模态、搜索整行16/18与gap10、局部无边框Input、整行1px焦点底线；宿主拥有关闭，关闭才恢复可见入口，交接不抢焦点。CommandPalette回焦/快捷键回归通过 |
| recents | 账号12ID的note子集；403/404隐藏、401查询错误、部分成功保留并可重试；新增storageUnavailable只读状态，不再把损坏或不可读记录当真实空态。recent-documents、Palette与RecentNotes回归通过 |
| input | 14/21输入、组合输入独立提示、500字符时显示计数；临时组合不发查询、不执行选字Enter/Escape，非空词过滤命令、trim>=2搜索。IME/上限回归通过 |
| query | 首次loading/empty/error在列表中央140px反馈区；缓存刷新/失败独立条，刷新中禁止旧结果执行；queryKey隔离与迟到返回回归通过 |
| hits | 13/20标题、12/19两行片段、10/16路径及Folder；26px图标、桌面88px顶对齐、右下ChevronDown详情。服务端顺序、重复文档独立chunk和原引用字段保持 |
| selection | stable key跟随异步插入、删除回第一项；中性选中背景、2px可见焦点、分离上下键提示；等待时键鼠按钮一致禁用。选择身份回归通过 |
| new-note | pending/error为列表外独立条；同步单飞、guard确认后创建、成功才导航正文；不确定网络结果无直接重试按钮，明确先检查知识库。App与Palette可控promise回归通过 |
| capture | 收集动作仍交既有宿主，未修改收集模块业务或原型；其搜索行外观共用本模块样式 |
| context | 当前文档信息加载/错误反馈位于操作前；未知kind不猜note能力，file只开放真实移动和返回。能力回归通过 |
| rename | 480px/24px宿主、当前笔记上下文、名称字段、保存按钮；IME、单飞、失败保留草稿、目标文档绑定；已写入但刷新失败仅重试读取。命令和DocumentPanel回归通过 |
| move | 同一480px宿主、移动到与所选目录；目录读取/失败改独立边框反馈，恢复才显示Select，等待锁与原8秒撤销链保持；失败草稿/目标ID回归通过 |
| find | 同一宿主和当前笔记上下文、名称为查找内容；trim不足2字时禁用确认且Enter明确提示，未命中保留关键词；不新增下一处/替换。阈值/IME/真实find回调回归通过 |
| open-hit | 独立480px详情Modal、完整标题/路径/片段；底层inert并暂停trap，返回后查询/选择保留且输入回焦；打开时原SearchHit交宿主，guard取消仍保留搜索。双层焦点/guard回归通过 |
| ai | 左Sparkles及单条预填说明、右显式动作及ArrowRight；Enter只执行当前结果，不隐式提问；交接保scope、不发送，guard取消不写草稿。App/Palette回归通过 |
| guard | 仍复用既有manual/auto/Office离开保护；暂停底层交互、取消后输入回焦，不改保存算法。现有UnsavedGuard、App与文档回归通过 |
| layout | 局部批准尺寸/色角色集中导出；620px/6px、max440内部滚动、桌面14vh、390px44px触点与低高限制；浅深surface/shadow/selected及10pxfooter按稿。修正AntD窄屏8px顶距覆盖，实际渲染交主会话确认 |

## Verification

- Lint：通过。17个本轮TS/TSX文件（含command-palette目录）的scoped `pnpm exec oxlint`，0错误/告警；日志 `lint.txt`（成功时为空）。
- Format：通过。同范围 `pnpm exec oxfmt --check`，17文件；`format.txt`。
- TypeCheck：通过。`pnpm --filter @mimir/renderer typecheck`；`typecheck.txt`。
- Tests：通过。`pnpm --filter @mimir/renderer exec vitest run --passWithNoTests --maxWorkers=2`，57文件、495测试，47.26秒；`renderer-tests.txt`。包含新详情层、创建不确定结果、坏存储恢复、命令等待/草稿/刷新和全部既有Renderer回归。
- 样式守卫：通过。`node scripts/check-style-backticks.mjs`；`style-guard.txt`。Renderer的design.test也随完整回归通过，未放宽字号守卫。
- AntD：通过。分别对CommandPalette.tsx、command-palette目录、DocumentCommandModal.tsx运行 `antd lint <target> --format json`；三个JSON均0问题、0跳过且partial=false。
- Frozen HTML：SHA256一致；未修改原型或通过改稿掩盖偏差。

## 验证边界

本代理没有进行独立GUI操作；同状态截图、计算样式、浅深桌面/390px/低高、真实网络状态与命令弹窗的视觉证据由主会话实际浏览器验证。组件回归验证层级结构与交接合同，不能证明像素一致、真实系统IME、触摸软键盘、读屏、Electron原生快捷键或200%浏览器缩放。未重测搜索算法、后端排序或Office内部查找；这些没有被本轮修改。全仓门及既有外部阻断必须由主会话另外记录，不能声明全仓通过。
