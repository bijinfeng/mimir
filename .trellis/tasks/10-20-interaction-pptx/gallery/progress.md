# Gallery progress

- Frozen baseline is `/private/tmp/mimir-pptx-baseline-3b5d912` made from `git archive 3b5d912`, dependency symlinks only.
- Real PptxEditor/MimirProvider/editor-theme-bridge. Native fixtures title/text/image/empty plus true engine-generated rich/table/chart/group bytes, hashes in fixture-manifest.json. No React-private-state injection.
- Static root 5194 already serving repository. Before URL: `/docs/visual-comparisons/2026-10-20-pptx/demo/dist/before/index.html?scene=rich&width=390&height=400&capture=1`; theme dark optional. Current after under same path `after`.
- Isolated loopback native helper is live session34259 port5210. Use helper=1 in static URLs. Each variant bundles exact native product `apps/server/src/services/pptx-agent-host.ts`. Only `getDocument` (fixed gallery identity) and `applyPptxService` (explicit rejection of external service/generation) substituted. No DB calls. Real manual ops/picture/upload supported. PNG/jpeg codecs actual.
- Verify-helper proves real native mutation+save+reopen both variants and nonfixture rejection (helper-smoke-verification.json).
- Full source index built729 heterogeneous source records,45snapshots. These are source-only, not GUI counts;114Select audit is duplicate control subset, not added to records. File `research/source-inventory.json` authoritative. Need rebuild index after product edits.
- Parent owns browser before/after screenshots; must build comparison only from actual capture pairs. No invented screenshot evidence.
- Pending: final after rebuild after implementation freeze; restart helper if server code changes; capture index/hash verification + comparison page once screenshots available; archive fixtures/source/build/helper/license metadata; final README boundaries; formatter.

## Final baseline freeze

- `before` was rebuilt after removing disconnected AI preset callback and including exact Apache license.22resources SHA256 `bb344c856172eae08366650c521210cb05a3db607f93e14290bf1f837dc4705b`.
- Gallery `main.jsx` SHA256 `7213204092a2683f4ca7b9e88964aa130418a0ba70a89dc2ee56f2b51e9e7917`; `vite.config.mjs` SHA256 `ef5d2ae7bfce0e0f512a0e7fa5765d45549d63a6154ef9a220f73d391f4f806b`. Frozen: no source changes absent concrete defect.
- Baseline exact gallery input source copies archived in `demo/source-before/`, text code stored `.txt` to prevent subsequent formatter drift; paths.json maps original input→archive path.
- Parent captured8real beforePNG pairs after final wiring: formula/diagram short390×400light, formula/diagram wide1100×760light, diagrammedium690×600light, importemptyshort390×400dark, importpreviewshort390×400dark(title-layout.pptx selected), importemptymedium690×600dark. Final after captures must match.
- `capture-scenarios.json` + strict `build-comparison.py` ready; builder refuses missing after PNG, validates exact pair dimensions, hashes screenshots, includes actual demo/index/acceptance/source evidence links. No screenshots fabricated.
- `verify-builds.py` currently correctly rejects after build as stale while implementation modifies product; run final GALLERY_BUILD_VARIANTS=after only after product freeze and source inventory refresh.

## Product freeze build

- ONLYafter rebuilt following worker freeze, including final media footer button width100%.
- Finalafter22resources SHA256 `e9632a261967e504a47d9fddee40129e433cc31b99a232ea7456b10960fd852f`.
- `verify-builds.py` passed all239before sources against gitshow3b5d912/frozen gallery,239after sources against live product, allactual resources,754unique indexrecords and source snapshot hashes. Also now independently verifies helperadapter, original server/native source inputs and actual temporary compiled helperbundle bytes.
- Source inventory gained25states. Index now754heterogeneous source records; states are source branches with original evidence, not GUI passes.114Selectaudit is a duplicate subset not included in754record count. Refreshing AST research after code edits is parent responsibility; rerun build-interactions afterwards.
- Current entire docs directory oxfmt --check passes. Targeted gallery JS lint exits0,3nonblocking warnings in frozen source/helper/testdriver; no lint errors.
- Comparison strict script awaits8matching actual after captures. Parent owns screenshots. Gallery does not fabricate or modify browser evidence.

## Completed archive integrity

- All8actual after captures supplied by parent were present. Strict builder produced comparison.html and capture-manifest.json:8pairs/16PNG, matching exact physical dimensions and shared native fixture/theme metadata;0supplements. Original screenshot bytes unchanged. Root comparison SHA256 `102139eefa452254620cbb07a64dd39f6118b1c5c152d46e5cbd1e3fdf5f1433`.
- Original inventory preserved as `research/baseline-source-inventory.json` with45source hashes from gitshow3b5d912, separately archived at docs root. Babel inventory.cjs rerun against current product;25manual branch-vicinity states explicitly retain original baseline anchors and now point to current physical lines through diff mapping. Source revision/method fields disclose this.
- Current index754records/45current source snapshots/114Selectaudit subset.45read-only current source HTML pages with exact#Lanchors added; all754links and anchors physically verified. Verifier also compares all45views' decoded source text against actual current files, applying browser-standard first-LF removal for pre and blank-line whitespace normalization.
- verify-builds.py final run passed resources22×2,sourceinputs239×2,helper159×2+actual compiled bytes,baseline45hashes,state25anchors,sourceviews45,screenshots16dimensions/hash,original GenOffice Apache hashes. ProductGUI acceptance remains separate and parent-owned.
- Additional static index-validation.json and comparison-validation.json written. Current archive formatcheck passed62files (before the2simple final validation JSONs, which match standard pretty JSON).
- Parent still writing acceptance/browserobservations and running fullpnpmcheck. No product/main/config changes from gallery. Before/after bundle hashes remain finalfreeze values above.
