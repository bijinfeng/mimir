# Validation (2026-10-14)

- The final `@mimir/desktop` production build and the `desktop:dev` startup plus
  first main/preload/renderer watch cycle produced none of the 32 inventoried
  warnings. Log: `/private/tmp/mimir-desktop-dev-escalated.log`.
- The Web build produced none of the inventoried Compiler, font URL, or dynamic
  import warnings. It still reports the existing 500 kB chunk size advisory for
  the large Office route; this is a bundle-size concern outside the desktop
  warning families. Log: `/private/tmp/mimir-web-build-final.log`.
- Four Carlito faces and `fonts/Carlito-LICENSE-OFL.txt` are present in each
  renderer output. A direct OXC probe with the configured `sources` showed that
  a Mimir component imports `react/compiler-runtime` and a vendor component
  does not; vendor still receives its TypeScript/JSX transform.
- After installing the missing Electron 44.7.0 binary from the configured
  mirror, `desktop:dev` reached `whenReady`, served the renderer, returned 200
  for local session/config/folder/document requests, and completed all three
  watch builds. The project's Electron smoke test passed all local, first-run,
  and cloud-mode assertions (`/private/tmp/mimir-desktop-smoke-after.log`).
- The approved quality-gate follow-up formatted one declaration in the vendor
  stylesheet with oxfmt, with no CSS value or selector changes. The old
  `@assistant-ui/react-ag-ui@0.0.63` continuation patch was rebased and
  registered for installed version `0.0.68`. Both unchanged-canvas retry and
  changed-canvas rejection tests pass. The full chat suite passed 60/60.
- `pnpm install --lockfile-only --frozen-lockfile --offline --trust-lockfile`
  passed with pnpm 12.4.1 after the patch entry was placed in the lockfile's
  canonical section. `pnpm install --frozen-lockfile --trust-lockfile` also
  passed and applied the patched dependency. The `--trust-lockfile` flag avoids
  a separate supply-chain metadata fetch unavailable in the local cache; it
  does not relax frozen lockfile consistency.
- Full `npm_config_manage_package_manager_versions=false pnpm run check`
  passed (log: `/private/tmp/mimir-check-final-escalated.log`). This includes
  lint, style lint, formatting, all package typechecks, and all repository
  tests. Notable suite counts: office 538, chat 60, renderer 332, server main
  331 plus local 10 and fnOS 4, desktop 48. The check emits existing lint
  advisories and a Vite `configLoader: native` advisory from desktop tests;
  neither occurs in the verified `desktop:dev` warning inventory.
- The first full-check attempt in the restricted sandbox timed out in server
  tests that use local ports. Re-running the same command with local-port
  access passed. Its failed log is `/private/tmp/mimir-check-final.log`.
- Final Web and desktop builds after the dependency patch both passed. The
  desktop build log has no target warning (`/private/tmp/mimir-desktop-build-post-gate.log`);
  the Web build retains only the previously noted 500 kB chunk advisory
  (`/private/tmp/mimir-web-build-post-gate.log`).
