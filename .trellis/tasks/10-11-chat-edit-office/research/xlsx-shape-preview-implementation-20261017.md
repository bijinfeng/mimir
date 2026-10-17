# V — XLSX imported shape visual feedback implementation

2026-10-17. Implementation frozen for independent check. This is one slice of the active `10-11-chat-edit-office` task; it does not mark the overall task complete. No model calls, Desktop acceptance, browser acceptance, full-suite or production-build success is claimed here.

## Boundary and references

The actual gap was in `xlsx-visuals.ts`: native shape metadata became a preset name (default rect), one literal color, and text joined once per run. The object layer then painted a single fill-colored silhouette. The104-preset gallery already existed.

Main reference: fixed GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`, `/tmp/mimir-genoffice-html-git/apps/sheets/src/renderer/WorkbookVisuals.tsx:1330–1450`, and the matching vendored `pptx-engine/src/{parse,theme,custgeom}.ts` / `pptx-render/src/preset-geometry.ts`. Native frame centered on the cell anchor, rotation/flip, separate fill/line channels, linear gradients, custom paths and consistent rich paragraphs are concrete upstream behavior. Reused existing pure geometry/paint/text readers; vendor files are unchanged.

WeKnora applicability was checked using this task's same-day verified official site/public-source cache, not a fresh network request: v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24`; site SHA256 `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`, definitions SHA256 `3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0` (recorded in `docx-protection-password-next-plan-20261017.md`). Its capability gating supports truthful unsupported states; it does not define DrawingML geometry or Excel toolbar styling.

## Changes

- `xlsx-shape-preview.ts`: bounded namespace-expanded XML tree. Transitional/strict DrawingML and arbitrary/default prefixes are recognized; foreign namespace nodes/attributes cannot spoof native geometry. Document cap4MB/30,000 elements, depth48,64 attributes per node; per-shape8,000 nodes, geometry4,000 nodes/256 guides; validated formula operands, path commands, numeric native frames and finite output. DTD/entities, malformed/ambiguous geometry and over-budget inputs remain opaque. Each ordinary `xdr:sp` maps by its original anchor source offset, preserving current native `drawingPath#index` identities.
- Workbook theme relation requires the real OPC namespace, direct children, exactly one transitional/strict theme relation and an internal target. Theme DrawingML is normalized to canonical names only in a temporary read adapter.
- The selected DrawingML subtree is read through fixed vendor `parseSlide` with only in-memory `p:sp` naming adaptation. No PPTX package is constructed, saved, or written into XLSX. The synthetic reader's source XML anchor is cleared; the read model has no writer role.
- `xlsx-visuals.ts` attaches the native preview model. Paragraph/runs determine the flat text, preserving paragraph boundaries rather than introducing a newline between each styled run. Unknown geometry has no rect default.
- `XlsxShapePreview.tsx` and local CSS render native ext-sized rotated frames around the original grid anchor, flips, adjusted presets (including roundRect), normalized custom fill/stroke paths, noFill, theme/solid/alpha/linear-gradient paint, separate line width/dash/cap/join, and basic paragraphs/runs (font/family/size/bold/italic/underline/strike/color, alignment/spacing/insets, writing direction, native fontScale). An edited flat-text mismatch suppresses obsolete rich paragraphs. Zero native ext0/0 from the actual104 native insertion path is valid and uses the cell anchor; missing usable ext with quarter-turn rotation uses quadrant-swapped dimensions.
- `XlsxObjectLayer.tsx` delegates shape rendering only. Actual DOM row/column measurement, zoom handling, frozen/hidden track behavior, observer lifecycle, button identity and selection callbacks are unchanged. No Editor, DV, Controls, shared shell, Agent vocabulary or native writer changes.

## Verification

Target command:

`pnpm --filter @mimir/office exec vitest run src/xlsx-shape-preview.test.ts src/editors/XlsxObjectLayer.test.tsx src/editors/xlsx-object-layout.test.tsx src/editors/xlsx-shape-gallery.test.ts --maxWorkers=2`

