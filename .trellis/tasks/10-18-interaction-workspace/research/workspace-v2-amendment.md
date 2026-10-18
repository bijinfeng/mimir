# v2 修订：知识库统一编辑表单

2026-10-18。仅修订规划与HTML，未激活任务，未修改产品代码。

## 用户决定

> 去掉知识库的图标选择功能，编辑时也不仅仅是编辑名称，描述也需要支持编辑，创建和编辑可以复用同一个编辑弹窗

此要求取代v1创建仅回归、重命名仅名称、不改服务端的范围。Before仍如实展示现有图标选择和仅重命名；After移除图标选择，将菜单和标题改为编辑，并复用名称/可选描述表单。保留历史图标数据与列表显示，不做破坏性清理。

## 源码证据与实施影响

- `packages/renderer/src/lib/api.ts:864`：create接受description/icon；move只传from/to。
- `packages/shared/src/structure.ts:113`：create description最大2000字，move schema仅from/to。当前共享创建UI为500字，v2统一表单沿用；历史长描述需要无损兼容，不能靠maxLength悄悄裁切。
- `apps/server/src/routes/documents.ts:193–208`：foldersRoute POST传元数据，PATCH仅moveFolder。
- `apps/server/src/services/folders.ts:196–237`：创建写入description，move同路径直接返回0。仅修改描述必须新增更新分支。
- 文件夹移动服务按文件优先再同步索引执行；实现需协调名字/描述的结果与失败恢复，不能承诺跨文件系统/DB原子事务，不能在better-sqlite3同步事务里包异步工作。
- 名称未变但描述变必须提交；description省略保留、显式`''`清空；两项都未变才直接关闭。描述失败保留草稿；若改名部分已生效，恢复必须先重取权威路径，不能盲目重试旧from。
- 导航与LibraryView创建都应复用新共享表单。改名保留活跃子目录后缀，描述保存刷新知识库相关查询。

## 参考核查

本任务已检查[WeKnora官网](https://weknora.weixin.qq.com/)及[公开源码](https://github.com/Tencent/WeKnora)，固定v0.8.3、SHA `3e22822c1d2397be730c458c7539d0eb8c113a24`。`reference-recheck.json`记录官网、release与theme.css三项HTTP200及哈希；原始文件在父任务research。theme.css:195–210支持中性选中与细边方向；这些证据不定义Mimir的文件夹metadata PATCH或统一弹窗。此次字段范围以用户明确决定和本仓合同为准，不推断WeKnora具有相同行为。语雀仍是用户批准的主要视觉方向，Obsidian仅布局连续性参考；不涉及Office工具栏。

## 覆盖与版本

v1原始盘点144项保留在research/workspace-scenes.json；v2的prototype/coverage-v2.json增补共享表单及描述编辑，共19组150项。12切片、102个可选预览状态覆盖仅修改描述、清空描述、描述上限、同时改名与描述、统一表单、失败保留与重试。原型完全本地模拟，不能代替真实接口验收。v1的HTML和哈希清单保留在prototype/versions/。
