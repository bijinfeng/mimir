# PPTX 统一选择剪贴板独立复核

2026-10-17；checker `/root/pptx_global_selection_check`，整体任务继续 in_progress。

## 实际复核路径

- `PptxEditor` → `PptxClipboardControls` → strict `pptxManualAssetSchema` → `resolvePptxClipboardTargets` → `preparePptxClipboardElements` → 固定引擎 copy/paste/save → 新 durable refs 回选。
- 旧 elementIds 请求仍兼容；新 targets 显式标明直接父组合。每个对象完整解析，拒绝失效、别名重复、父子重叠和深层成员，不静默过滤。UI 明确部分成员以独立组合粘贴，保留父 xfrm/chOff/chExt/rot/flip。
- 剪切先准备全部快照再删原生切片，清空父组时删父组；清 timing/孤立资源并保留共享 media。连接附着、内部页面跳转、外链媒体及失效资源明确拒绝，普通外链 hyperlink 保留但不下载。
- 服务端保留不可伪造引用，浏览器不传 XML；15分钟、12项、64MiB。源文件失效时拒绝粘贴。

## Checker 所有回归与本地修复

- 新增 `PptxEditor.selection-clipboard.test.tsx` 19项真实挂载回归，仅替换文档/模型服务，不模拟引擎：混合顶层与组成员复制不dirty/不增版本；一次cut历史；save→undo/save→redo/save逐ZIP entry比较；paste保存历史、回选新refs后再批量编辑；15种copy/cut/paste与close/target/page/document/version组合的迟到真实宿主字节拒绝。
- 成功cut须先publish宿主引用再清选择，paste须先回选新refs再处理其他操作的slideIndex。这两个整合问题由root修复，新增spec记录顺序合同。
- 同一executor的真实动画样式与母版parts/edit回归各1项，确认旧调用无clipboard options或slide也可执行，保留动画timing和原始slide XML。
- 旧extended-tools的clipboard mock支持targets，同时pending按钮轮询按busy名称变化判断，保留原业务断言。旧clipboard与timing edit定向2/2（40跳过），不将其记作全文件通过。
- 真实挂载测试首次写入creationId后以matchesElementRef重新找目标，避免测试依赖旧临时runtime ID。

## 最终独立验证

- Office 3文件30/30：新Editor19，pure/component11；日志 `/tmp/mimir-pptx-clipboard-final-office.log`。
- Server 2文件11/11：selection-clipboard-host及manual-clipboard；无DB config，日志 `/tmp/mimir-pptx-clipboard-final-server.log`。
- Office、Server、Shared typecheck均exit0，日志 `/tmp/mimir-pptx-clipboard-final-{office,server,shared}-typecheck.log`。
- 本片10个TS/TSX文件Oxlint、11文件Oxfmt check、lint:styles、git diff --check均exit0；日志 `/tmp/mimir-pptx-clipboard-final-{lint,format,styles,diff}.log`。
- 以上轮次互有重叠，不累计成更多唯一测试。全仓pnpm check前轮实际仍被480项bundled Impeccable脚本lint阻断，不能宣称全仓通过。

## 边界

本片是窗口内引用剪贴板，不含系统剪贴板/外部应用格式。所选对象不携带动画，直接成员用父组包装，深层成员与上述引用结构明确拒绝。实际浏览器1280/420、下载/保存和焦点由root验收；本报告不冒报浏览器、Desktop或真实模型结果。参考固定GenOffice与WeKnora版本、HTTP与源码证据沿本片 `pptx-selection-clipboard-plan-20261017.md`，未引入额外研究结论。
