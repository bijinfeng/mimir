# 收集与导入 · 独立产品检查

2026-10-18，`trellis-check`。范围为 CaptureDialog、UploadPanel、capture 局部组件/样式、LibraryView drop、AppShell 交接、UnsavedGuard 及相关测试。按主会话确认，补查并修正 OfficeSourceEditor 的守卫保存能力注册。没有派生子代理，没有改冻结原型、全局主题、Shared/Server、小程序或其他会话 WIP，没有提交。

## Findings (fixed)

- `CaptureDialog.tsx`：Enter 仅排除组合输入与 229，未排除键盘长按的 repeat 事件。补同步过滤及事件回归，防止一次请求快速失败后长按继续发起抓取。
- `capture/styles.ts` / `capture/upload-styles.ts`：漏掉批准稿末尾及窄屏覆盖。补齐窄屏行左右 0px（上下保持最终 8px）、footer 14px、来源行高 1.8、阶段元信息宽度/行高、空上传入口 130px（有结果仍用 compact 54px）、提示最大宽 270px，以及禁用入口图标/提示的灰色。窄屏结果动作全宽规则已正确存在。
- `CaptureDialog.tsx` / `capture/styles.ts`：AntD 空 suffix 默认占 4px，挤占空值输入宽度。保留 suffix 节点以稳定输入焦点，空占位取消 margin，有清除按钮时采用批准稿 5px 间距。
- `capture/capture-tokens.ts`：与全局完全相同的 item/body/title/label 档位改用 FONT_SIZE，保持既有数值；局部 compact/meta/hint/button 的批准稿例外不扩散至全局。
- `UnsavedGuard.tsx` / `capture/styles.ts`：交接的提示引用不存在的 `captureStyles.small`，导致本任务类型错误。补具名 guardHint（12px/1.7/muted），移除内联 margin。
- `lib/unsaved.tsx` / `document/OfficeSourceEditor.tsx`：Office 实际注册的是提示工具栏保存后返回 false 的非空回调，Boolean(save) 不能证明可以代存。经主会话确认，setSave 增加第三可选能力参数（默认 true，仍要求回调非空），Office 提示回调显式注册 false。默认守卫保留既有操作；capture 变体准确提供返回编辑器。回归使用非空 async false 回调加 false 能力，避免用 null 伪造实际 Office 路径。
- `_app.tsx`：结果交接缺少宿主同步打开状态检查，未保存状态为空时同帧重复点击会重复导航。补 captureOpenRef 检查与回归；已关闭后的回调不再交接。
- `CaptureDialog.test.tsx`：补真正的“卸载后 promise 返回成功”测试，断言仍刷新库查询，但不启动导航；此前的卸载回归仅覆盖已安排的 timer。
- 检查期间发现 captureHandoff 取消/关闭后可能污染普通守卫；实现代理交接前已补 onContinue、close 清理与 captureOpen 限定，以及取消关闭后普通导航恢复默认守卫的回归。独立复查通过。

## 全范围核对

- 冻结 `main.tsx` / `review.css` / `coverage.json` 对照：91 项覆盖按 entry/url/stage/upload/directory/drop/result/lifecycle/layout 逐组核对。没有把 91 项描述为真实页面。
- URL 保持共享 substring 来源识别；完整 URL、长度、IME、同步单飞、260ms settling、未知阶段不补成功、卸载清理和 null ID 路径合理。
- 上传按选择顺序串行；50MiB 边界、原件无正文成功、Markdown 空正文说明、丢响应先核对、继续选择替换本地结果及查询刷新均有对应代码/回归。
- inline drop 复用逐文件结果，不提供首个打开按钮；只接受目录范围的 Files，空列表/非 Files 不启动；宿主批次锁覆盖 modal 与 inline 的并发入口。
- 结果在守卫期间保持挂载，暂时隐藏收集层避免两个活动焦点陷阱；取消/保存失败不重复写入。普通守卫与其它模块默认行为保持兼容。
- 冻结 HTML SHA256 再验为 `fa66bdc5e0ed6a4c7d1383342b7e554754b9f88ce69db162a56fc947b93061e1`。

## Findings (not fixed)

- Renderer 类型门被其他会话的 `src/lib/agent-media.check.test.ts:12` 阻断：ES2023 目标库不存在 Promise.withResolvers（TS2550）。未改它、未排除文件、未提高目标库。
- 主会话全仓 `pnpm check` 停在小程序及其原型 lint：未使用变量、React refs / set-state-in-effect 等。见 `repo-check-final.txt`。本检查不扩大范围修改他人正在开发的文件；不能宣称全仓质量门通过。
- 本检查按主会话分工不操作浏览器。真实视觉/hover/焦点、390px/深色/低高度由主会话采样并另记证据；操作系统选择器、真实目录拖放、OS 输入法、读屏、触屏、Electron 及真实业务成功不能由组件回归替代。没有宣称全部原生路径通过。
- 未发现其它未解决的本模块代码缺陷。canSave 能力的唯一归属规范由主会话同步至 capture-parity，避免在检查报告外重复维护合同。

## Verification

- Lint：**pass，exit 0**。根 `node_modules/.bin/oxlint`，限定本模块 20 个源码/测试文件，含 capture 目录与 OfficeSourceEditor。记录 `product/check-lint.txt`（无诊断）。
- Format：**pass，exit 0**。`oxfmt --check` 同范围 20 个文件，见 `product/check-format.txt`。
- `git diff --check`：**pass，exit 0**，限定本模块范围。
- AntD CLI lint：CaptureDialog、UploadPanel、UnsavedGuard 各自执行，均 0 issues。
- TypeCheck：**fail，exit 1**。Renderer `node_modules/.bin/tsc --noEmit`，唯一诊断为上方外部 Promise.withResolvers；见 `product/check-typecheck-final.txt`。
- Tests：**pass，exit 0**。Renderer `node_modules/.bin/vitest run --maxWorkers=4`，**59 files / 511 tests**；见 `product/check-renderer-tests-final.txt`。
- 先前默认并发一轮为 508 pass / 1 timeout，超时位于未修改的 nav-collapse 首个动态 import（5000ms）；不改 timeout 或断言，以 maxWorkers=4 限制资源争用后通过 509 项，最终新增两项后 511 项全过。两次原始输出保留在 `product/check-renderer-tests.txt`、`product/check-renderer-tests-bounded.txt`，不掩盖失败记录。

质量结论：本模块限定 lint/format/测试与代码审查通过；类型和全仓门仍有明确外部阻断。是否提交及任务状态由主会话结合真实浏览器证据记录，不应将外部失败写成已通过。
