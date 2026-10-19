# 收集与导入 · 产品实施交接

2026-10-18；implementer只改授权Renderer范围及本文，不提交，不改冻结原型/全局主题/其他会话WIP。批准来源capture-review-v1 revision2，HTML SHA256 `fa66bdc5e0ed6a4c7d1383342b7e554754b9f88ce69db162a56fc947b93061e1`。

## 9组实施落点

| 组 | 实现/保留 | 验证依据 |
|---|---|---|
| entry | 保持导航/命令/目录菜单/空库的原入口和参数。AppShell同步opened及batch refs先阻挡二次打开，nonce按次递增；不重挂载进行中的批次。 | -app-shell.test：同帧重复open、已有inline批次阻挡、释放后打开；原有入口测试保留 |
| url | 完整http(s)和trim后2000字符校验，再使用shared detectSource（含原有子串分类）。34px/14/22字段、关联错误/来源、独立44px窄屏清除；同步single-flight及IME/229防护。 | CaptureDialog.test：非法/超长/来源/组合输入/重复Enter点击/清除。repeat补充由独立checker持有 |
| stage | 单次JSON等待，不画实时四阶段；只按返回stage/status绘制，缺失阶段“未返回状态”。保存260ms交接锁与卸载timer清理；不确定结果先核对库。 | CaptureDialog.test：pending无伪阶段、extract失败无前序勾、真实partial status、null ID、260ms与卸载、网络结果不确定 |
| upload | 多选即开始、按序单文件API、>50MiB本地挡住而0字节仍交Server。结果行17px图标列/名称与后缀/格式/大小/结果分层；54px min紧凑新批入口，整批后只首个成功可打开。原件0字成功；响应note空正文单独文案；失败可继续。 | UploadPanel.test共5项：同步批次锁、部分/全失败恢复、目录和原件/空笔记、边界与串行、inline不确定反馈。Query刷新由父组件完成 |
| directory | 保留所选目录首段+子路径，完整路径details；不递归遍历整页drop目录、不建立空目录、不设accept格式白名单。 | 上传目录路径API参数与details测试；原生选择/权限另验 |
| drop | LibraryView内联“文件导入”复用UploadPanel；无首个打开按钮。drop handler同步claim全局批次，空FileList/非Files/非目录不发请求，完成刷新documents/folders/counts。 | LibraryView.drop.test共3项：同帧drop只一批、逐项反馈/刷新、非Files/空/标签范围不请求 |
| result | Capture成功交接使用现有runGuarded；守卫出现时Capture层open=false且内容保持挂载，取消重开回结果动作，已成功结果不重新上传。专用guard为480px、真实当前缓存标题与保留结果说明、保存中/失败反馈；不能代存时只返回编辑器。 | -app-shell.test保留结果/保存失败/取消/确认导航、全局锁；新增Office不能代存和取消关闭后普通guard不污染。浏览器回焦由主会话实测 |
| lifecycle | busy锁tab/关闭/新选择；settling锁到自动交接、卸载不触发迟到导航。普通关闭由宿主真实入口回焦；成功不回焦旧入口。取消guard清captureHandoff，关闭亦清，captureContext仅弹窗打开期间启用。 | CaptureDialog timers/suspension回归、AppShell关闭后普通导航回归；真实Esc/遮罩/焦点主会话验收 |
| layout | 540px/6px/padding20×24与独立目标行；主体内部滚动、稳定footer；窄屏44px触点及结果动作全宽；长名称/后缀/路径折行、长错误details。局部命名palette/type固定批准稿，未改全局theme。 | 主会话已反馈并修复按钮自动插空、disabled palette、label行高、primary阴影/实色边框、窄屏动作全宽；真实截图/hover几何保存在主会话单独报告 |

91项是产品覆盖矩阵，不等于91个已实际GUI执行的测试。此实现没有改后端/API/存储顺序，没有后台队列、取消/续传/重试、伪进度、文件去重或目标选择器。

## 文件

- CaptureDialog.tsx：负责Modal/页签/焦点/交接与URL交互；请求拆至capture/use-capture-request.ts。
- UploadPanel.tsx及capture/UploadResultRow.tsx：串行批次、状态及逐项信息；父层完成刷新/全局锁。
- capture/{capture-tokens,styles,upload-styles,helpers}.ts 与 {Notice,CaptureStages}.tsx：冻结视觉角色/状态/校验/路径。
- LibraryView.tsx：整页drop内联结果。
- routes/_app.tsx、lib/app-shell-context.ts：同步宿主批次、入口与guard交接。
- UnsavedGuard.tsx、lib/unsaved.tsx：可选capture变体、canSave事实。其他guard默认语义保持。
- CaptureDialog.test.tsx、UploadPanel.test.tsx、library/LibraryView.drop.test.tsx、routes/-app-shell.test.tsx：必要竞态/恢复回归。

## 检查（implementer）

全部使用已有direct binaries，没有pnpm exec/install/sync。

- 定向Capture/Upload/AppShell/drop四文件：24项通过（后增加Office回归）。
- Renderer从包目录 `node_modules/.bin/vitest run`：59文件/508项通过（16:26:31；在最后guard变体补齐前）。此前错误地从仓库根运行，6个cwd相关ENOENT已用正确工作目录重跑消除。
- 最后guard/capture定向：2文件17项通过（含新增Office/普通guard不污染回归）。
- 授权文件oxlint：0错误/0警告；最近小块再次lint也0。
- 18个授权文件oxfmt check通过；最后guard块均已重新format。
- AntD CLI CaptureDialog/UploadPanel/UnsavedGuard三文件：0问题（最终guard变体补齐前；checker需复验最后状态）。
- tsc最终交接：发现我方UnsavedGuard.tsx:140的shared styles.small在拆分后不存在，已明确交给checker修；另有外部既存agent-media.check.test.ts:12 Promise.withResolvers当前lib不支持。未改外部测试/tsconfig。最终类型结果以checker修后为准。
- 限定git diff --check通过。全仓门由主会话负责，不声称已全仓通过。

## 交接及边界

16:31左右正式停止产品/测试编辑，所有源码交给capture_product_check。checker持有Enter repeat过滤、上述guardHint类型修复及其余独立发现；本文不代替最终检查报告。

真实系统filepicker/目录支持、OS输入法候选、触屏/读屏/Electron、真实抓取/导入/保存未由implementer操作。组件合成事件只证明状态分支。主会话实际浏览器证据与模拟响应/真实落库的界线另记。

批准稿placeholder“正在编辑的项目笔记”由实际缓存标题替代，缺缓存用“当前文档”；自动URL交接被guard取消后提供明确重新打开已保存结果动作，避免重新抓取；成功toast不再承诺canonical旧记录已被移动到当前目录。暂未声称全部状态逐像素匹配，差异由主会话同状态截图与计算样式验收。
