# PPTX 统一多选内部剪贴板实施记录（2026-10-17）

依据已固定来源的 `pptx-selection-clipboard-plan-20261017.md` 实施，未重新扩展竞品研究。GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 提供原生复制/粘贴语义；WeKnora v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24` 的具体HTTP证据和权限适用边界沿方案记录，本片不把它用作Office工具栏依据。

## 已实现

- shared copy/cut兼容旧elementIds，新增恰选一项的显式targets，1–100目标；纯选择适配严格拒绝失效/错误父/重复别名/父子重叠/深层目标，整组不展开。
- 私有宿主先准备全部快照再cut；直接成员按父包装，保留rot/flip/chOff/chExt。子成员自身没有XML anchor，删除身份和timing必须从父groupChildSlices取真实片段；不能从空child.anchor推断无动画或无引用。
- 带连接附着、未选连接线入向附着、页跳转、外链媒体、失效资源整体拒绝。普通外链超链接只保留关系。对象采用目标主题且不带动画；剪切清理timing/孤立资源，保留共享media。粘贴返回新顶层持久elementRefs。
- 控件显示所选数/顶层粘贴数/成员组合说明，复制和剪切有可见短标签；内容内部滚动、底部粘贴动作固定。同步pending避免同tick重复；Antd Select显式禁用；上下文变化/卸载abort，失败保留有效旧clip，迟到copy不覆盖新clip。root先publish已接受cut ref后再发布新版。
- `PptxEditor.tsx`由root单独整合；mounted全局历史/保存/选区测试由独立checker负责，本实现者不改这两者。

## 验证

- `packages/office`：pure clipboard 3条、ClipboardControls 8条通过；包括整组/成员、原始别名、严格schema、实际数量、可见按钮、固定footer、重复点击、Select锁定、失败重试、四类上下文失效、卸载和已接受cut发布。
- `apps/server`：原manual-clipboard 5条通过；新selection-clipboard专项覆盖混合顶层与两父组合、旋转/翻转/非等比坐标包装、共享图片、子动画清理、空父移除、耐久新refs、两次保存、整批拒绝/取消/源文件删除、连接/资源限制与64MiB上限。最终测试数以执行报告为准。
- Office/Server/Shared `tsc --noEmit`、目标oxlint、oxfmt、Antd lint、style模板检查和git diff空白检查通过。未声称全仓质量门通过（root已知全仓技能lint有既有失败）。

## 保留边界

浏览器1280/420目视、真实下载和保存/撤销/重做由root收口；用户自行验Desktop。当前无模型配置，不冒称真实模型编辑。系统剪贴板/外部图片/PNG副本/快捷键仲裁/连续粘贴累进偏移仍属后续切片，当前为本窗口server ref内部剪贴板。
