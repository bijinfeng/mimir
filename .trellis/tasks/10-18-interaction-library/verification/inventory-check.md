# 独立源码盘点复核

2026-10-18，planning-only；仅复核任务材料，未改产品代码、未启动实施。

## 方法与范围

通读 `LibraryView.tsx` 全部浏览/表单/卡片/菜单分支，交叉核对 `LibraryView.style.ts`、`list-helpers.ts`、`DocumentBadges.tsx`、`FolderSection.tsx`、`DocumentCommandModal.tsx`、`DocumentPanel.tsx`、`document/doc-menu.tsx`、`confirm-danger.tsx`、`lib/api.ts`、共享 documents/structure 合同与服务端 folders/documents 实现。阅读现有 LibraryView、drop、FolderSection 与文档命令测试；未重跑产品测试（本轮仅出稿，不修改产品）。

## 已核实

- 50 个当前项和 8 个提案项 ID 唯一。涵盖首次引导、all 重定向、身份/复制、列表/卡片、目录面包屑、标签、创建/重命名/删除、文件替换/下载、拖入和模块 2–4 交接。未发现尚未分配的自有 LibraryView 交互分支。
- 当前目录查询包含后代文档；固定 limit 100、updatedAt 降序，仅返回 items，无 total/分页 UI。目录行显示子树 count，与当前返回的文档条数不能混称同一总数。
- 当前列表文档为整体打开按钮，没有文档更多操作；卡片菜单按类型提供打开、条件编辑、文件下载/替换、删除，无浏览页移动/重命名。新增列表入口及任何浏览页命令须明示提案。
- 当前可编辑卡片类型仅笔记及 parseTargetFor 判断的 docx/xlsx/pptx；HTML/PDF 不因此新增编辑菜单。卡片打开与编辑均走同一个 openDocument 交接。
- 当前新建/重命名目录的请求错误以 toast 呈现并保留草稿；无同步单飞与 IME 保护、等待未锁关闭。创建斜杠名的按钮有 toast，Enter 不提交；提案不可把完善的字段错误/锁定画成当前已有。
- 目录删除实际清空 folder=null，不保留当前知识库根归属；文档保留但不再属于当前知识库筛选。笔记文件尝试回收、文件原件尝试删除，API 没有一键恢复。网页等非 file 的现行确认/成功文字不一致，已作为提案纠正文案。
- 替换原件是原生 input 选择后直接 PUT；当前无可见单飞/重试文件保留，成功忽略 charCount/parseError。原生取消无自定义回调；HTML 不应假冒 OS 界面。
- 只有 ready/failed 两种持久化文档状态；不存在 WeKnora 的 queued/processing/stalled 状态。ready 卡片为 quiet 文字，failed 保留徽标。列表仅失败时显示状态列，窄容器迁移失败徽标、隐藏详情/时间。
- 缓存列表刷新失败会覆盖当前内容；scope 切换保留上一查询结果。根库失效仅在至少有其他库时识别，失效子目录及零库旧 scope 是当前缺口。
- 标签 URL 可达，未发现站内标签导航及 api.tags.list 消费；无添加/新建/拖入目标，空态却提示上传属真实缺口。
- 模块 2 的库名称/描述编辑与稳定 code 对账、模块 3 note-only 重命名/文档移动/仅重读恢复、模块 4 上传/收集/同帧批次锁归属清楚。本模块不重写这些合同。
- 外部参考固定 WeKnora main commit 与 release 分别标识，官方首页响应/源码存档和 Obsidian 固定文档版本齐全；不把外部源码研究声称运行时可访问性验收。

## 修正

1. `research/library-inventory.md`、`research/library-scenes.json` 的 LIB-045 把现有移动控件写成 TreeSelect；源码 `DocumentCommandModal.tsx` 实际为 AntD Select 配合 flattenFolders 扁平路径选项。已同步修正。
2. 同两份材料 LIB-032 澄清 quiet 仅作用于 ready；failed 仍是徽标，避免当前列把失败画成普通文字。

## 原型待查条件

本记录只验证源事实与覆盖框架，不等于每项状态已被 HTML 实现。原型落盘后需独立检查每个状态的有效导航、真实 current fidelity、同数据/同尺寸、待机/失败/取消/成功的操作路径与浅深/窄屏/低高度边界。原生文件选择/下载完成、剪贴板成功、屏幕阅读器及 Electron 不由 HTML 模拟证明。

当前无须新增产品规范：尚未改变现行合同；拟改行为保留于规划稿，待用户批准。
