# Carlito GO font assets

These four faces resolve `@genoffice/ui/fonts/Carlito-*.ttf` in the fixed
GenOffice DOCX stylesheet. They preserve Calibri-compatible character widths
for browser layout and pagination. The font's internal family is `Carlito GO`,
the renamed GenOffice derivative of Carlito 1.103 (Vietnamese stacked-diacritic
repair). The included `LICENSE-OFL.txt` contains its SIL OFL 1.1 notice.

Source: GenOffice desktop 0.11.727, installed 2026-10-13, under
`Contents/Resources/modules/docs/renderer/assets/`. SHA-256, in order:

| Face | Source asset hash |
| --- | --- |
| Regular | `cca497a63f1cf8111d2189424ec38b95002e43799efe4f1486ec7f8063bb93c1` |
| Bold | `ed778b78ce652f5b17647344fb9a4c4dcb2e6f8bafe75a0366300da7f8c199ac` |
| Italic | `de59348ac812a347537b90a3d70796cfd5369048ecf9c78f5bca79ab55dd28a7` |
| BoldItalic | `0468067dde1d54111862f20f3fc4a5e8dcbc0ad4549e318c601b8ff7bdec935d` |

Vite resolves the vendored CSS URLs through `genofficeFontAlias` in the shared
renderer preset; keep that alias in both Web and desktop build configs.