**4 files /20 tests passed**, log `/tmp/mimir-xlsx-shape-tests-20261017.log`.

- Actual host insert/save/reopen of every104 gallery shape, followed by actual native preview rendering of each: no unsupported fallback, finite real paths, native geometry retained.
- Imported37°/90° frame/flip, adjusted radius/apex, theme gradient/alpha and style references, separate stroke, noFill, custom path fill-only/stroke-only, multiple rich runs/paragraphs, stale flat-text replacement, valid ext0/0 and absent-frame quarter-turn fallback.
- Arbitrary/default/strict namespaces, foreign geometry/theme/relationship spoofing, duplicate attributes, DTD/entities, native frame/guide/depth/document budgets and malformed command/coordinate handling. Invalid individual shapes do not hide valid sibling shapes.
- Source read does not mutate original bytes or set session dirty. Existing `openXlsxForEdit.save()` re-compresses even on a no-op, so whole-ZIP binary equality is not claimed for that pre-existing writer. Its no-op output's every original file entry is byte-exact. Preview itself writes no bytes and changes no history.
- Real `edit_shape` fill operation through `applyXlsxObjectOperation`, native ZIP output and `readXlsx` reopen preserve transform/adjustments/rich text/line, every later anchor, and every non-target file entry. Workbook matches after removing the pre-existing gateway calcPr update.
- Existing measured grid regression remains green at75/100/150% zoom, hidden/sparse tracks, variable actual row/column dimensions, remeasurement and observer cleanup. The real fixture includes frozen tracks and twoCell/oneCell/absolute anchors; final browser geometry/frozen-scroll acceptance belongs to root.

Gates: Office `tsc --noEmit` exit0 (`/tmp/mimir-xlsx-shape-typecheck-20261017.log`); scoped oxlint exit0; scoped oxfmt check9files pass; `node scripts/check-style-backticks.mjs` pass; scoped `git diff --check` pass. No Antd component changed.

An early mistakenly forwarded `test -- ...` command started the full suite; its process was terminated after detection. Its partial results are not a valid gate or new full-suite baseline. Subsequent runs used direct `exec vitest` with2workers.

## Browser fixture / remaining acceptance

Real native XLSX generated from `xlsx-shape-preview-fixture.test-helper.ts`: `/tmp/mimir-xlsx-imported-shapes-20261017.xlsx`,18,581bytes. Six shapes in row order: 渐变旋转圆角, 原生自定义路径, 透明轮廓, 主题样式, 未知自定义几何,90度原生框. Sheet has65rows,8columns, hidden row9, frozen first row/column. The theme is referenced through workbook relationships at a non-default path. `customXml/preview-opaque.xml` supplies a non-target native entry.

Root must independently check, build and perform1280/420×500 actual browser acceptance, including actual native save/reopen/history. Root should visually check selected rotation-frame alignment, rich text/readability, fallback state and existing Inspector/footer reachability. This agent has not uploaded the fixture or modified browser state.

Unsupported geometry, non-linear/image/pattern shape paint and connector/group/SmartArt/OLE/slicer records remain explicitly limited previews and native-preserved. Sophisticated WordArt/text effects are outside this basic text rendering slice and remain native-preserved; full visual fidelity for those effects is not claimed. This slice does not claim complete Excel artwork rendering. Existing shape-property controls still expose their established text/fill/anchor operations; no new shape editing tools or fill modes are invented here.

## Owned files

- Modified: `src/xlsx-visuals.ts`; `src/editors/XlsxObjectLayer.tsx`; `src/editors/XlsxObjectLayer.test.tsx`; `src/editors/xlsx-shape-gallery.test.ts`.
- Added: `src/xlsx-shape-preview.ts`; `src/editors/XlsxShapePreview.tsx`; `src/editors/xlsx-shape-preview.css`; `src/xlsx-shape-preview.test.ts`; `src/xlsx-shape-preview-fixture.test-helper.ts`.
- This report is the only task artifact changed by this agent. No staging, commit, archive, delete, vendor edit or unrelated change rollback.
