# XLSX preview/range — concrete follow-up review boundary

2026-10-17 root. Research-only source pass while DV implementation/check and other formats are in flight. This note is not an implementation/test/browser pass and does not authorize silent widening into arbitrary Excel compatibility.

## Reference checked

Fixed GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`, checkout `/tmp/mimir-genoffice-html-git`. File editing main reference; WeKnora official site/public source reuse same-day v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24` cache/hashes checked in `docx-protection-password-next-plan-20261017.md`. WeKnora capability registration/knowledge tools can inform truthful gates, not DrawingML geometry or Excel merge/range semantics.

## Confirmed concrete gaps

### V — imported shape visual feedback

- Mimir `xlsx-visuals.ts` shape branch uses the first prstGeom or **defaults to rect**, first literal srgb solid fill, flattened text. No native rotation/flip, frame extents, custGeom, line styling, gradient, theme style or rich paragraphs are represented. `XlsxObjectLayer` paints the preset with one fill/stroke and flat overlaid text. The104-preset gallery is already implemented; adding another gallery is not the gap.
- Fixed upstream `WorkbookVisuals.tsx:1330–1450` explicitly renders custGeom own coordinates/fillable subpaths, true ext-sized frame centered on rotated anchor, rotation/flip, linear gradients, separate noFill/line styling and source paragraphs when consistent. `shared/desktop-api.ts` carries these actual fields. This is a real existing-object preview gap, not only an untested export claim.
- Smallest V slice: extend private read-only visual model/parser with bounded namespace-aware native spPr/xfrm/geometry/line/fill/text metadata; use existing Office preset/custom geometry/paint helpers as appropriate. Native parse/render adapters can reuse `pptx-engine/parse.ts parseSlide` or `custgeom.ts parseCustGeom` via a bounded synthetic wrapper **only if** correct source semantics and namespace/relationships/theme mapping are demonstrated. Do not alter vendor or write synthesized PPTX back to XLSX.
- A custGeom without a reliable path must explicitly remain unsupported preview; do not paint a blue rectangle as if it were the original. Keep native XML intact and editing capability truthful. Common linear gradient/noFill/rotation/flip/adjusted presets, custom path fill/stroke and basic rich text should be demonstrated before claiming this slice complete. Unknown diagrams/SmartArt/OLE/slicers are separate targets, not generic rect shapes.
- Current anchor metrics must remain tied to actual DOM rows/cols at75/100/150%, frozen/hidden tracks and twoCell/oneCell/absolute anchors. Rendering is zero dirty/history/bytes. Keep object identity and existing minimal text/fill/anchor native edits; editing one supported property preserves the remaining imported metadata in preview and ZIP.
- Needed tests: ordinary inserted104 presets unchanged; native imported examples above, unknown namespaces/opaque fallback, bounded bad geometry; source read-only whole bytes; actual native edit/save/reopen and all non-target entries. Root1280/420 screenshots of actual shapes, no stretched fallback, controls/selection/footer. Separate owner may change only xlsx-visuals, new shape read/render helpers, XlsxObjectLayer/local CSS and tests; no XlsxEditor/DV/shared shell writes without coordination.

### R — range structure preservation

- Current `xlsx-agent-range.ts assertCopyFeatures` rejects source/target intersecting plain merge/hyperlink/CF/DV, plus whole-sheet table/comments in some paths. `xlsx-manual-ops.ts` format painter rejects all intersecting merges; cut rejects plain notes/links/rules and partially intersecting references. `xlsx-agent-data.ts sort` rejects the whole worksheet when any listed linked feature exists, even disjoint from the sorted range. These are actual current guards; removing them without migrating structures is wrong.
- Fixed upstream has distinct user/native ranges and structures. `workbook-dsl.ts copy_range` guards geometry/budgets/filter; preserving raw cells in Mimir is intentional improvement over scalar expansion. It does not prove that arbitrary intersecting native structures must be accepted. Next R research must compare the **actual executable manual/native path** for each plain structure, record exact expected copy/cut/sort/format semantics and supported target restrictions, then define independently verifiable sub-slices.
- Likely bounded first R slice: permit **disjoint** native structures while preserving all relevant parts byte-exact, then complete **fully contained ordinary merge/hyperlink** movement/copy with reference/relationship migration and destination collision checks. Keep partial merges, unsupported extension rules, arrays/spills and table/pivot migration guarded until there is a tested plan. Do not change a guard into silent scalar-only loss; do not call this all-Excel compatibility.
- DV owner is active in xlsx-agent-host/validation files; R should begin after freeze, and preserve warning/info explicit manual confirmation and host revalidation semantics. Agent must not self-confirm warnings through range adapters. Atomic candidate must include every related native part or publish nothing.

## Queue

V needs a formal implementation/check slice after current workers release. R needs exact per-structure upstream execution evidence before code. Current note records confirmed gaps and smallest seams; no new production modifications, fixture uploads, model calls or root full gates were performed here. Overall task remains in_progress.
