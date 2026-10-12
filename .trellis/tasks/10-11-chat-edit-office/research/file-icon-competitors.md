# Research: knowledge-base file type icons

- Query: How should Mimir make file types immediately recognizable in the library list and cards, following strong competitor patterns without copying proprietary product marks?
- Scope: mixed (Mimir code/specs, Microsoft 365/OneDrive, Google Drive, Obsidian, WeKnora, open-source assets)
- Date: 2026-10-12 (Asia/Shanghai)

## Findings

### Mimir's current presentation

- `packages/renderer/src/components/library/LibraryView.tsx:814-835` already appends `fileExtension` to the visible name once, and separates the suffix from the truncating stem. Keep that behavior.
- `LibraryView.tsx:841-865` draws one 22×22 folded-paper SVG and overlays a 3-letter ribbon; `:868-912` changes the ribbon text by extension. At list scale the silhouette stays nearly identical, and the tiny letters carry almost all of the distinction.
- `LibraryView.tsx:648` and `:1041` use the same `docIcon` in list and card. `LibraryView.style.ts:322-327` currently applies a single secondary-text color to the icon wrapper. A replacement should stay shared across both views and accommodate light/dark themes.
- `packages/renderer/src/components/library/LibraryView.test.tsx:33-45` asserts textual `<text>` labels; if the renderer changes to pictograms, assertions should check type mapping and fallback instead.

### OneDrive / Microsoft 365: an asset for each type at list sizes

