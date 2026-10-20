# 20,000-cell CI timeout: fixture container overhead

## Evidence and scope

CI 39415625320 (version-only b58c149) failed at the existing 5,000 ms test timeout; the 20,000-cell case reported 5,147 ms, while the other 1,365 tests passed. CI 39413324883 (324aa7d) passed the same case in 3,606 ms during `pnpm check`, then 3,628 ms in the additional server suite. An earlier CI 39410163587 had the same reported timeout. The first two runs were compared directly; exact relevant log lines are retained in `20k-fixture-ci-log-extract.txt`. The complete original failed-run log remains `/tmp/mimir-ci-016-failed.log`; successful-run log is `github-fixed-baseline-ci.log`.

Investigation and fix are limited to `apps/server/src/test/xlsx-range-disjoint.test.ts`. Production code, timeout (5,000 ms), assertions, row/column counts, operation, CI scheduling and versions were unchanged. No retries of failed tests, skips added to source, full monorepo gate reruns, commits or pushes were performed by this reviewer.

## Node 22 segmented measurement

Runtime: Node v22.23.1, Vitest 5.0.4 on local macOS. A temporary diagnostic version of the existing test measured phases with `performance.now()` and wrote JSON outside console interception. It was removed before independent regression. These measurements identify local costs; they do not claim to profile the failed GitHub runner.

| Phase | Original STORE | DEFLATE |
| --- | ---: | ---: |
| Build all 1,000 × 20 inline-string cells | 1.51 ms | 1.73 ms |
| Base native-feature fixture | 5.56 ms | 7.44 ms |
| Mutate sheet and generate ZIP | 7.20 ms | 33.23 ms |
| Actual `apply(bytes, 'sort')` | 800.21 ms | 935.35 ms |
| Existing `expect(result.bytes).toEqual(bytes)` | 1,081.20 ms | 58.51 ms |
| ZIP size | 1,022,262 bytes | 46,138 bytes |

Source data creation was inexpensive. Default JSZip STORE left approximately 1 MB of repetitive XML as the ZIP payload, making the complete byte-array equality assertion a major incidental cost. Compression adds approximately 26 ms of fixture work in this sample, retains real parser/operation work, and reduces the measured equality cost by approximately 1,023 ms. Original and compressed profiling each passed; this was diagnostic measurement, not rerun-until-green.

## Semantic preservation and final fix

The diagnostic constructed STORE and DEFLATE variants from the same base fixture and identical replacement sheet XML. It checked equal ZIP entry names, then exact decompressed byte equality for **every entry**, including the complete sheet XML. It independently counted 20,000 `<c ...>` cells and 20,000 `t="inlineStr"` cells in the compressed variant. All comparisons passed (`20k-fixture-phases.jsonl`). Compression changes the ZIP container only.

The test asserts successful acceptance of the existing 20,000 stored-cell budget, followed by the real small-range sort being a no-op. Both original assertions remain exact: returned bytes equal the entire input and returned version equals 7. This case is not a rejection test; a decompression/parser error would reject the awaited real operation and fail the test before either assertion, so no error shortcut supplies the improvement.

The `mutate` fixture helper now accepts an explicit compression option, defaulting to the original STORE behavior. Only this large test passes DEFLATE. All 1,000 rows, 20 columns, inline-string content, disjoint merge, opaque entries, and native operation remain the same. A comment records why this fixture uses compression. No production contract or spec needs changing; this diagnosis records the test-fixture lesson.

## Independent regression

All commands explicitly used `PATH=/Users/admin/.nvm/versions/node/v22.23.1/bin:$PATH`.

- `pnpm --filter @mimir/server exec vitest run src/test/xlsx-range-disjoint.test.ts`: **107/107 passed**, 4.93 s total process suite duration. This was run after removing all diagnostic instrumentation, without `-t`, so no cases were filtered or skipped.
- `pnpm --filter @mimir/server typecheck`: **pass**, `tsc --noEmit`.
- `pnpm exec oxlint apps/server/src/test/xlsx-range-disjoint.test.ts`: **pass**.
- `pnpm exec oxfmt --check apps/server/src/test/xlsx-range-disjoint.test.ts`: **pass**.

Retained files: `20k-fixture-before-profile.log`, `20k-fixture-after-profile.log`, `20k-fixture-phases.jsonl`, `20k-fixture-regression.log`, `20k-fixture-typecheck.log`, `20k-fixture-lint.log` and CI log extract. Profile runs intentionally selected the one case; the final independent run covered the entire original 107-test file. Remote full CI after the fixture fix remains the root session's next validation step; local timing does not guarantee runner scheduling or performance.
