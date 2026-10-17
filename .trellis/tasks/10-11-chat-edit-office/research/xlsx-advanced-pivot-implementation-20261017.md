# XLSX 高级透视配置切片

日期：2026-10-17。主任务仍在进行；本片仅高级透视新建和原生读取/刷新。

## 依据与边界

- GenOffice固定`480548fd55f1be3593ee0d8e316a734751d58309`，`apps/sheets/src/renderer/PivotDialog.tsx:39–101,177–240`包含多值、有序维度、groupings/filters/pageFields草稿。沿当前原生add_pivot和refresh_pivot，不新增edit_pivot。
- 本次重新请求WeKnora官网及固定v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24`的`internal/agent/tools/definitions.go`均HTTP200；官网113529字节，源码13533字节，本机证据`/tmp/mimir-xlsx-pivot-weknora-home.html`及`/tmp/mimir-xlsx-pivot-weknora-definitions.go`。definitions.go:14–21知识读取/list/search、35–49沙箱文件能力说明权限边界；不含Office透视工具栏，UI主参考仍为GenOffice。
- 当前原生PivotDefinition不携带所有numFmt元数据，因此已有透视真实只读展示并刷新当前表全部透视，不能冒称可编辑已有复杂定义。报告筛选只保存字段/全部项；季度月份跨年合并，Excel刷新私有分组可能退回原始维度，界面明确说明。

## 实施边界

原先短表单仅单row/value；新控件以320px Inspector的字段/汇总/筛选分类提供有序维度、多values、日期/区间分组、label/value筛选与pageFields，单一固定footer，body内部滚动。helper只生成当前native DSL，真实源标题/值、2000格/列多值/孤立规则/数值校验在提交前完成。初次填入有效source自动读取标题并选首个数值列；失败不清草稿。

Editor透视专用接缝捕获已发布版本并传signal，接受前核版本/文档；面板关闭、切类型、文档或源快照使请求取消。同tick重复提交一次，自己的busy更新不取消自己，已接受结果的源更新不会反转成功事实。

首次实测发现分组首刷触发growth并被原任意extLst guard拒绝。root追加授权服务端最小识别：固定`xlsx-pivot-add.ts:912–918`完整唯一XML结构，JSON无额外键且fieldIndex唯一、规则与native定义完全一致才允许现有重建；未知XML/JSON/重复或命名空间扩展仍原子拒绝。没有改vendor/schema/全局保护。

## 代码验证

- Office三个专项文件14项通过：pure4、控件6、真实Editor4；后者验证一事务/版本、原生分组和双values、保存→undo保存→redo保存完整ZIP恢复，以及关闭/换文档/切对象类型的真实迟到宿主结果不落画布。
- Server新分组专项9项+原pivot3项12项通过：日期和区间首刷/新成员增长、filter/page/多values保留、两次保存和未触及entries，七类未知扩展失败原子性。
- Office和Server `pnpm typecheck`均exit0。目标lint/format/Antd/styles最终结果交接root；全仓既存技能lint阻断不计通过。
- root负责浏览器320px Inspector、420px与宽屏实际截图、HTTP原件保存/重开。此记录不把待做浏览器验收计为完成。无模型配置/桌面用户自验沿既定边界。
