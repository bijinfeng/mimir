# Windows resource gate independent review

2026-10-20. Focus: `package-resources.mjs` and tests, frozen Windows installed-smoke workflow changes, and the narrow server Vite AWS SDK external declaration. fnOS native packaging was independently reviewed elsewhere; this check does not repeat that build.

## Findings (fixed)

- `.github/workflows/desktop-release.yml`: added a 15-minute timeout to the Windows installed-smoke step. The installer already has a five-minute deadline and the uninstaller parent has a 60-second wait; the step timeout additionally bounds resource enumeration and the smoke invocation so a failure can proceed to evidence upload before the overall job timeout.

## Findings (not fixed)

- Cleanup uses the returned uninstaller process's `WaitForExit(60000)`. An NSIS uninstaller can spawn a temporary copy, so the “cleanup complete” phase alone does not prove every descendant has exited. This is a cleanup/evidence limitation, not a substitute for the preceding real installed application checks; installation resource comparison and full A/B/C smoke remain required. No cleanup success claim should be treated as installed application or upgrade acceptance.
- The fresh deployed S3 runtime probe is owned by the implementation agent. Its subsequently completed report, `github-windows-install-fixes.md`, records a successful Node22 relocation outside the checkout, SDK resolution within that deployment, 12 signed HTTP requests through the real built storage adapter and standard-account production-host HTTP checks. This checker reviewed that evidence without repeating its deployment. The narrow explicit `@aws-sdk/client-s3` external declaration preserves `preserveModulesRoot`, server entry paths and native dependency declarations; Windows installed acceptance remains separate.
- Real Windows runner execution and actual cross-version updates were not run by this review. The previous installed-smoke failure remains unresolved until the new runner passes.

## Verified code paths

- The expected manifest comes from the actual packaged `win-unpacked/resources/server` tree before executing the real NSIS installer. The installed tree is independently enumerated and checked before its application is launched.
- Every regular file is compared by canonical relative path, size and SHA-256. Missing, extra and mutated files fail; links, special files and unsafe manifest paths fail. Capture output inside the source tree is rejected.
- The workflow retains the real installer, full installed A/B/C smoke and failure artifact upload with phase logs, both inventories and detailed mismatch output. No direct-install shortcut or weakened startup assertion was introduced.
- fnOS is an aggregate prerequisite alongside the four desktop targets; this review did not change that integration.

## Verification

- Node **22.23.1**: `node --test apps/desktop/scripts/package-resources.test.mjs apps/desktop/scripts/resource-tree.test.mjs` — **10/10 pass**. Tests exercise real copied trees and actual bytes, including same-size mutation and relocation.
- `pnpm exec oxlint apps/desktop/scripts/package-resources.mjs apps/desktop/scripts/package-resources.test.mjs apps/server/vite.config.ts` — pass.
- `pnpm exec oxfmt --check` on those three files and `.github/workflows/desktop-release.yml` — pass, including after the timeout fix.
- `pnpm --filter @mimir/server typecheck` and `pnpm --filter @mimir/desktop typecheck` — pass with local Node **25.9.0**. These are scoped type checks, not a new Node22 full-repository gate.
- `/tmp/mimir-actionlint/actionlint .github/workflows/desktop-release.yml` — pass after the timeout fix.
- No full repository gate, Windows installation, public Release or actual upgrade acceptance is claimed by this focused review.
