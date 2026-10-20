# Design system documentation review

Date: 2026-10-20. Role: Impeccable documenter, scan mode. Disposition: **preserve incumbent system**.

This is an ordinary extension of the approved Mimir identity. No changes to `apps/web/DESIGN.md` or `apps/web/.impeccable/design.json` are required. No new global tokens, identity decisions, or prohibitions are inferred from this landing page.

## Evidence checked

- `apps/web/DESIGN.md`: existing normative frontmatter, eight canonical sections, neutral navigation / semantic green distinction, reading rhythm, flat workspace, shared BrandMark and font stack.
- `apps/web/.impeccable/design.json`: schema version 2, existing primitive references, eight component specimens, motion and breakpoint extensions, and named rules matching the incumbent document.
- `apps/web/PRODUCT.md`: public introduction uses bounded examples and preserves the shared Web / Desktop brand.
- `packages/renderer/.impeccable/surfaces/src-components-marketing-officialsite-tsx.md`: approved question-led surface composition and explicit retention of the incumbent identity.
- `packages/renderer/src/theme/tokens.ts` and `customToken.ts`: shared green `#00834d`, white / gray light surfaces, calibrated dark surfaces and green links, neutral selected navigation, 6px controls, system Chinese-compatible font stack.
- `packages/renderer/src/components/marketing/OfficialSite.tsx`, `CitationDemo.tsx`, `WorkbenchDemo.tsx` and their three style files: actual token consumers, existing brand and product primitives, semantic citation states, controls, reading content, breakpoint rules and motion.

## System summary

1. Palette: incumbent white / gray surfaces and workbench green; all marketing colors consume shared theme roles, including dark mode.
2. Type: shared system Chinese font stack; workspace sizes remain unchanged, with 15px / 1.9 reading content and 14px interface text.
3. Selection: **The Separate Selection Rule** is retained; the workbench example uses neutral navigation selection while citations use semantic green.
4. Rhythm: **The Reading Rhythm Rule** is retained; public display sizes are locally scoped to the marketing stylesheet.
5. Depth: **The Flat Workspace Rule** is retained; fine borders, tonal surfaces and whitespace provide hierarchy without new shadows.

## Surface facts kept out of the global system

The 1200px marketing container, 700 / 1000 / 1100px marketing layout rules, 61.6px desktop hero display size, 8px demonstration frames, and 700ms citation highlight are local composition facts. They remain in source and the surface brief rather than replacing the workspace's 880px navigation breakpoint, 28px document title, 6px controls, or existing state transitions. The source highlight disables animation under reduced motion.

The original-passage close control has a 44px target and the current external-link affordances use Lucide SVG components. No remaining marketing design-system defect was identified in this source pass. Pre-existing field-boundary contrast tradeoffs are already disclosed by the incumbent document; this task neither repairs them nor promotes them into new rules. Browser visual verification and the final finish verdict are recorded separately by the main task.

## Output contract

Written: this evidence report only. System files: **No changes**. Defects / drift not canonized or repaired: no new durable system drift; page-specific typography, geometry and responsive rules deliberately remain local.
