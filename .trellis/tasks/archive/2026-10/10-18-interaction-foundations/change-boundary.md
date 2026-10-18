# v1 实施边界（2026-10-18）

授权：用户「没问题了，继续吧」，仅基础组件 v1。冻结原型不修改。

拟修改：KnowledgeBaseCreateModal.tsx 及新行为测试；settings/SettingControl.tsx、SettingControl.test.tsx 及局部独立样式；UploadPanel.tsx、UploadPanel.test.tsx；LoadError.tsx；document/DocumentHeader.tsx 及键盘测试（需先读最近规范）。危险确认优先知识库导航 FolderSection.tsx 局部提交保护。若检查证实 AntD 现有行为满足契约则保留，不另造共享控件。

场景映射：
- 字段/表单弹窗：修改创建知识库的 inline 校验、请求失败、pending 退出与焦点；保留当前细边主题及 13 个图标。
- 搜索选择：ProviderForm 预设为已加载静态数据；DocumentPanel 目录选项由父级查询持有。保留真实选项与 query 的加载/失败边界，不虚构异步搜索接口。
- 数字范围：保留 InputNumber、AvatarCropper Slider 原控件与显式保存；设置反馈随 SettingControl 修改。
- 按钮提示：保留 AntD 键盘语义、现有 icon aria-label 和 tooltip；仅修改本轮操作 busy 文案。
- 单复选/开关：修改即时开关失败回到持久值、就地重试；checkbox/radio 保留。
- 标签/分段：保留 CaptureDialog 和设置分区现有草稿/切换合同。
- 菜单：AccountRow/FolderRow 已有 Escape 和回焦；文档头部缺少显式路径则局部补齐，不重排菜单。
- 危险确认：保留知识库删除对象、文档保留真实影响及失败不关闭；补取消优先/请求中退出保护。
- 未保存：保留三选项/自动保存双分支/保存失败不离开，Office saveFromHere 能力不变。
- 保存/读取反馈：SettingControl inline 状态与可恢复失败；LoadError 不承诺未知的数据完好事实。
- 上传：修改真实逐文件状态和成功/失败计数，失败说明可读、后缀可见、全失败也可继续；无伪造重试/百分比。

不修改：tokens.ts、design.test.ts、已脏 spec、apps/web/DESIGN.md、Office、其他任务、原型。由主会话更新规范、实际浏览器验收及限定提交。

## 实际实施补充

主会话确认纳入 LibraryView 删除异常被吞导致提前关闭的缺陷。新增 `components/confirm-danger.tsx`（约 55 行，无新框架），供 LibraryView 文档/子文件夹和 FolderSection 知识库三个入口复用，保留每类真实后果文字。使用 AntD hook-modal promise mode，使请求失败保留弹窗同时不制造未处理拒绝；默认聚焦取消，pending 锁取消/Escape，原对象就地重试。

其他实现保持上述12场景边界。菜单只改 DocumentHeader，不变更页面菜单项和布局；设置不改业务键/接口，开关即时保存、文本/数字显式保存。Input 实际依赖 `@rc-component/input@1.3.1` 已排除 composing Enter；InputNumber `@rc-component/input-number@1.6.2` 未排除，Settings 共用 Enter 入口已补 nativeEvent.isComposing 守卫。

针对性行为验证共5文件20项：创建非法名称/组合态/重复提交/失败重试/退出保护；设置失败草稿、即时开关回滚重试、数字组合态；上传批次保护/失败计数/全失败继续/后缀；危险确认取消焦点/锁定/失败保留对象/重试完成；菜单 Escape/选择回焦。真实浏览器与全仓质量门由主会话完成，不在此预先宣称通过。

已查 AntD6.6.6 Modal/Input/Switch/Button/Alert/Dropdown/Upload/Typography API；改动组件 AntD CLI lint 无问题。限定格式/lint、renderer typecheck与最终测试结果另见 implementation-evidence.md。
