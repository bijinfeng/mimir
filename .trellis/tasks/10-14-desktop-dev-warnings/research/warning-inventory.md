# desktop:dev warning inventory (2026-10-14)

## Reproduction

- Ran `npm_config_manage_package_manager_versions=false pnpm desktop:dev` in the repository root. The environment override keeps the already-installed pnpm 12.4.1 from trying to provision the repository's declared 12.4.2; it does not change the project build.
- Server and desktop builds succeeded. Electron launch then failed: the installed `electron@44.7.0` package has no downloaded binary, and its download attempt returned `TypeError: fetch failed`. Thus the watch process did not start in this run.
- Re-ran `pnpm --filter @mimir/desktop build` with output saved at `/private/tmp/mimir-desktop-build-20261014.log`; `pnpm --filter @mimir/server build` produced no warning matches. The build log is the source for counts below.

## Build diagnostics

| Source | Count | Evidence | Likely treatment |
| --- | ---: | --- | --- |
| React Compiler, project-owned code | 25 | `packages/renderer/src/routes/_app.tsx:230`; `components/DocumentPanel.tsx:114,121,359,391`; `components/AvatarCropper.tsx:185`; `components/document/MarkdownBody.tsx:42-43`; `components/document/FilePreview.tsx:192`; `packages/chat/src/runtime/DocxInterruptBridge.tsx:298-634` (14 diagnostics); `packages/office/src/editors/use-source.ts:134`, `PdfEditor.tsx:972` | Refactor unsupported control flow without changing error and cleanup semantics. |
| React Compiler, immutable GenOffice vendor | 1 | `packages/office/vendor/apps/html/src/renderer/source/SourceEditor.tsx:92` suppresses a React hook rule. Vendor is fixed at `GenOffice@480548fd55f1be3593ee0d8e316a734751d58309` and `.trellis/spec/office/engine/conventions.md` forbids editing `vendor/`. | Scope compiler to project-owned React code; keep vendor as dependency source. Do not disable compiler globally. |
| Unresolved font URLs | 4 | Vendored `fonts.css:16-37` references `@genoffice/ui/fonts/Carlito-{Regular,Bold,Italic,BoldItalic}.ttf`, but those files are absent from this repo and its selected vendor closure. Vite leaves URLs unresolved at runtime. | Supply licensed metric-compatible assets through the local font pipeline and rewrite URLs outside `vendor/`; validate emitted files. |
| Ineffective dynamic imports | 2 | `packages/renderer/src/components/document/MarkdownBody.tsx:42-43` dynamically imports `@tiptap/core` and `editor/extensions`, but `NoteEditor.tsx` and Tiptap extensions already import them statically. | Remove ineffective dynamic split while preserving StrictMode cleanup and read-only rendering. |

The desktop renderer uses React Compiler in `apps/desktop/electron.vite.config.ts:94-100`; the Web renderer has the same setting in `apps/web/vite.config.ts`. The shared-code fixes should therefore be checked in both builds. The project rule in `.trellis/spec/project/rules.md` forbids disabling React rule diagnostics or globally turning off the compiler.

## Reference relevance check

The project-required WeKnora check was attempted against its public site and `Tencent/WeKnora` source on 2026-10-14; both live requests timed out with zero bytes in this sandbox. The last recorded public-source check in `.trellis/tasks/10-12-multi-format-agent-edit/research/reference-check.md:8-12` pins WeKnora `v0.8.2` (2026-09-24) and cites `internal/agent/tools/definitions.go` for knowledge search/read/list and Wiki write tool definitions. That source concerns knowledge-base Agent capabilities, not Electron, Vite, React Compiler, or font packaging; it supplies no implementation model for this task. The relevant upstream for file-rendering assets is the pinned GenOffice version above.
