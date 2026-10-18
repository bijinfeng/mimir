# 收集与导入参考核查

2026-10-18，延续已认可的语雀适配视觉；本模块主要沿Mimir已有收集/上传语义精修，不重新选风格。页面布局参考Obsidian的连续工作区与明确当前位置；本轮未访问其原生导入界面，不声称复刻。语雀已有实拍证据继承父任务与10-16-yuque-design-research，私人收集界面未登录验证。

## WeKnora官网与公开源码

官网 https://weknora.weixin.qq.com/ HTTP200；公开GitHub v0.8.3 release（2026-10-14T07:53:24Z），固定SHA `3e22822c1d2397be730c458c7539d0eb8c113a24`。本次重新获取官网、release、固定源码树及4个相关Vue文件，URL/状态在reference-fetch.json。固定版本不等于当前最新版。

- `weknora-KbUploadSourceDropdown.vue.txt:3–20,117–159`：文件/文件夹本机选择与URL独立入口；45–64为URL标签/提示。这说明明确入口与来源文案适用于Mimir，保留Mimir现有双页签，不引入更多采集渠道。
- `weknora-UploadConfirmDialog.vue.txt:37–49,80–114`：展示目标归属、来源名、相对目录与大小。Mimir可借用可扫读的目标路径和文件行层级；不引入WeKnora解析配置、标签选择、异步队列或更多确认步骤。
- `weknora-UploadTaskRow.vue.txt`：以文件状态/失败原因组织单项反馈；`weknora-UploadTasksPanel.vue.txt`按运行/失败等汇总任务。行号：UploadTaskRow 23–51,67–81,107–114；UploadTasksPanel 36–38,132–149,283–293。本轮仅借用行级状态与摘要层级，不迁移其后台任务中心、取消、重新解析或重试语义。Mimir当前为串行请求，没有实时字节进度、可恢复后台上传或幂等重试承诺。

WeKnora是知识库/收集领域的语义参考，不能覆盖用户已认可的语雀视觉，也不作为任何Office工具栏模型。当前列来源于Mimir代码与verification中的实际截图；拟改进列是待认可方案。第三方源码证据保留内容及行号，仅去行末空白（reference-fetch.json有记录）；只作证据，不执行。
