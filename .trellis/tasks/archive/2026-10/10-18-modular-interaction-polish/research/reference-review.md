# 本轮参考核查

采样日期2026-10-18（Asia/Shanghai）。本轮以已获用户认可的语雀适配视觉为约束，继承现行DESIGN.md，不重新选择视觉方向。语雀公开阅读页与上轮真实登录细边证据已核对；其私人工作台/编辑器未登录验证，不宣称精确复刻。Obsidian继续仅作工作区连续性与布局参考；Office各格式后续单独对照Office for the web / Google Docs /固定GenOffice版本，不能以WeKnora Markdown工具条替代。

## WeKnora 官网及公开源码（必查）

本轮重新获取官网 https://weknora.weixin.qq.com/ 、GitHub v0.8.3 release API（published_at=2026-10-14T07:53:24Z）及固定SHA `3e22822c1d2397be730c458c7539d0eb8c113a24` 的 frontend/src/assets/theme/theme.css。三个HTTP200，原始证据及URL见 reference-fetch.json、weknora-official.html、weknora-release.json、weknora-theme.css。版本被固定为v0.8.3，不以它冒充当前最新版本。

- theme.css:195–202：字段聚焦细绿边 / box-shadow:none，选择器排除错误、警告、成功；适用于Mimir已完成的字段角色及语义优先，作为本轮保留项，不拿旧粗边作当前对比。
- theme.css:204–210：选择表面安静、文字中性，小指示保留品牌色；适用于Mimir菜单与用途选中角色分离，不能全局把品牌语义背景改灰。
- theme.css:224–235：来源定位高亮分文字/背景/边界与深色角色；适用于后续AI引用模块，当前基础组件不改文档内容色。

本轮主要变化由Mimir源码中真实反馈路径和使用场景决定。WeKnora的知识库/Agent框架不是新业务范围，Markdown编辑器不是Office编辑工具的首要模型。

归档源码快照仅去掉行尾空白，保持内容与行号；网络原始响应的固定URL与版本见reference-fetch.json。