- Microsoft's official [`@fluentui/react-file-type-icons` README](https://github.com/microsoft/fluentui/blob/master/packages/react-file-type-icons/README.md) describes its file-type collection and demonstrates `getFileTypeIconProps({ extension: 'docx', size: 16 })`. Its [`FileTypeIconMap.ts`](https://github.com/microsoft/fluentui/blob/master/packages/react-file-type-icons/src/FileTypeIconMap.ts) maps `docx`, `xlsx`, `pptx`, `pdf`, `html`, and `txt` to distinct named assets. [`initializeFileTypeIcons.tsx`](https://github.com/microsoft/fluentui/blob/master/packages/react-file-type-icons/src/initializeFileTypeIcons.tsx) registers native 16, 20, 24, 32, 40, 48, 64, and 96px SVG/PNG variants. This is concrete evidence that the file-type silhouette is designed to work as an image at 20px, close to Mimir's 22px slot.
- Checked npm `@fluentui/react-file-type-icons@8.18.2` on 2026-10-12: package metadata reports MIT, ~486 KB unpacked. However the [package license](https://github.com/microsoft/fluentui/blob/master/packages/react-file-type-icons/LICENSE) explicitly says its referenced fonts/icons have separate [Fluent asset terms](https://aka.ms/fluentui-assets-license); the initializer fetches them from Microsoft CDN by default. Do **not** assume the MIT code license gives unrestricted rights to rebundle Microsoft Office marks. Use its scale and per-type structure as a visual reference, not its CDN assets.
- Mimir application: distinct recognizable pictograms, fitted into a 22px box with approximately 20px visible form. Avoid a miniature 3-letter label inside every icon.

### Google Drive: stable category color plus a distinct glyph

- The official [Drive `File` resource](https://developers.google.com/workspace/drive/api/reference/rest/v3/files) exposes both `mimeType` and `iconLink`, the latter described as a static unauthenticated link to the file icon. Checked the live Google-served **16×16 PNG assets** on 2026-10-12: [Docs](https://drive-thirdparty.googleusercontent.com/16/type/application/vnd.google-apps.document) is predominantly blue `#3186ff`; [Sheets](https://drive-thirdparty.googleusercontent.com/16/type/application/vnd.google-apps.spreadsheet) green `#00af57`; [Slides](https://drive-thirdparty.googleusercontent.com/16/type/application/vnd.google-apps.presentation) yellow `#fec700`; [PDF](https://drive-thirdparty.googleusercontent.com/16/type/application/pdf) red `#fc413d`. These are concrete current icon assets, not an inferred palette from a marketing screenshot.
- The same endpoint for imported OOXML files was observed to produce different/less colorful third-party icons; do not claim that Google Drive uses the Google Docs brand icon for every `.docx` or `.xlsx` file. Also do not embed Google's hosted icons or copy Docs/Sheets/Slides logos into Mimir: they are product identifiers, not a general open-source icon license.
- Mimir application: use restrained category color (blue document, green table, orange/amber presentation, red PDF), while preserving a distinct shape so color is never the sole cue. On the dark Obsidian-like list, a small solid mark has a better chance of staying legible than a thin grey outline.

### Obsidian: page structure, not the file-type asset source

- The official [File explorer help](https://obsidian.md/help/plugins/file-explorer) (source fetched from Obsidian Publish on 2026-10-12) describes a compact file tree, direct file/folder operations, and toolbar controls linked as Lucide icons (`lucide-pen-line.svg`, `lucide-folder-plus.svg`). It does **not** specify a complete set of file-type icon assets or a type-color mapping. No official screenshot with enough detail for a 22px type-icon comparison was established in this pass.
- Mimir application: keep Obsidian's quiet, compact surrounding chrome and selected-row behavior; let file-type marks be modest, rather than turning each row into a colored tile.

### WeKnora required check: relevant mechanics, wrong visual reference here

- Reviewed WeKnora public source at release [`v0.8.2`](https://github.com/Tencent/WeKnora/releases/tag/v0.8.2), published 2026-09-24. [`frontend/src/utils/files.ts`](https://github.com/Tencent/WeKnora/blob/v0.8.2/frontend/src/utils/files.ts) maps extensions to Word/Excel/PowerPoint/PDF and other categories. [`DocumentFileIcon.vue`](https://github.com/Tencent/WeKnora/blob/v0.8.2/frontend/src/views/knowledge/components/DocumentFileIcon.vue) distinguishes manual notes and URLs with edit/link badges, otherwise reuses an artifact file icon. [`artifactFileIcon.ts`](https://github.com/Tencent/WeKnora/blob/v0.8.2/frontend/src/utils/artifactFileIcon.ts) draws a **32×38 folded sheet** with an uppercase extension banner. [`artifact-file-icon.less`](https://github.com/Tencent/WeKnora/blob/v0.8.2/frontend/src/components/css/artifact-file-icon.less) colors Word blue, Excel green, PowerPoint amber, PDF red, and media/code by category.
- The extension banner is nearly the same idea the user rejected in Mimir, and its 32×38 proportions are for larger artifact cards. It would shrink badly into Mimir's 22px list slot. Retain only its extension classification and note/URL distinction as knowledge-base-agent references; do not copy this art direction for Mimir's file list.

### Open-source icon systems evaluated

| System (checked 2026-10-12) | Visual/technical fit | Rights/limit |
| --- | --- | --- |
| Microsoft Fluent file type icons `8.18.2` | Excellent 16/20/24px type-specific assets; package adds Fluent registration and default CDN fetch. | Code MIT, referenced icon assets subject to separate Microsoft terms. Office marks can imply Microsoft affiliation. Reference only. |
| [Material Icon Theme](https://github.com/material-extensions/vscode-material-icon-theme) `5.39.0` | MIT, ~1.68 MB unpacked; SVGs such as `document.svg`, `pdf.svg`, `html.svg`, `markdown.svg` are colorful and mostly sized on 24/32px viewBoxes. Some are too specific or inconsistent: `table.svg` has a small X-like sign, `word.svg` and `powerpoint.svg` use letter cues, and audio/video are 32px. Picking a few assets needs per-icon normalization and provenance review. | Repository [MIT license](https://github.com/material-extensions/vscode-material-icon-theme/blob/main/LICENSE), but README cites Material Design Icons and Material Symbols as sources. Avoid importing its full theme or Office-like letter marks for a small Mimir list. |
| [Google Material Symbols Rounded](https://fonts.google.com/icons) (official repository [README](https://github.com/google/material-design-icons/blob/master/README.md); npm SVG distribution [`@material-symbols/svg-400@0.48.0`](https://www.npmjs.com/package/@material-symbols/svg-400), accessed 2026-10-12) | Cohesive **24px** generic glyphs that remain distinguishable when rendered at 20–22px; SVGs can use `currentColor` and Mimir's existing theme infrastructure. Selective local assets avoid a full icon-font download or the SVG package's ~13 MB unpacked source. | [Apache-2.0](https://github.com/google/material-design-icons/blob/master/LICENSE); official README explicitly permits product incorporation/remixing. Use generic shapes, no Google Workspace logos or third-party brand marks. **Recommended.** |

### Recommended mapping and treatment

Use Material Symbols Rounded's generic filled pictograms (selected 24px SVGs, rendered in a 22px slot) with a small, theme-tested semantic color set. The official CDN URLs below were checked to return SVG on 2026-10-12; vendor only the selected Apache-2.0 assets into the app for deterministic offline use, or use a selective package import. Preserve license notice. Avoid downloading assets dynamically at runtime.

| Mimir type | Generic glyph | Color role | Reference asset |
| --- | --- | --- | --- |
| DOC/DOCX/ODT/RTF, TXT | document with text lines | blue for office documents; neutral for plain text | [`description`](https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsrounded/description/default/24px.svg) |
| XLS/XLSX/ODS, CSV | table grid | green | [`table_chart`](https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsrounded/table_chart/default/24px.svg) |
| PPT/PPTX/ODP | slide with play marker | amber/orange | [`slideshow`](https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsrounded/slideshow/default/24px.svg) |
| PDF | page with PDF geometry | red | [`picture_as_pdf`](https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsrounded/picture_as_pdf/default/24px.svg) |
| HTML/HTM, code | brackets | cyan/teal | [`code`](https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsrounded/code/default/24px.svg) |
| Markdown or Mimir note | text lines | neutral/purple accent only for note if desired | [`notes`](https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsrounded/notes/default/24px.svg) |
| Image/audio/video | image, music-file, video-file | restrained media family | [`image`](https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsrounded/image/default/24px.svg), [`audio_file`](https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsrounded/audio_file/default/24px.svg), [`video_file`](https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsrounded/video_file/default/24px.svg) |
| Archive | zipped folder | neutral/ochre | [`folder_zip`](https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsrounded/folder_zip/default/24px.svg) |
| Unknown | generic file | neutral | [`draft`](https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsrounded/draft/default/24px.svg) |

Use the icon as the quick cue and the **real filename suffix as the explicit confirmation**. Keep icon and suffix visible when the name truncates, and preserve the existing title/tooltip. Test the busiest library list and card view in both light/dark themes at the current 22px slot; specifically verify PDF, DOCX, XLSX, PPTX, HTML, notes, and unknown types without reading the filename. The selected Material Symbols are assets for file identity; `project/design.md` §1 and §7.1 still direct ordinary navigation/action controls to Lucide.

## Related specs

- `.trellis/spec/project/design.md:7-9,21,126-128,156-158` — content-first, Lucide for product actions, compact icons, scannable library.
- `.trellis/spec/renderer/frontend/conventions.md` — shared browser/desktop renderer and token-based light/dark styles.
- `.trellis/spec/renderer/frontend/theme/conventions.md` — appearance variants and contrast rules.

## Caveats / Not Found

- OneDrive's exact current product UI screenshot was not available in this pass; the Microsoft-maintained icon package and size-specific asset registration are the concrete public reference. Visual conclusions are limited to those assets, not every OneDrive deployment.
- Obsidian Help did not establish an official file-type icon/color system. Its role in this recommendation is surrounding layout and density.
- Google-served Drive PNGs are evidence of the visual pattern, not assets with a license to redistribute. They may change without versioning.
- WeKnora source was pinned to `v0.8.2`; its live site at `https://weknora.weixin.qq.com/` can deploy a newer visual version. The source evidence above applies specifically to the public tag.
- Material Symbols shapes should be checked at 20–22px in Mimir's actual list before locking the final asset/color mix. Colors require light/dark contrast verification in the project's token system; static competitor hex values should not be pasted into component styles.
