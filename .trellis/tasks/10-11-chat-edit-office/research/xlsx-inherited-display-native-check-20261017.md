# XLSX 继承样式预览与原生范围写回独立检查

2026-10-17；复核 `xlsx-inherited-preview-plan-20261017.md` 冻结实现。范围为 `xlsx.ts`、`xlsx-range-styles.ts`、`xlsx-agent-range.ts` 的共用 `replaceCells` 与对应测试；未改 clipboard、DOCX、PPTX、shared 或 vendor。

## 依据与复核

- 固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`，实读 `apps/sheets/src/renderer/univer-sync.ts:1176` 的 `createColumnData` 与 `:4055` 的 `inheritedWrapLookup`：按文件顺序合并列段，最后有 style 的覆盖段生效，width-only 段不清除已有 style。当前预览和服务端 resolver 一致。
- WeKnora 官网与公开源沿本任务已保存的 v0.8.3、`3e22822c1d2397be730c458c7539d0eb8c113a24` 证据；其能力诚实原则适用，没有用于此处 XLSX 样式与 XML 写回的实现依据。Office 行为依据固定 GenOffice 和真实 OOXML 回归。
- 显式 `c.s`（包括0）优先于 `customFormat=1/true` 的 `row.s`，再到列默认 style，最后0。`customFormat=0/false/省略` 不激活行默认 style；样式是完整 cellXfs 索引，不合并目标样式。
- 预览覆盖单元格、前置空洞、等宽补格、稀疏真实行号、样式专属空行、空表 A1、drawing/sparkline 补格；日期格式沿1900/1904系统消费继承 numFmt，保留 rawText、公式和缓存。整列 style 声明不扩成16384列，既有对象预算不变。
- `replaceCells` 和 resolver 都按有效 row.r，否则 previous+1 识别行；触碰隐式行稳定补显式 r，目标格唯一、move源格真实移除、新行插入单引号 row20 之前。未触碰 row20 原 XML、行扩展与未触碰ZIP部件均由现有真实 native 回归检查。

## 独立发现与局部修复

`replaceCells` 原先仅用双引号且自闭合的 dimension 正则。对合法 `<dimension ref='A1:Z40'/>` 或 paired `<dimension ref='A1:Z40'></dimension>`，复制会新增第二个 dimension，原范围也未参与计算。

新增两条真实 host copy + JSZip/XML DOM 回归，修前均失败：预期一个 dimension，实际两个。局部修复识别两种 XML 闭合形式、使用已有 `xlsxAttribute` 读取单双引号 ref，再替换原节点。修后保留一个 dimension、旧 Z40 范围、唯一目标 D8 及未目标 row20 原 XML。

本次独立修复仅改 `apps/server/src/services/xlsx-agent-range.ts` dimension块及 `apps/server/src/test/xlsx-range-styles.test.ts` 两条回归。未调整其他范围 writer、参数或能力声明。

## 最终检查

- Office：`pnpm --filter @mimir/office exec vitest run src/xlsx-inherited-styles.test.ts src/xlsx.test.ts src/xlsx-edit.test.ts`，3文件 **61/61**。
- Server：`pnpm --filter @mimir/server exec vitest run src/test/xlsx-range-styles.test.ts src/test/xlsx-agent-range.test.ts src/test/xlsx-manual-ops.test.ts src/test/xlsx-agent-host.test.ts src/test/xlsx-fill-host.test.ts --maxWorkers=1`，5文件 **96/96**（冻结94 + 本次2）。
- `pnpm --filter @mimir/office typecheck`、`pnpm --filter @mimir/server typecheck` exit0。
- 上述5个生产/测试TS文件 `oxlint`、`oxfmt --check` exit0；`pnpm lint:styles` 和目标 `git diff --check` exit0。
- 未运行 fullOffice/full repo gate 或 build，未进行本片浏览器验收；由主会话统一构建、浏览器与保存下载验证。未暂存、提交、上传、删除或归档。

## 明确边界

单双引号覆盖本片 row/style/column 属性、预览 cell属性与本次 dimension；服务端既有 `cellMap` 仍要求显式双引号 `c.r`，不支持的单元格地址形式会明确拒绝，不能据此报告所有单引号原生写入已支持。普通 vendor `set_cell` 不新增隐式行写回承诺。条件格式、表格、合并等原生拒绝边界及解析预算保持现有合同。

本片目标检查通过，无未修复的范围内问题；真实浏览器证据与全局规范/矩阵同步交由主会话。
