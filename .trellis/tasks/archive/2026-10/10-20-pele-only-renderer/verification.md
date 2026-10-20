# 验证与交付

- 用户要求试用后正式替换，Mermaid仅保留Markdown语言标记；Pele1.6唯一渲染、错误保留源码、安全边界不变。
- 实施与独立审查均通过4文件34测试、Renderer类型检查及定向lint/format。锁仅删除 Mermaid importer 与103个packages、103个snapshots，保留条目不变。
- 新真实组件档：`docs/visual-comparisons/2026-10-20-pele-only/`。前态引用388f1c0试用档，后态最终源文件哈希已核对，118个构建资产。68组浏览器截图与几何记录、4张总览、修复/撤销/重开验证齐全。旧档原样保留。
- 真实撤销保留原图表源码；Tiptap段尾空白规范化已记录，不误记为逐字节无损。重开前后Markdown字节一致。
- 完整质量门的最终命令与退出证据见新档 `quality-result.json` / `full-check.txt`。
- 已知长中文与主题/布局限制沿用试用结论；无性能收益断言，无Pele升级。

完整门已通过，exit0，exec session56118。Renderer84/627、Office235/2774、Server122/1365及其余包和根脚本通过。最终所有维护文件格式检查通过。
