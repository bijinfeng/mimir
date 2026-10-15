# 参考资料核对 · 2026-10-15

本任务以 Mimir 当前设计契约和实际界面为依据。旧审查截图只列复查线索，不视作当前缺陷证据。

## WeKnora 核对

- 2026-10-15 查看 [WeKnora 官网](https://weknora.weixin.qq.com/)：导航及发布区均标为 **v0.8.3**；“回答有据可查”说明问答附来源引用，可打开原文核对；发布区“原文引用定位”进一步说明点击引用可定位到原始文档对应段落。
- 同日查看 [Tencent/WeKnora 公开源码主页](https://github.com/Tencent/WeKnora)：README 的 `What's New` 标为 **v0.8.3 · 2026-10-14**，列出 `Source citations`，说明可从回答跳转到原文引用段落；仓库可见 `frontend/`、`docreader/` 等目录。版本取该日公开页面显示值，不沿用项目 9 月调研的 v0.8.0 快照。
- 适用于 Mimir：检验“问答引用 → 文档原文定位 → 返回对话”的可见反馈、焦点与失败恢复。WeKnora 的团队权限、Wiki 图谱、Agent 工具箱属于不同产品范围，不引入本轮。知识库与 Agent 行为比较以 WeKnora 为主要参考。

## 其他领域参考边界

- 页面布局与视觉以项目已确认的 Obsidian 式连续分栏、低对比表面和内容优先原则为主；当前蓝色 token 与 `.trellis/spec/project/design.md` 是落地依据。不会直接复制另一产品的色值或布局。
- Office 文件编辑以 Office 网页版、Google Docs 和项目现有 GenOffice 编辑能力作为工具栏与画布的领域参考；仅修复现有真实命令的呈现及可达性，不用 WeKnora 的 Markdown 编辑器推断 Office 工具栏。
