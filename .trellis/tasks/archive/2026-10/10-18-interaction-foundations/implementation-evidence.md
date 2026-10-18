# 基础组件 v1 实施证据（2026-10-18）

仅基础组件获批。产品文件：
- `components/KnowledgeBaseCreateModal.tsx`、新增 `KnowledgeBaseCreateModal.test.tsx`
- `components/settings/SettingControl.tsx`、`SettingControl.test.tsx`
- `components/UploadPanel.tsx`、`UploadPanel.test.tsx`
- `components/LoadError.tsx`
- `components/document/DocumentHeader.tsx`、`DocumentHeader.test.tsx`
- 新增 `components/confirm-danger.tsx`、`confirm-danger.test.tsx`
- `components/library/LibraryView.tsx`、`components/nav/FolderSection.tsx`：仅三个删除确认调用点

所有以上路径相对 `packages/renderer/src/`。本代理另写当前任务 change-boundary.md 与本文；没有提交或推送，没有写 token/spec/冻结原型/Office。

验证：
- 限定13文件 `pnpm exec oxfmt` 完成，`pnpm exec oxlint` exit0，无诊断。
- `pnpm --filter @mimir/renderer typecheck` exit0。
- 5个相关测试文件20项全部通过，最终日志 `/tmp/mimir-foundations-targeted.log`。
- AntD CLI 对修改的 Modal/SettingControl/UploadPanel/危险确认/DocumentHeader lint均0 issues。
- 未单独跑全Renderer；按主会话协调，由全仓check统一完成。未自行做浏览器验证，由主会话在隔离数据环境完成。

保留项：当前1px细边主题；真实静态预设/目录选择；数字边界与Slider；checkbox/radio；CaptureDialog标签/设置分区草稿；AccountRow与FolderRow既有键盘路径；UnsavedGuard手动三选项与自动双分支；Office保存能力边界；上传串行请求与原件保存但无正文算成功。无新API、伪上传进度、后端重试/撤销承诺。

注意：新增危险确认测试以 AntD hook-modal 返回的 confirmed=true 作为离开事实，避免在 happy-dom 中依赖CSS退出动画结束；失败时验证原对象/后果文字存在且未发布 confirmed，并验证真实取消焦点和pending锁定。实现同时启用 hook-modal then 模式以抑制已在界面处理的请求拒绝，不隐藏请求错误。
