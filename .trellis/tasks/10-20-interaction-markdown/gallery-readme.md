# Markdown 模块10交互 Demo 入口

实现与完整操作说明见 [gallery/README.md](gallery/README.md)，74个稳定ID的入口映射见 [coverage-map.json](gallery/coverage-map.json)。源清单见 [research/inventory.md](research/inventory.md)。

- 基线：`http://127.0.0.1:5198/?scene=body&theme=light&width=1100&height=760`
- 当前：`http://127.0.0.1:5199/?scene=body&theme=light&width=1100&height=760`
- 长期归档：`docs/visual-comparisons/2026-10-20-markdown/demo/dist/before/index.html`与`after/index.html`，使用静态HTTP服务即可操作，无后端。
- `scene`固定fixture与IO条件；实际组件完整操作通过真实控件打开。`prepare=1`为选区/table/code/wiki/slash公开命令的一次性预置。`theme`、`width`、`height`确定配对条件。操作后`Alt+Shift+H`隐藏辅助导航，再截图；同快捷键恢复。

该Demo不证明真实IO/写盘/重开/付费模型；gallery覆盖映射不等于已验收。真实产品和全仓质量证据由主任务独立归档。现行异步内联改写选区身份限制保留，本轮不把它包装成已修复。
