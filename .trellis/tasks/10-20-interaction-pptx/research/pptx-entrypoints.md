# Research: PPTX entry points and bounded polish gaps

- Query: Inventory current PptxEditor interactions and identify minimal justified polish, particularly long property forms and busy composite controls.
- Scope: internal
- Date: 2026-10-20 (Asia/Shanghai)

## Findings

### Files found and coverage

`source-inventory.json` is a Babel TSX AST inventory of all 45 non-test `Pptx*.tsx` files in `packages/office/src/editors/`. It retains file:line and baseline source hashes. Records: 6 Ribbon tabs, 50 Ribbon groups, 43 surface declarations, 468 static-labelled JSX controls, 99 dynamic-labelled JSX controls, 63 JSX map families, 114 ToolbarSelect instances, and 25 explicit state families. Categories overlap and declarations can repeat; do not sum these into a claimed interaction count. Dynamic maps are not expanded into a fake GUI case count. Shared-shell controls, native HTML details, context menus and pointer canvas gestures also require explicit real-GUI checks.

Tabs: 开始 / 插入 / 对象 / 绘图 / 幻灯片 / 视图 (`PptxEditor.tsx:3564`). The JSON lists each group and its owning tab, including conditionally rendered media controls.

Main files:
- `PptxEditor.tsx:3135`: `advancedMenu` routes a named subset to a 320px Inspector and all other tools to 350px ToolbarMenu popovers. Inspector body/closing/render identity at `:4991`.
- `PptxControlPanel.tsx:22`: shared old form wrapper, only disabled fieldset + ToolbarPropertyForm; no owned scroll body or footer.
- `PptxObjectControls.tsx`: paragraph, picture, effects, links, arrangement, freeform, connectors; legacy forms and mature specialized forms coexist.
- `PptxAdvancedControls.tsx`: current chart editor and slide notes/transition/animation controls.
- `PptxDeckControls.tsx`: page size/layout, theme, header/footer and sections/review.
- `PptxInsertControls.tsx`: equations, WordArt, native fields and diagrams.
- `PptxAssetControls.tsx`: native slide import, image fill and media player.
- `PptxChartAppearance.tsx`: shared chart style/series/point color fields.
- `PptxMasterControls.tsx`: long native master/layout/object edit form.
- `PptxTableControls.tsx`, `PptxFillControls.tsx`, `PptxAnimationGallery.tsx`, `PptxCurveControls.tsx`, `PptxZoomControls.tsx`: additional busy composite-control gaps.

### Existing behavior that should be preserved

- Inspector docking/overlay already exists: `pptx-tools.css:15` width320, solid surface, flex column; `:40` outer scroll; ≤800px workspace overlays with32px context at `:69`.
- Specialized paragraph, picture-crop, image/media fill, chart/table, theme, animation, output, clipboard, shape/icon galleries already own useful body/footer/scroll layouts. Their CSS files are the actual evidence; do not replace them with a generic redesign.
- `PptxEditor.tsx:3140`: missing host and invalid target expose specific reasons. `:2838`/`:2867` guard current version, slide and selection; `:1780` successful save commits actual bytes and rebinds text range only for same live identity.
- Opening an Inspector already closes prior async asset/clarification requests and records real trigger/group; Escape closes the nearest unhandled panel and restores live focus.

### Minimal supported changes

1. **Busy Select consistency.** `select-busy-audit.json` records all 59 candidate instances including exceptions. `ToolbarSelect` (`shell/EditorShell.tsx:747`) sends `disabled` only when explicitly passed. Native fieldset cannot reliably disable its Antd trigger. Generic pointer-events suppression does not fix keyboard focus/previously opened portals. Add actual owning busy gate, preserving existing contextual restrictions.
2. **ChartAppearance contract.** Seven Selects (`:131,149,175,207,238,283,292`) have no busy input. The only production caller is `PptxAdvancedControls.tsx:225`; accept `disabled=false` and explicitly pass chart busy. Preserve text/number native fieldset behavior and actual chart values. Parent's four Selects (type/legend/labels/data series) also need busy.
3. **Long Inspector forms.** Equation, diagram, import and master are Inspector tasks. Their outer Inspector already scrolls; merely adding another scroll container does not keep their primary action visible. Prefer optional `footer`/scroll-body contract in PptxControlPanel, opt in only actual long Inspector forms. Preserve default legacy/popup layout. Master has immediate native operations rather than one global apply, so do not invent a combined transaction.
4. **Do not confuse popup tools with Inspector tasks.** Effects, links, page dimensions/layout, WordArt and dynamic fields currently render through the bounded350px menu fallback. They need busy fixes and real short-height checks, not an automatic Inspector migration. Existing shell menu body already scrolls.
5. **Potential visible density gaps need GUI evidence.** Equation/diagram previews use up to190px height and imported slide preview adds more form height. Native master preview plus per-object text/geometry/color operations creates a long sheet. Compare390×400 and690px middle column before selecting exact footer/layout targets.

## Related specs

- `.trellis/spec/office/frontend/editors/conventions.md`: named Ribbon groups at real width; complete338/390px reachability; visible labels and units;320px Inspector with internal scroll/fixed actions.
- `.trellis/spec/office/frontend/editors/pitfalls.md`: explicit Antd composite disabled; PPTX durable selection and accepted-version lifecycle; fieldset is insufficient; no-op history; busy/native save mutual exclusion; focus ownership.
- `.trellis/spec/office/frontend/shell/conventions.md`: no host .ant-* overrides; existing theme bridge; tooltips are not visible field labels; native history/save paths.
- `.trellis/spec/office/engine/page-structure.md`: native XML/relationships, independent slide parts, save→IO success→commit, no silent lossy conversion.

## External references

See `pptx-external-references.md` and `external-fetch-evidence.json`: WeKnora v0.8.3 site/source checked; PPTX primary references are current Microsoft PowerPoint help, Google Slides help, and fixed GenOffice480548f source.

## Caveats / Not Found

- This is source research only. No screenshot, click, hover, keyboard, host submission or persistence was verified by this researcher. GUI acceptance must record actual widths/themes/native fixture and distinguish simulated IO from real host execution.
- A missing disabled prop is a candidate, not automatically a bug: `PptxViewControls` session zoom should remain usable; format-brush mode also requires lifecycle judgment. Existing contextual disabled expressions must be OR-ed, not replaced.
- AST labels count visible/semantic declarations, not unique commands, expanded menu choices or all possible user interactions. Dynamic families and state families require curated representative verification.
- No product code, vendor source, spec, git or implementation manifest was changed by this researcher.
