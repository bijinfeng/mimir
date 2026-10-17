# PPTX 批量图片项目符号：实施边界

2026-10-17。固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 的 RibbonHomeTab → selectedIds → setParagraphFormat 已证实批量图片符号语义，见最终参数审计 §3.3。WeKnora v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24` 的缓存能力门控证据适用于 KB/Agent；不作为 Office 工具栏或原生 writer 的依据。

## 最小缺口与归属

- `pptx-selection.ts` 禁止图片符号；批量字段只读显示 blip。去除该拒绝，改为对所有选择身份、深度和文本资格完整预检。
- `PptxSelectionControls` 持有图片读取草稿，选图仅准备，固定主动作一次提交；版本、来源、页、选择变化卸载旧草稿并 abort FileReader。字段组件展示混合图片状态及文件名，沿用现有内部滚动和固定页脚，不另开弹层。
- 原生 `setParagraphFormat` 已提供顶层/直接组成员落媒体、关系与段落补丁；沿用一个宿主 candidate 和一个历史。通用宿主入口目前仅验证图片字符串，需添加 PNG/JPEG 大小/真实格式/解码预检，整批通过后才运行 native txn。仅调整该入口及专用 helper，不碰生成服务/catalog。

## 验证

定向原生测试覆盖 PNG/JPEG 两顶层与同组直接成员、每段 blip→rels→精确媒体、非目标 XML/ZIP 保留、两次保存重开、保存后 Undo/Redo；不支持/失效身份和坏图整批拒绝。组件覆盖混合状态、文件读取取消/错误/迟到、切版本/源/选择清草稿、唯一主动作。实际 Inspector 1280×800/420×500、Escape 与完整 Web build 由 root 统一验收。

不改 vendor、其他格式、生成服务、公共生成 catalog，不 commit/stage/archive/delete；现有异步 session/selection 守卫复用而不另造发布通路。若原生语义不满足，先报告后确定最小 adapter。
