# Pele 试用调研证据

调研日期：2026-10-20，Asia/Shanghai。以下是源码核对与基础运行结果，不能替代浏览器或真实文档验收。

## Pele

- 仓库：[obsidianmd/pele](https://github.com/obsidianmd/pele)，核查提交 `52b5c9cc8020fd157599eb601bcc930134332331`，npm 发布版本 1.7.0；LICENSE 为 MIT，附带缩放图标的 ISC 声明。
- [兼容性](https://github.com/obsidianmd/pele/blob/52b5c9cc8020fd157599eb601bcc930134332331/website/src/content/docs/compatibility.md)：声明覆盖 Mermaid 12.1.0 内置类型；自有布局与风格，Mermaid theme/themeVariables 颜色不适用，不支持任意 HTML 标签或外部插件。
- [API](https://github.com/obsidianmd/pele/blob/52b5c9cc8020fd157599eb601bcc930134332331/website/src/content/docs/api.md)：render 同步返回 SVG；pele/lazy 可按需加载；links:false / images:false 可禁用图表导航与图像。
- [安全](https://github.com/obsidianmd/pele/blob/52b5c9cc8020fd157599eb601bcc930134332331/website/src/content/docs/security.md)：默认 50,000 字符输入、4,000,000 字符输出、5,000 边；错误应作为文本展示；应用应自行控制选项与 SVG 净化。
- 从 npm 下载的 1.7.0 发布包在临时目录运行，无项目依赖安装：流程、中文长标签、时序、类、ER、状态、甘特、思维导图、饼图、frontmatter、init 指令、子图 12 项全部生成 SVG；无效输入和超限输入分别拒绝。完整 ESM 文件 678,922 字节，gzip 254,003 字节；不是 Mimir 最终构建体积或速度数据。
- 本轮安装 1.7.0 被 `minimumReleaseAge` 拒绝，未改动依赖文件。选择发布时间更早的 1.6.0 固定版本，执行前核查对应版本 API，重新完成样例测试；前序 1.7.0 结果不能当作 1.6.0 验收。1.7.0 发布说明包含中文/日文标签换行修复，需重点核对长中文。
- 对 Mimir 的应用：统一图表入口可优先调用 Pele 并保留 Mermaid 回退；SVG 图片隔离意味着宿主 CSS 变量无法直接继承，不能照搬 mount() 的主题/缩放示例。
- 实施后验证：锁定 1.6.0，使用发布包的 `pele/lazy` / `renderAsync`；12 类真实样例及 links:false 测试通过。真实 Tiptap 浏览器矩阵覆盖 120 组，两侧成功图表均可见，长中文窄屏缩小、配置配色不迁移等限制已记录在 `docs/visual-comparisons/2026-10-20-pele/acceptance.md`。1.7.0 评估数据未冒充实际接入版本结果。仓库最小发布时间为 1440 分钟，即 24 小时。

## WeKnora

- 核对[官网](https://weknora.weixin.qq.com/)，页面展示 v0.8.3；公开源码核查提交 `eecfe4b3c8c34c94e9b559e5dd02187b4ae447cd`。
- [frontend/package.json](https://github.com/Tencent/WeKnora/blob/eecfe4b3c8c34c94e9b559e5dd02187b4ae447cd/frontend/package.json) 版本字段 0.8.3，声明 Mermaid ^11.15.0。
- [mermaidShared.ts](https://github.com/Tencent/WeKnora/blob/eecfe4b3c8c34c94e9b559e5dd02187b4ae447cd/frontend/src/utils/mermaidShared.ts) 延迟加载 Mermaid，采用 strict 配置与浅深主题变量，提供统一 SVG 渲染。
- [mermaidStreaming.ts](https://github.com/Tencent/WeKnora/blob/eecfe4b3c8c34c94e9b559e5dd02187b4ae447cd/frontend/src/utils/mermaidStreaming.ts) 将流式未闭合图表置为占位并缓存已完成 SVG。
- 适用性：统一入口与流式缓存可供后续聊天图表参考；本轮只试用文档引擎，不借此扩展聊天范围。WeKnora 仍用 Mermaid，不能作为 Pele 迁移已成熟的证据；视觉主要参考当前 Mimir 与 Obsidian 的方向。
