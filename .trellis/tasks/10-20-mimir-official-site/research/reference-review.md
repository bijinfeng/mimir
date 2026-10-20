# 官网参考核查

检查日期：2026-10-20。原始响应及 SHA-256 见 evidence.json。

- WeKnora 官网 HTTP 200，页面标示 v0.8.3；release API 发布时间 2026-10-14；tag API 确认 commit `3e22822c1d2397be730c458c7539d0eb8c113a24`。当前抓取官网不声称与 tag 同构建。
- 官网原文包括“回答有据可查”“从回答，回到原文”，用可核对的引用说明 RAG 价值；适用于 Mimir 的知识问答证明。企业权限、自动 Wiki、图谱、集成、Agent 自动执行不能迁入 Mimir 承诺。
- 固定源码 README 原始请求超时，GitHub contents API 补充请求返回 403 rate limit exceeded，未伪造读取成功；tag API 已核对版本与 SHA。仓库已有 v0.8.3 源码核查记录可追溯至已归档的 10-16-yuque-design-research；官网实现前补充实际源码正文，或明确沿用该固定版本证据。
- Obsidian 官网为 2026-10-20 在线快照（未公开对应构建版本），以“Sharpen your thinking”和真实笔记工作区起头，再解释私有、开放格式与数据归属。作为页面布局与个人知识视觉表达参考，继承 Mimir 自己的白灰绿身份；不照搬其插件、Sync、Publish 等能力。
- 官网不设计 Office 工具栏；文件编辑能力文案仅按 Mimir 已实现范围表述。

## Composition candidates

在既有视觉身份中提出七种结构：1 完整真实工作区；2 完整工作台的大画布；3 收集内容的资料入口；4 问题带路并核对原文；5 数据掌控与部署说明；6 收集/提问/核对的来回；7 一篇笔记的连续故事。seed `6119dc63` 按 4/2/6 展示，名称分别为问题带路 / 完整工作台 / 知识的来回。外部风格挑战未用于替换既有品牌。代码草图为构图讨论，后续必须换成真实品牌标识与验证过的产品组件。

## 固定源码补充核查

本次读取仓库已留存的 `.trellis/tasks/archive/2026-10/10-16-yuque-design-research/research/weknora-source-index.json` 与 `weknora-theme.css`；source-index 指明 SHA `3e22822c1d2397be730c458c7539d0eb8c113a24`。CSS 第 195–210 行在真实输入聚焦时保留品牌细边、移除阴影，并分离中性选择面和品牌焦点角色。适用：官网与真实产品演示保持同一套安静中性与明确焦点；不据此宣称官网架构、模型能力或 Office 编辑器相同。远端 README 超时/API 403 的限制仍保留记录。

## 已选方案

方案页 `.impeccable/questions/3a7b9f59.answer.json` 返回 question、code、buildPathFlipped=false；用户随后发出“继续”。采用“问题带路”，seed 6119dc63，已记录选择。最终规划审阅仍为实施前独立门禁。
