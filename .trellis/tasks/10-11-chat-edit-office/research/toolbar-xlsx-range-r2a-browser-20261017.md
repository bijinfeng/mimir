# XLSX R2a 实际浏览器验收 — 2026-10-17

范围仅 R2a 原生合并、超链接、公式、富文本范围复制/移动；不代替 R2b 条件格式/验证迁移或 R3 选择性粘贴。使用已有最新 production preview `localhost:5180`、统一测试账号，所有操作通过 CUA 可见 UI；没有调用隐藏 editor handle。

## 文档与构建

- 文件：`mimir-xlsx-range-structures-20261017`，ID `yrnzwOGIwuPxHSAK`，验收库文件夹 KY635Y。
- 构建日志 `/tmp/mimir-toolbar-inspector-encryption-web-20261017.log` exit 0。551 构建输入 before/after 未变。R2b 本次验收时尚未接线。
- 上传后实际下载基线 `/tmp/mimir-xlsx-range-browser-baseline-20261017.xlsx`，SHA256 `ea5e043464994801199306d908c32ddf4bdd64f7b850db44ef7d86ce2b6c3cd5`。源生成测试可能重写 ZIP timestamp，故使用此固定浏览器基线。

## 跨表复制

实际 UI：数据!A1:C3 → 剪贴板“复制” → 工作表“目标” → 范围 E5 → “粘贴工作簿内范围” → 保存到库 → 下载原件。

- 源工作表切换后复制缓冲仍在；复制准备不增加 dirty/history。
- 原生 XML：E5:F5 合并；E6 外链及 tooltip 保留，F6 内部 `'目标'!$A$1`；G6 公式 `E6&F6`；G7 两个富文本 runs 与粗体保留。
- 目标已有 rId1 仍指向 keep 外链，源外链新分配 rId2；J10 不受覆盖。原生 query ampersand 仅 XML 转义一次。
- 保存原件 `/tmp/mimir-xlsx-range-browser-copy-20261017.xlsx`，SHA256 `afa162caef8654f3643c6d12ad9d9378509507a654dfaa369668e9e980381d5e`。
- Undo → 保存 → 下载 `copy-undo`：与 baseline **整文件逐字节一致**。
- Redo → 保存 → 下载 `copy-redo`：与 copy **整文件逐字节一致**。
- 实际 reload → 切到目标表，行 5/6/7 仍显示复制内容，保存 disabled、历史重新初始化。

## 同表重叠剪切与短窗口

实际 UI：数据!A1:C3 → “剪切” → 范围 B2 → 在 **420×500** 点击固定底部“粘贴工作簿内范围” → 保存 → 下载。

- 原生 B2:C2 合并，B3 外部链接、C3 内部位置、D3 `B3&C3`、D4 富文本；原 A1:C3 内容移走，J10 保留。
- 目标表 XML 与跨表 copy 结果完全相同。
- `move-undo` 与 copy 整文件逐字节一致；`move-redo` 与 move 整文件逐字节一致。
- reload 后数据表显示行 2/3/4 移动结果，历史清空，无未保存状态。
- 当前测试文件保留 move-redo 状态；未删除测试文件。

所有固定文件在 `/tmp/mimir-xlsx-range-browser-{move,move-undo,move-redo}-20261017.xlsx`，对应原下载文件编号 4/5/6。

## 样式与交互

420×500：侧栏 x100/y178/w320/h295.36；body clientHeight198/scrollHeight569；footer y424.36/h49，页面 scrollWidth420。截图标题无遮挡、源/目标可读、主操作固定可见；工具栏分组收进菜单。

- 窄窗口截图：`/Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51/xlsx-range-clipboard-420-20261017.png`。
- 1280×800 重开后截图：同目录 `xlsx-range-clipboard-1280-20261017.png`。

参考沿已核固定 GenOffice commit `480548fd55f1be3593ee0d8e316a734751d58309`；WeKnora v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24` 仅作 KB/Agent 边界参考，不用于 Office 工具栏。此次没有重新联网研究，也没有真实 provider/Agent 或 Desktop 验收声明。
