# XLSX 继承样式预览补齐

2026-10-17；接 `xlsx-range-inherited-styles-20261017.md`。最小缺口是浏览器 `xlsx.ts` 只看显式 cell.s，而原生复制已物化行/列默认样式，导致源画布与粘贴后实际样式不一致。

## 依据与范围

固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`：`apps/sheets/native/xlsx-engine/src/types.rs:195/222` 明确 cell > customFormat row > column；`worksheet.rs:1167` 只接受 row.customFormat=1/true。`apps/sheets/src/renderer/univer-sync.ts:1176` 的 createColumnData 逐 span 合并，后续 width-only 不删除此前样式；`:4055` inheritedWrapLookup 明确最后一个有样式的覆盖 span 生效。显式零按 Mimir 当前完整 cellXfs 引用合同保留，不视为缺失。

WeKnora 官网/公开源 v0.8.3、`3e22822c1d2397be730c458c7539d0eb8c113a24` 沿前述已记录证据；sandbox 能力诚实适用，不定义 XLSX 原生继承，不作为 Office 编辑主参考。另已读取 Microsoft Open XML SDK 3.0.1 Column 文档（缓存 `/tmp/mimir-xlsx-column-ooxml-doc-20261017.html`），其 style 描述是默认列样式，没有从该页面推导未定义的重叠优先级。

本片独占 `packages/office/src/xlsx.ts`、新增其专项真实解析/编辑会话测试；沿现有 format 解析和 date1904 显示，无 XML 写回、不扩展已有网格/ZIP预算。显式格、行内空洞、等宽补格、对象/迷你图补格均按同一继承索引读取，保留稀疏真实行号及单双引号属性。

根会话确认授权修正 `apps/server/src/services/xlsx-range-styles.ts` 与对应 native 专项 tests 中原先 first-match 列段逻辑，与固定上游的 last-styled-span 规则一致；不触碰其余 writer、clipboard/core/Editor、vendor 或已有拒绝边界。现有 server 82/82 是修前基线。

验证以真实 readXlsx/openXlsxForEdit、独立 ZIP/XML 原件读回及 no-op save 部件保真、原生 copy/move/格式刷为主，再跑目标 suite、Office/Server types 与目标静态；不并发 fullOffice/Web build。修后由独立 checker 复核，根会话统一浏览器验收。

## 实现与验证

- `xlsx.ts` 一次读取行样式和列 span；列索引只对实际物化的列求值并缓存，不展开 `max=16384`。实际 c、c 前空洞、等宽补齐、空表 A1、drawing/sparkline 所补行格都读取同一 cellXfs，直接进入现有 `readXlsxFormats`/`formatXlsxNumber`。保持原始 rawText、公式/缓存和日期系统；row `s=0`/cell `s=0` 都是明确优先级。样式专属空行保留并至少物化 A 列，不把稀疏真实行号压成数组位置。行/列/单元格属性支持单双引号，未重写原件。
- server resolver 同步 last-styled-span 和 implicit row（按前行加一）。原生 8 条 overlap 用例覆盖同/跨表 copy/move/fill/格式刷，独立 DOM 核对每格 s，并比对复制前真实浏览器解析模型与目标格式。
- 独立发现并由根会话追加授权：共用 `replaceCells` 只读显式 row.r，向省略 r 的已有行写入会留下旧 D8/F8 并追加重复格。**4 条 native 回归先真实失败，均有两个 D8**。修为按 previous+1 识别，触碰的隐式行显式补 r，其余原行 XML 保持；寻找新行插入点同样识别省略 r 和单引号 r。copy/move/fill/copy_format 都共用该 writer，无需 vendor 适配或扩大写入白名单。
- 上述 4 条修后同时验证隐式 source row4 的 `customFormat=true` 继承、move 真正移除 source B4、目标 D8/F8 只有一格、新 row9 插在原 `r='20'` 之前、extLst 与非目标 row20 原 XML 保留。只修范围 writer；未扩展 vendor 普通 set_cell 等其他写路径的隐式行承诺。
- 新 `xlsx-inherited-styles.test.ts` 7 条真实 read/edit-session 用例：两种引号、显式/行/列/默认优先、customFormat=1/true/0/false/省略、稀疏及隐式行/单元格坐标、空洞/等宽/空表/对象/迷你图补格、日期1900/1904、公式缓存、数字格式、列重叠/零/width-only、整列声明和既有20000格扩展预算。no-op save 独立 JSZip 逐部件与原件相等，输入 bytes 不变。

最终目标：Office `xlsx-inherited-styles.test.ts` + `xlsx.test.ts` + `xlsx-edit.test.ts` **3 文件61/61**；Server `xlsx-range-styles.test.ts` + `xlsx-agent-range.test.ts` + `xlsx-manual-ops.test.ts` + `xlsx-agent-host.test.ts` + `xlsx-fill-host.test.ts` **5 文件94/94**（82基线 + overlap8 + implicit4）。Office/Server tsc 与5目标TS文件 oxlint/oxfmt/diff通过。未运行fullOffice/build，未提交/暂存/归档/上传/删除。

冻结文件：`packages/office/src/xlsx.ts`、`xlsx-inherited-styles.test.ts`；`apps/server/src/services/xlsx-range-styles.ts`、`xlsx-agent-range.ts`（仅共用 replaceCells 行身份）、`apps/server/src/test/xlsx-range-styles.test.ts`。下一步独立checker及根会话实际浏览器/native验收；本报告不替代界面证据，不将已有全仓技能lint阻断计为通过。
