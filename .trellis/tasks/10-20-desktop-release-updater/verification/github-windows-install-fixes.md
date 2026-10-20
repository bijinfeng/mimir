# Windows installed NSIS failure: evidence and narrow build correction

## Failure evidence

GitHub run `39382724734`, Windows job `118495490383`, tag `v0.1.1`; exact log: `github-v011-windows-failed.log`. Build output reports the generated AWS `check-content-length-header.js` (line 866). Native/ASAR checks and unpacked smoke A/B/C passed. After NSIS installation, local-mode smoke A failed with `ERR_MODULE_NOT_FOUND` for that file, imported through a generated relative path from SDK `commandBuilder.js` (line 1824); setup/cloud smoke B/C passed.

Packaged `resolvePaths()` always selects `process.resourcesPath/server/dist`; it does not fall back to the workspace server build. The failing generated import is relative, so ordinary bare-package ancestor resolution cannot supply it. A separate bare dependency could still be masked when unpacked output is run inside the checkout, hence the relocated verification below.

The missing file's path relative to app root is 210 characters; the reported installed path is 239, unpacked runner path 259. Default electron-builder 26.15.3 NSIS extracts 7z through `$PLUGINSDIR/7z-out` before `CopyFiles`; plausible runner temp paths produce 263–266 characters for this file. The actual failing `$PLUGINSDIR` was not captured. Intermediate path overflow is a hypothesis, not a demonstrated cause. No compression or differential-update setting was changed.

## Confirmed build contract drift and correction

Installed Vite is 8.3.4. `createIsConfiguredAsExternal()` in Vite's `dist/node/chunks/node.js` calls `tryNodeResolve(id, undefined, ...)` for build-time default SSR externalization, using the server root rather than the importing workspace plugin. Under the isolated pnpm layout, `createRequire(server/package.json).resolve('@aws-sdk/client-s3')` fails; the same lookup from `plugins/storage/package.json` succeeds. Thus this third-party dependency was inlined despite the server's documented external-dependency contract, emitting deep `.pnpm` ESM modules.

Only `@aws-sdk/client-s3` is imported by production storage code; no presigner entry exists. `apps/server/vite.config.ts` explicitly adds this one package to `ssr.external`, retaining all workspace source compilation and existing output paths. A clean Node22 build now emits a bare SDK import in compiled storage and zero generated AWS chunks. Hoisted production deployment supplies the SDK CJS entry and transitive graph. This fixes demonstrated build drift; whether it fixes the observed installed startup failure remains for a Windows run.

## Verification actually executed

All commands used Node 22.23.1 where noted and exited 0; exact command/output logs live in `ci-diagnostics/`:

- `windows-server-build-node22.log`: real server build, zero generated AWS chunks independently checked.
- `windows-server-deploy-node22.log`: fresh production hoisted deploy.
- `windows-server-typecheck-node22.log`: scoped server typecheck.
- `relocated-s3-host-node22.log` plus reproducible `relocated-s3-host-probe.mjs`: full deployment copied outside the checkout; 56,676 files passed link portability validation. SDK resolution asserted inside the canonical relocated deployment. Built storage adapter sent 12 real signed SDK HTTP requests to an in-process S3 protocol fixture: byte roundtrip, Chinese-key copy, missing old key, list, idempotent remove, and probe passed. This is not an AWS/MinIO compatibility test. The relocated production server applied fresh SQLite migrations, bootstrapped the standard test account, and returned real HTTP 200 for sign-in, session, documents, and folders; server/database/fixture and temporary data were cleaned up.
- Focused `oxlint`, `oxfmt`, `git diff --check`, and joint desktop/fnOS `actionlint` passed. Independent checker ran resource behavior tests and recorded `windows-resource-check.md`.

The first diagnostic fixture attempts failed on macOS canonical `/var` alias comparison, a fixture LIST prefix slash, and the fixture sign-in missing browser Origin. These fixture mistakes were corrected before the successful recorded run; none was a product-code failure.

## Next native Windows evidence

The workflow captures full unpacked server relative paths/sizes/SHA256, installs the real NSIS executable, captures the installed tree, and strictly verifies exact set and bytes before unchanged smoke A/B/C. Installation has a five-minute bound and cleanup a sixty-second bound; stage logs include temp roots and observed newly created NSIS temp directory paths. Failure artifact contains only the installer, resource inventories, phase logs, and resource mismatch diagnostics; it excludes userData and file contents.

Current local pnpm12 hoisted deployment additionally contains physical backing-store copies beneath `node_modules/.pnpm`, including a 251-character SDK relative path, versus 131 for its normal hoisted path. These remain included. No unproven cache pruning was introduced; strict Windows inventory will report any installation loss, including unused backing copies. Windows installed smoke and actual updater cross-version acceptance are still pending the next native Actions run.
