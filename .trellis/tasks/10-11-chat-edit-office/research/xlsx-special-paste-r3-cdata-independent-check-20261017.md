# XLSX CDATA 显示增量：独立检查

2026-10-17，checker `/root/r3_bullets_independent_check`。**本增量独立检查 PASS，生产代码无需修改。** 只检查 `xlsx.ts` 的字符串显示投影及专项测试，不重新声称其他R3写操作已在新build浏览器通过。

## 依据与快照

沿已加载本任务PRD/design/implement/check context、Office engine/editors、项目quality/rules及shared XLSX现行合同，追加读取 `xlsx-special-paste-r3-cdata-display-fix-20261017.md`。本轮是已有浏览器缺陷的代码验证，无新竞品调研或HTTP访问；编辑语义沿固定GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`。WeKnora缓存v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24`只适用于KB/Agent门控，不决定XLSX字符投影。

- 唯一生产 `packages/office/src/xlsx.ts` SHA **`44b6151efe0d4d9b5290b96020b5a6a8dfd5ff97c7e686c594cdc269f5b9f3f4`**，独立检查前后相同；日志 `/tmp/mimir-r3-cdata-independent-freeze-check-20261017.log`。
- 原R3九个生产文件仍与owner冻结全部exact；日志 `/tmp/mimir-r3-cdata-independent-original-r3-freeze-check-20261017.log`。
- 最终专项测试 `packages/office/src/xlsx-string-display.test.ts` SHA `fe4ef1f9dff1d2c1c235661a2d4cc7b60b6934b0444a39684b79d03073cdcde7`。

## Findings (fixed)

- File: `packages/office/src/xlsx-string-display.test.ts`
- Issue: 实施者覆盖了正常CDATA/注释/实体，但尚未直接证明新增字符数据读取路径对畸形字符数据的失败行为。
- Fix: checker追加6个参数组，分别在shared与inline路径验证未知实体、零字符/代理区/超Unicode范围字符引用、裸CDATA结束符、错误注释均明确拒绝，输入Uint8Array完整不变。测试自带真实ZIP原件，不依赖/tmp浏览器fixture。共12次实际格式读取（Vitest计6项）。
- 新测试首次oxfmt检查失败，已仅格式化该测试并重新通过；无降低规则或生产修改。

## 实际路径核对

1. `textElementBodies`复用现有 `xlsxRangeXmlTokens`；CDATA和注释作为完整token，不会将其中伪`t`/`si`结束标签或文本当结构。`si/>`仍占真实共享索引，空`t/>`不吞后续run。没有第二个XML tokenizer或vendor修改。
2. shared/inline共用现有 `readXlsxFormulaCharacterData`：普通实体单次解码，CDATA字面保留，注释不显示；原首尾空白/多run连接/CRLF归一及显式`&#13;`保留。数字Unicode实体和双重转义有独立期望。
3. 没有将显示结果重建回源XML：真实openXlsxForEdit/no-op save全部非目录entries字节相同；无关C4编辑后原sharedStrings、rich片段与其他所有entry保持；commit再次保存和重开显示正确。
4. 读取仍由BoundedZip入口限制50MiB输入、64MiB单部件、400MiB累计；新字符串提取无递归或XML实体展开，只扫描实际tokens/文本。新增测试证明上述特定畸形字符数据拒绝；不将其扩写成整个轻量worksheet parser全面XML验证或QName/任意嵌套兼容承诺。本片明确未扩大既有行/格通用解析范围。
5. shared XLSX合同§R3已记录显示字符数据与原生runs/tokens保持边界，未发现spec drift，无额外规范修改。

## Verification

以下均真实执行，最终exit0：

| Gate | 结果 | 日志 |
| --- | --- | --- |
| Office显示/读取/编辑/规则字符数据/clipboard/真实Editor | **6files94/94，0failed/0skipped** | `/tmp/mimir-r3-cdata-independent-office-formatted-20261017.log` |
| Office TypeCheck | **PASS** | `/tmp/mimir-r3-cdata-independent-types-final-20261017.log` |
| 两文件oxlint --deny-warnings | **PASS** | `/tmp/mimir-r3-cdata-independent-lint-final-20261017.log` |
| 两文件oxfmt --check | **PASS** | `/tmp/mimir-r3-cdata-independent-format-final-20261017.log` |
| scoped git diff --check | **PASS** | `/tmp/mimir-r3-cdata-independent-diff-final-20261017.log` |

测试命令（Office cwd）：`node_modules/.bin/vitest run src/xlsx-string-display.test.ts src/xlsx.test.ts src/xlsx-edit.test.ts src/xlsx-range-rule-reading.test.ts src/xlsx-clipboard.test.ts src/editors/XlsxEditor.clipboard.test.tsx`。没有Server runner、fullbuild、安装、暂存/提交/归档/删除。

历史保留：新增checker测试前原6files88/88；新增后94/94。初次Office tsc命中并行deck WIP的`releaseWait`未定义和active绑定缺documentId，日志 `/tmp/mimir-r3-cdata-independent-types-20261017.log`；已交deck owner修复，checker未碰其文件，随后完整Office tsc exit0。不能把首次类型红写成从未失败。

## Findings (not fixed)

无未修复的本增量缺陷。root仍须在新生产build复查实际A3/B3字符显示、选择复制与重开；本checker未操作浏览器或构建。旧build六mode/native/history证据与新build显示补验分开记录。最终全仓pnpm check、Desktop用户自验、无真实provider边界均保持，不以本增量PASS宣称总体工具完成。
