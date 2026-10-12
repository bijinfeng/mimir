# AI 能力设置的竞品调研

调研于 2026-10-12。问题：DOCX 对话编辑新增了独立的“DOCX AI”设置分区和 `docx.*` 凭据。用户要求设置按通用能力组织，由 DOCX Agent 按需使用，并指定 WeKnora 为本次及后续调研的优先参考对象。本记录依据公开网站和固定版本源码；没有将营销页描述当作具体设置行为的证据。

## 证据

| 产品 | 通用能力在哪里配置 | 使用场景如何取用 | 来源 |
|---|---|---|---|
| **WeKnora**（首要参考） | 设置按模型运行、数据与扩展等分组；“模型管理”和“网络搜索”是独立的通用入口。网络搜索支持服务提供方列表、默认项、连接测试。模型列表按类型展示，聊天模型标识视觉能力。 | Agent 编辑器只配置是否启用网络搜索、可选服务提供方与结果数。未指定服务时使用空间默认项。凭据留在通用“网络搜索”，不在每个 Agent 里重复填写。 | [产品网站](https://weknora.weixin.qq.com/)；固定源码 `Tencent/WeKnora@00474f734d6c7c0911d7485465d7c7286d0047cb`：[设置导航](https://github.com/Tencent/WeKnora/blob/00474f734d6c7c0911d7485465d7c7286d0047cb/frontend/src/views/settings/Settings.vue#L350-L429)、[网络搜索](https://github.com/Tencent/WeKnora/blob/00474f734d6c7c0911d7485465d7c7286d0047cb/frontend/src/views/settings/WebSearchSettings.vue#L1-L85)、[默认项和测试](https://github.com/Tencent/WeKnora/blob/00474f734d6c7c0911d7485465d7c7286d0047cb/frontend/src/views/settings/WebSearchSettings.vue#L285-L306)、[Agent 取用](https://github.com/Tencent/WeKnora/blob/00474f734d6c7c0911d7485465d7c7286d0047cb/frontend/src/views/agent/AgentEditorModal.vue#L1560-L1608)、[默认回退](https://github.com/Tencent/WeKnora/blob/00474f734d6c7c0911d7485465d7c7286d0047cb/frontend/src/utils/agentWebSearch.ts#L1-L37)、[模型卡片](https://github.com/Tencent/WeKnora/blob/00474f734d6c7c0911d7485465d7c7286d0047cb/frontend/src/views/settings/ModelSettings.vue#L1-L152)。 |
| **GenOffice**（DOCX 工具来源） | 应用外壳设置只有“AI 模型”“AI 媒体”等能力分区，没有按 DOCX/XLSX 分开的密钥页。“AI 媒体”包含网页搜索、图像与分析服务选择和测试。 | DOCX 工具通过桌面服务调用搜索、媒体分析和图片生成，服务使用应用级 AI 配置；搜索提供方缺少有效配置时回退到内置选项。 | 固定源码 `genspark-ai/genoffice@480548fd55f1be3593ee0d8e316a734751d58309`：[设置分区](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/shell/src/renderer/src/SettingsModal.tsx#L142-L150)、[媒体与搜索](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/shell/src/renderer/src/SettingsModal.tsx#L1055-L1096)、[DOCX 工具调用](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/docs/src/renderer/ai/tools.ts#L870-L969)、[搜索提供方](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/packages/ai-provider/src/search-settings.ts#L1-L49)。 |

WeKnora 官网当前可访问，首页标示 v0.8.2，并说明 Agent 可搜索网页和调用工具。具体设置行为以上述公开源码为证据；本次未登录它的在线实例，也未验证连接测试对真实提供方的效果。

## Mimir 当前落差

- `packages/renderer/src/routes/_app.settings.tsx` 新增顶层 `docx-ai`；`DocxAiSection.tsx` 把聊天模型、Brave、图片生成和媒体分析归到 DOCX 名下。聊天模型又跳转到通用“模型”，用户需理解同一能力为何有两处入口。
- `plugins/provider/src/index.ts` 把通用可复用服务命名为 `docx.brave.*`、`docx.image.*`、`docx.media.*`。服务端各适配器直接读这些键。这让后续其他 Agent 使用同一服务时面临重复配置或继续依赖 DOCX 命名。
- Mimir 现有“检索”页管理本地知识库索引和搜索自检；网页搜索的服务提供方与本地检索不是同一概念。直接把 Brave 凭据塞进“检索”会混淆两个能力。
- DOCX 侧栏的可用能力状态是合适的使用现场反馈；它应指向相应通用设置，而非要求用户进入专用设置页。

## 建议的产品结构

1. 移除顶层“DOCX AI”分区。已有“模型”继续管理聊天模型，并扩充为通用的图片生成、视觉输入和音频转录能力配置。模型/服务提供方的连接、密钥与能力状态由同一处管理；视觉能力应尽量由模型元数据或连接测试识别，不保留仅供 DOCX 使用的布尔确认项。
2. 新增通用“网络搜索”分区，先管理现有 Brave 文本与图片搜索凭据、可用性与测试连接。将来增加其他搜索服务时再提供默认提供方选择；DOCX Agent 默认使用可用的通用服务。
3. DOCX 侧栏继续显示“当前文档可使用哪些工具、缺少什么”，并分别链接到“模型”或“网络搜索”。这属于场景状态，不是第二套配置。
4. 实施时迁移已保存的 `docx.*` 值到通用键或通用提供方记录，尤其要保留加密密钥；服务端读取与 UI 改为单一来源。迁移后旧键只用于兼容读取/一次性迁移，避免两个可编辑真相源。

此处是调研建议，尚未修改产品代码或确定最终字段合同。下一步应先确认用户认可上述信息架构，再修订本任务的 R7 / 技术设计，实施迁移并复测现有 DOCX 工具与通用设置。
