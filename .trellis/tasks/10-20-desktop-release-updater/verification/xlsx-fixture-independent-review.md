# XLSX 20,000-cell 夹具压缩独立窄审

2026-10-20，Node 22.23.1。只读审查当前 `apps/server/src/test/xlsx-range-disjoint.test.ts` 差异与 server/backend/tests.md；本轮只新增本报告，没有修改产品或测试文件、没有提交/远端操作，没有重复整文件或全仓测试。

结论：未发现实质问题，夹具压缩调整保持原有验收语义。

- 实际 diff 仅给测试专用 mutate 增加 `'STORE' | 'DEFLATE'` 可选参数，默认 STORE 与 JSZip 当前库原默认一致；唯一大夹具 case 显式 DEFLATE，其他调用维持原行为。
- 20k case 的 1,000 行 × 20 列、全部 inlineStr/keep 内容、远离 A1:B2 的 ZZ1:AAA2 合并区、真实 `await apply(bytes, 'sort')` 均未改。该工作表 A1:B2 的排序是 no-op；测试仍要求成功接受既有 20k 存储格预算，返回完整 ZIP 字节严格相等且 version 仍为 7。不是把真实操作替换成模拟，也没有把错误当成功。
- 5,000ms 默认测试期限未改，无 skip/retry/扩大预算。压缩减少的是既有完整 byte-array `toEqual` 的输入长度，没有删除字节断言。相邻 current-canvas no-op 的 dirty/history/undo/publish 断言完全未触碰；生产文件未改。

## 独立小证据

从当前测试源提取实际 fixture 函数，经 Node stripTypeScriptTypes 在内存执行，使用原始 XLSX、相同 native merge 和原 case 的完整 sheetData。分别生成 STORE 与 DEFLATE，并以 JSZip 重新打开两者：

- ZIP 条目：**15**，两者名称严格相等。
- 对每个非目录条目逐一解压为 Uint8Array 并 `assert.deepEqual`：**全部解压字节严格一致**。
- STORE **1,022,262 bytes**；DEFLATE **46,138 bytes**，与实现代理报告吻合。
- 独立计数：**1,000 rows、20,000 `<c>`、20,000 `t="inlineStr"`**；`<mergeCell ref="ZZ1:AAA2"/>` 仍在。

内存证据脚本未写临时测试或修改任何夹具。复核既有 `20k-fixture-ci-diagnosis.md` 与 phases JSONL 的测量和语义描述一致；其 107/107、server typecheck/format 的结果由原验证记录支持，本轮不冒称重新跑过。

远端完整 CI 仍由主会话在提交后执行；本地压缩/等价验证不保证 runner 调度耗时，也不改写之前真实超时结果。没有现行生产契约变化，不需要新增产品规范。
