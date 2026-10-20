# Pele 单引擎替换验收

本轮将试用版收敛为 Pele 1.6.0 唯一引擎，删除 Mermaid 回退及其运行依赖。`mermaid` Markdown 围栏保持兼容。

- [真实组件前后 HTML](review.html)：使用相同样例、主题和组件宽度。前态引用上一轮不可变归档 `../2026-10-20-pele/demo/dist/after/index.html`（commit 388f1c0），后态为本轮 `demo/dist/after/index.html`。前态历史引擎资产保留作比较，不属于当前产品依赖。
- [验收记录](acceptance.md)、[浏览器矩阵](browser-matrix.json)、[交互结果](interaction.json)。
- `screenshots/` 保存 68 组固定视口截图、4 张总览、修复/撤销及前后对比。组件宽度390/900px，浏览器视口1280×720；图表区均完整可见，较长页面的页尾可能在视口之外。

运行 `python3 docs/visual-comparisons/2026-10-20-pele-only/demo/build-archive.py` 重建后态。它使用真实 `createExtensions`、Tiptap NodeView、`MimirProvider` 与正文排版，固定内容，无后端写入。

预览：在仓库根运行 `python3 -m http.server 5208 --bind 127.0.0.1 --directory docs/visual-comparisons`，打开 `http://127.0.0.1:5208/2026-10-20-pele-only/review.html?case=flowchart&theme=light&width=390&editable=0`。需通过 HTTP 打开模块脚本。
