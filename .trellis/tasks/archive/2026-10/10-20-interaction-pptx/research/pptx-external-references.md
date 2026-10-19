# Research: PPTX external reference evidence

- Query: Check WeKnora current site/source and choose applicable Office presentation interaction references.
- Scope: external
- Date: 2026-10-20 (Asia/Shanghai; network retrieval timestamps are2026-10-19T19:51–19:52Z)

## Findings

### WeKnora required site and public source check

- Site https://weknora.weixin.qq.com/ returned HTTP200. Its real description meta explicitly advertises **v0.8.3**, gallery, multimodal Embedding, original citation positioning, on-demand attachments and platform user management. Exact extracted meta is `weknora-site-excerpt.txt`; original response SHA256 and request/finalURL/status/bytecount are in `external-fetch-evidence.json`.
- GitHub latest release https://api.github.com/repos/Tencent/WeKnora/releases/latest returned **v0.8.3**, published **2026-10-14T07:53:24Z**. Retained selected metadata: `weknora-release.json`.
- Tag resolution https://api.github.com/repos/Tencent/WeKnora/git/ref/tags/v0.8.3 returned commit **3e22822c1d2397be730c458c7539d0eb8c113a24**; exact response in `weknora-tag.txt`.
- Public source README fetched successfully from GitHub contents API at this exact commit (base64 decoded without modification; `weknora-pinned-readme.txt`). Source: https://github.com/Tencent/WeKnora/blob/3e22822c1d2397be730c458c7539d0eb8c113a24/README.md . At source line49, it describes RAG lookup, multi-step agent and wiki on the same knowledge bases. At line330 its parser support table lists PDF/Word/PPT/Excel/etc. This supports Mimir knowledge ingestion and Agent context, **not** native slide editor toolbar design. No evidence here justifies copying WeKnora Markdown editing UI into PPTX.

### Primary PPTX references

1. **Microsoft PowerPoint (current hosted support article)**: https://support.microsoft.com/en-us/office/where-are-the-menus-and-toolbars-e25451c0-8a1f-428c-afb4-d91e98807bd4 redirects to https://support.microsoft.com/en-us/powerpoint/where-are-the-menus-and-toolbars ; HTTP200. Article states the Ribbon has purpose-based tabs, arrows expose further choices, and group dialog launchers open related detailed formatting. Extracted readable text retained in `powerpoint-ribbon-readable.txt`; no public semantic software version is provided. Application to Mimir: retain named tab/group discoverability; keep lengthy advanced formatting in contextual property tasks. This is public documentation evidence, not a captured Office web session.
2. **Google Slides (current hosted help)**: https://support.google.com/docs/answer/2763168?hl=en ; HTTP200. "Step2: Edit and format a presentation" lists add/edit/format text/shapes/lines, add/delete/organize slides and animations. Readable text retained in `google-slides-edit-2-readable.txt`. Application: distinguish slide organization, object formatting and presentation actions; preserve direct current selection context. No account/login or live Slides GUI was used. Earlier attempted help ID1697627 returned404 and is explicitly recorded rather than treated as evidence.
3. **GenOffice pinned presentation implementation**: repo `packages/office/vendor/UPSTREAM.json` pins **480548fd55f1be3593ee0d8e316a734751d58309** (synced2026-10-16). Public source `apps/slides/src/renderer/components/Ribbon.tsx` fetched at this commit through GitHub contents API; decoded exact source retained in `genoffice-ribbon.txt` and related public paths in `genoffice-pinned-slide-paths.json`. URL: https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/slides/src/renderer/components/Ribbon.tsx . Lines2–4 explicitly describe tab bar plus grouped buttons and warn some unimplemented entries are grayed placeholders; tab labels near163–173 include home/insert/design/animation and contextual table/chart tabs; dropdown gallery lifecycle near1305 is one at a time. Application: compatible native current selection operations and contextual property groups, using Mimir shell; **do not copy upstream placeholder capabilities or vendor source edits**.

### Evidence retention and exactness

`external-fetch-evidence.json` records requestURLs, finalURLs, retrieval timestamps, status, original byte lengths and original raw-response digests. Large website HTML and entire repository tree responses were reduced to extracted readable text/path index to avoid committing megabytes of irrelevant scripts; original response hashes remain recorded. GitHub source files are retained decoded exactly. The root `main` README request timed out; the exact version-pinned contents API succeeded and is the source cited above.

## Related specs

- Project AGENTS "Research reference": mandatory WeKnora site/source, exact version, concrete applicability; Office web/Google Docs/GenOffice for file editing.
- `.trellis/spec/office/frontend/editors/conventions.md` and `shell/conventions.md`: Mimir named groups, theme bridge, current selection, internal scroll and fixed primary action.
- `.trellis/spec/office/engine/page-structure.md`: no loss of original native relationships or save-baseline semantics.

## Caveats / Not Found

- Public docs offer information architecture patterns; none proves Mimir real widths, light/dark appearance, actual pointer/key interactions, native persistence or host support. Main implementation must verify these separately.
- No Office web or Google Slides logged-in GUI was operated, and no live WeKnora application was used. Claims above are website/source/documentation only.
- No version upgrade or vendor synchronization is proposed.
