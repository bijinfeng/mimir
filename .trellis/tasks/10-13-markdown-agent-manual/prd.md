# Markdown Agent 与手动编辑对齐 GenOffice

## Goal

接入固定版本 GenOffice Markdown 操作并对齐笔记编辑入口

## Requirements

- 逐项对照上游 8 个 Agent 工具、15 种 Markdown 操作及手动命令，覆盖块、样式、列表、表格、链接、图片、frontmatter 与长文写作。
- 保留 Mimir 的 `.md` 上传即导入笔记、vault 同步、内链和方言处理；Agent 读取未保存内容和冻结选区。
- 图片搜索/生成依赖通用设置，未配置或失败时真实反馈。

## Acceptance criteria

- [ ] 能力矩阵逐项记录上游、Mimir 入口与实际执行验证；所有目标能力通过后才完成本子任务，Agent 和手动操作可交替编辑同一笔记。
- [ ] 块、表格、frontmatter、图片与长文代表操作保存重开且 vault 同步正确。
- [ ] 冲突、停止、回退与已有笔记功能回归通过。

## Dependency

依赖 `10-13-format-agent-core`；不新建第二套 Markdown 原件存储。
