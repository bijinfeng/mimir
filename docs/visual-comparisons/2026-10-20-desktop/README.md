# Desktop interaction polish archive · 2026-10-20

- [8 matched before/after render comparisons](comparison.html): 16 actual browser screenshots with matching fixture content, theme, platform, viewport and component size. One superseded viewport-race capture is preserved separately and excluded from the pairs.
- [Complete source and interaction index](interactions.html): 19 overlapping surface families, with 28 before and 28 current exact source snapshots. Source records are not GUI pass counts.
- [Current real-component demo](demo/dist/after/index.html?scene=setup-first) and [frozen baseline demo](demo/dist/before/index.html?scene=setup-first).
- [Reproduction and evidence boundaries](demo/README.md), [capture manifest](capture-manifest.json), [build manifest](build-manifest.json), and [verified resource/source/notice evidence](final-build-verification.json).
- [Native smoke evidence](native-smoke.txt) is separate from the simulated browser bridge.

Screenshots retain their historical `.png` filenames but contain original JPEG bytes, recorded as `actualMediaType: image/jpeg`; no images were transcoded. The fixed product baseline is `53285bbdeaa17475e04aae517f07c957776cb6b6`. The actual Desktop window defaults to 1440×900 with no minimum width/height; 390×400 is a pressure check.
