# PPTX 系统剪贴板与多幻灯片独立检查（2026-10-17）

## 范围与参考

由另一实现者完成后 freeze，再独立审查本批：shared manual clipboard/upload schema、`pptx-system-clipboard.ts`、ClipboardBridge/Controls、PptxEditor 接线、server manual clipboard/upload 和 private slide graph adapter。保留既有深层组成员复制限制，不修改 vendor、不扩大 Agent 操作白名单。

主要语义参考 GenOffice 固定 commit `480548fd55f1be3593ee0d8e316a734751d58309` 的 `clipboard-actions.ts:64–128,170–200` 和 `slides-main.ts:2539–2608`，即真实系统图片、原生内部剪贴板标记、有序多页一次事务。WeKnora 本次官网 HTTP200；公开源码 v0.8.3 固定 commit `3e22822c1d2397be730c458c7539d0eb8c113a24` 的 `internal/agent/tools/definitions.go` HTTP200/13533bytes（本会话 `/tmp/mimir-xlsx-fill-weknora-tools.go`）。其权限与能力诚实性可参考，没有 Office 系统剪贴板及备注/页面关系图实现，不作为文件编辑主模型。

## 发现并修复

1. **同步选择校验异常永久占用快捷键锁。** ClipboardBridge.run 原来直接调用 `action(signal).catch(...)`。深层组合、失效或不唯一身份会在 `copyInput` 同步抛错，跳过 catch/finally。新增“第一次复制同步失败、第二次有效复制”回归，在修补前失败（未捕获“深层组合暂不支持单独复制”）；使用 async 边界捕获同步与异步错误后通过，onError 正确反馈，pending 释放。
2. **取消图片后处理状态永久残留。** 图片宿主已返回原生结果但浏览器尚未接受时，Escape、切页、切文档均正确 abort，版本/保存/历史无修改；但 applyLocalAsset 在 abort 分支不清除“正在处理素材…”。新增三项 mounted 回归，修补前三项在处理提示不消失处失败。finally 仅在 controller 仍持有本请求时清除仍为该 processing 文案的状态；成功反馈和其他后续状态保留。三项修补后通过。

修补文件仅：`PptxClipboardBridge.tsx`、`PptxEditor.tsx` 及对应两测试文件。均已重新 freeze。

## 核查结论

- 系统 clipboard read 仅来自明确用户命令；native paste/drop 使用真实 PNG/JPEG 文件，限制一张、≤8MiB、类型/签名校验，宿主另校验尺寸与实际内容。普通文字输入、contenteditable、combobox、Inspector 键盘事件让位；sorter 快捷键使用实际 aria-selected 页面集合。
- 不把 sessionStorage ref 当作系统剪贴板。内部复制成功后尝试 OS text marker，失败保留可见内部回退；解析标记经 strict UUID/schema 及长度检查，宿主仅接受本进程签发、有期且源文件可访问的 ref。
- Bridge/Controls 按 document/slide/version/selection 取消旧请求。applyLocalAsset 验版本/页面/signal、`replaceFromHost` 再验，晚到字节不发布。新图片宿主返回 durable ref，画布真实回选并进入既有一次历史；天然比例、80% 页面内 fit 和拖入中心由 native transform 保存。
- 多页选择1–40页、去重、按源顺序准备；cut 整批预检再降序原子删除。notes 部件与回链显式迁移；所有目标slide路径生成后 remap 同批 links。媒体/版式/母版/主题链保留，重复粘贴备注回链不共享，等价 notesMaster/theme 图复用，冲突图拒绝。
- 外部页面 links、仍指向 cut 页的 retained slide links、comments、Zoom/customshow/section、3D占位、外链媒体、不同页面尺寸和不兼容 notesMaster 在改动前拒绝。没有降级为无备注或断链成功。
- 保存验收同时包含：有序多页+真实媒体+备注+同批互链跨文稿两次保存；重复粘贴；原生notesMaster/theme重命名；Inspector一次粘贴后的 save/undo-save/redo-save 完整ZIP条目一致；真实系统图片插入/回选及历史保存。

## 实际门禁

- Office：`vitest run src/editors/PptxClipboardBridge.test.tsx src/editors/PptxClipboardControls.test.tsx src/editors/PptxEditor.selection-clipboard.test.tsx src/pptx-selection-clipboard.test.ts` — **4文件44项通过**（包含独立检查补4项）。
- Server：`vitest run src/test/pptx-slides-clipboard-host.test.ts src/test/pptx-selection-clipboard-host.test.ts` — **2文件12项通过**。
- 本次修补4文件目标 oxlint、oxfmt check、Office tsc、git diff --check 通过。未改 shared/server 生产代码；其类型及原门禁由实现者 freeze 记录，server专项由本检查独立重跑。
- 未执行 build 或浏览器/桌面操作。根会话负责统一构建与1280/420px真实浏览器验收，Desktop由用户自验。真实OS授权、native剪贴板事件与drop视觉需根会话实机核对；测试不声称代替它们。
