# R3 浏览器发现：XLSX CDATA 字符串显示修复

2026-10-17，R3 implement owner直接修复；root正在原冻结build执行浏览器，独立checker另行验收。生产仅`packages/office/src/xlsx.ts`，新增`packages/office/src/xlsx-string-display.test.ts`，同步shared XLSX合同与本报告。未改R3原9个生产文件/native writer/rules/structures/vendor或任何deck/media路径，未运行Server tests/build。

## 实际证据与根因

root上传R3测试件文档`S7JaVgn9K4g2AqfB`，浏览器数据!A3/B3显示`rich & <![CDATA[text&literal;]]>`，应为` rich & text&literal;`。

`xlsx.ts:readSharedStrings`与`cellOf`的inlineStr分支均以`<t>…</t>`正则取inner XML，再用只替换实体的`decodeXml`当文字。CDATA标记及注释没有被解释为XML字符数据；正则还会把CDATA/注释里的伪结束标签当真实边界。R3原生保存保留原始tokens是正确的，错误在网格只读文本投影。

## 最小修复

- `textElementBodies`只在已有`xlsxRangeXmlTokens`输出的真实si/t标签边界取body，CDATA/注释整体opaque，不另写tokenizer、不更改原native scanner。
- sharedStrings按真实si（含self-closing空项）保持索引；shared与inline共用`readStringText`和现有`readXlsxFormulaCharacterData`。普通实体只解码一次、CDATA字面保留、注释省略、XML换行归一但显式`&#13;`保留。源XML、rPr/runs及压缩包字节不作为显示结果重建。
- 没有扩大行/单元格通用XML解析、前缀兼容或写入语义；本片只修复已确认的字符串字符数据路径。

## 回归与证据

新增两项实际ZIP测试同时覆盖shared/inline：R3原始rich样本，普通实体、嵌套转义不得二次解码、Unicode数字实体、CDATA中伪`</t><t>`/`</si>`标签、伪标签注释、首尾/空run/空shared索引及CR/LF。真实`openXlsxForEdit`打开即文本正确且clean，无操作保存所有非目录entry精确相等；修改无关C4后，sharedStrings与未触及rich worksheet片段精确保留、其他entry不变；commit/再次保存entry仍一致，重开显示正确。

首次新测试误把ZIP重压缩后整件容器byte equality当作旧轻量session合同，失败；旧轻量session原合同是非目录entry字节精确，故改为对全部entry比较并额外核验无关编辑的片段/条目。未更改生产保存逻辑或降低原生XML保真要求。

| Gate | Result | Log |
| --- | --- | --- |
| Office显示/读取/编辑/native字符读取/clipboard/真实Editor6文件 | **88/88，0 failed/0 skipped，exit0** | `/tmp/mimir-r3-cdata-office-final-20261017.log` |
| Office tsc | **PASS exit0** | `/tmp/mimir-r3-cdata-types-20261017.log` |
| 两文件oxlint --deny-warnings | **PASS exit0** | `/tmp/mimir-r3-cdata-lint-20261017.log` |
| 两文件oxfmt --check | **PASS exit0** | `/tmp/mimir-r3-cdata-format-20261017.log` |
| scoped git diff --check | **PASS exit0** | `/tmp/mimir-r3-cdata-diff-20261017.log` |

实际测试命令仅使用安装好的`node node_modules/vitest/vitest.mjs run src/xlsx-string-display.test.ts src/xlsx.test.ts src/xlsx-edit.test.ts src/xlsx-range-rule-reading.test.ts src/xlsx-clipboard.test.ts src/editors/XlsxEditor.clipboard.test.tsx`（Office cwd）；无pnpm/install、Server runner或build。

## 冻结与后续

- 增量生产SHA：`/tmp/mimir-r3-cdata-production-freeze-20261017.sha256`；生产/测试2文件清单：`/tmp/mimir-r3-cdata-paths-20261017.txt`。
- 核对原R3生产9文件仍与`/tmp/mimir-r3-production-freeze-20261017.sha256`逐一相符。新增显示修复不冒充原516测试重新执行；本片没有Server runner。
- root在最终新build补实际A3/B3显示、选择复制与一次重开；旧build的其他mode原生保存/Undo验收仍由root按原报告记录。独立checker须核对本增量，不将本owner自验当独立通过。
