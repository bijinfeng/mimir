# 更新交互现状与参考证据

日期：2026-10-20，Asia/Shanghai。只读调研，尚未改动产品代码。

## 用户已确认

- “还有自动更新的交互需要好好设计下。”此前最终方案未获批准，本次回到交互收敛。
- 对“轻提示，点击后查看详情并决定重启”和“自动打开更新详情窗口”的选择，用户明确选前者。更新完成不能自行弹出模态框或详情窗口；这是产品决定，不是从现有代码推断的默认。

## 本地现状

- `apps/desktop/src/renderer/components/TitleBar.tsx`：44px 客户端横栏只有品牌、侧栏折叠和窗口控件；可扩展低强调的更新状态入口，新增动作必须 no-drag。
- `apps/desktop/src/renderer/routes/about.tsx`：已有客户端专属 About 页面，显示 boot.version 与使用方式。适合补显式“检查更新”入口，不应在此复制独立更新控制器。
- `packages/renderer/src/components/settings/ClientSection.tsx`：现有设置只管理使用方式，并明确避免再造一套模式配置。更新详情同理应只维护一套状态与内容。
- `packages/renderer/src/lib/unsaved.tsx:119` 的 runGuarded 读取 dirtyRef，保存分支校验 changeVersion/editorVersion/pending，失败不放行。可复用，但只被应用内导航显式调用；不天然拦截 Electron 安装重启。
- `packages/renderer/src/components/UnsavedGuard.tsx:105` 之后依据 saveMode/canSave/saving/saveError 提供真实可执行动作。自动保存不提供虚假丢弃，没有句柄时不承诺代为保存。更新不能另造一个比它更弱的确认框。
- `rg -n 'beforeunload|will-prevent-unload' packages/renderer/src apps/desktop/src -g '*.ts' -g '*.tsx'` 未命中，说明目前没有这两个窗口离开处理；这是本次调研时的源码证据，不是已验证的更新安全能力。
- `apps/desktop/src/main/index.ts` 的 before-quit 只关闭宿主，不能证明 renderer 已写入保存内容。旧方案还没有覆盖准备退出到安装器启动之间的未保存保护。
- 云端页面没有 preload，因此不可能直接复用本地桌面桥调用保存和安装。需保留远端隔离；能证明的 beforeunload 保护和旧云端能力未知路径必须分开表述。

## 视觉证据

- 实际查看 `.trellis/tasks/archive/2026-10/10-19-tanstack-official-chat-ui/verification/screenshots/main-light-final.png`：白色内容区、浅灰侧栏、紧凑行、绿色操作语义、低强调次要动作。它是 2026-10-19 共享工作区截图，非本次新窗口、非当前桌面原生菜单截图。
- 与 `.trellis/spec/project/design.md` 的当前紧凑工作台、系统字体、绿色主操作契约核对一致；本次只继承这份规范，不修复缺失 DESIGN.md 等与任务无关的设计配置。
- 新窗口没有真实渲染证据；`ux.md` 是待评审方案，不能标为视觉验收通过。实施后需用实际组件和真实 Electron 分别留证。

## 参考核对

- WeKnora 官网、稳定版 v0.8.3 与源码快照 `8dab7550f5069ef80877a65b52dc5483c45f7827` 已在本任务 `distribution-evidence.md` 记录。已读的 `.github/workflows/app.yml` 只能证明其桌面相关 CI 路径，未证明可移植的 Electron 更新 UI；不以知识库或 Markdown 编辑器交互替代桌面更新设计。
- 页面连续性主参考仍为项目已记录的 Obsidian 工作区，实际视觉权威为 Mimir 当前规范；不将软件更新套成 Office 工具栏，也不借此替换全局品牌风格。
- 本次访问 `https://help.obsidian.md/Getting+started/Update+Obsidian` 与 `https://help.obsidian.md/update` 均 HTTP 200，重定向到 `obsidian.md/help/...`，静态响应只提供页面壳和标题，未读取到可验证的自动下载/重启正文。未核实对应 Obsidian 应用版本或当前更新界面，不能将方案中的按钮、提示和行为描述为 Obsidian 的现行原样实现。

## 设计取舍

采用用户已选非模态提醒，以持久入口解决通知消失的问题；主动打开的本地更新详情窗口统一承载进度、日志和动作，兼容宿主断线与远端隔离。重启前把编辑器保存保护置于宿主关闭之前；只有真实具备能力时才呈现“保存并重启”，旧远端能力未知时明确需要用户先保存，不虚构自动保存保证。
