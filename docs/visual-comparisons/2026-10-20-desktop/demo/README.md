# Desktop module16 real component archive

The browser demo mounts actual `SetupPage`, `TitleBar`, `WindowControls`, and the Desktop About route with the real Mimir theme provider and renderer QueryClient. It injects a contract-shaped in-memory `window.mimirDesktop` fixture before importing Desktop bridge consumers. No Electron renderer, preload or main process runs here.

Open through the repository HTTP service, for example:

- `dist/before/index.html?scene=setup-first&width=1100&height=760`
- `dist/after/index.html?scene=setup-first&width=1100&height=760`

The before build is frozen against Git `53285bbdeaa17475e04aae517f07c957776cb6b6`; its exact harness is in `source-before/`. `build-manifest.json`, `baseline-build-freeze.json`, each bundle's `source-manifest.json`, and `license-manifest.json` preserve resource/source provenance. Original dependency notices are in `licenses/`.

## Scenes and controls

`scene` supports `setup-first`, `setup-local`, `setup-cloud`, `setup-loading`, `setup-read-error`, `choose-pending`, `choose-failure`, `choose-success`, `bridge-missing`, `about`, `about-loading`, `about-error`, `about-long`, `titlebar`, `titlebar-collapsed`, `titlebar-login`, and `window-controls`.

- `setup-loading` defers the actual component's mode read; helper controls resolve/reject that promise.
- `setup-read-error` rejects the first read, then the actual Retry reads successfully.
- `choose-pending` defers choose; `choose-failure` returns a fixed server connection failure; `choose-success` calls the actual activate callback but logs instead of navigating. Existing cloud scenes share a fixed long URL.
- `about-loading` defers boot. `about-error` rejects the first three boot calls: the actual QueryClient retries twice, exposes the error, and the actual Retry succeeds on the fourth call. Do not claim an error before those retries finish.
- `window-controls` supports `maximized=1` and `omit=maximize`. The helper can emit a simulated external maximize event; component subscriptions remain real.
- `bridge-missing` injects no bridge before dynamic imports.

`theme=light|dark`, `platform=win32|linux|darwin`, `width`, `height`, and optional `cloudUrl` select stable inputs. `capture=1` hides the helper; **Alt+Shift+H** toggles it back. The helper styles only the composition/frame, never product selectors. Use `capture-scenarios.json` for the eight matched screenshot procedures; screenshots are captured by the parent's actual CUA browser interaction.

The CUA screenshot API produced **JPEG bytes**. Earlier naming conventions used `.png` paths; those historical extensions and original bytes are retained, without transcoding. Browsers display them normally. `capture-manifest.json` records `actualMediaType: image/jpeg`, exact dimensions and SHA256 for every screenshot; filenames must not be read as a format claim.

## Size and evidence boundaries

The actual Desktop `createWindow()` defaults to **1440×900** and defines **no minimum width or height**. 1100×760 is the normal archive reference; 800×480 is a short-height check; 390×400 is an explicit pressure check and does not establish a production minimum size.

The demo proves browser rendering of real components and callback wiring against a controlled bridge. It does **not** prove native IPC, draggable areas, double click, macOS traffic lights, minimize/maximize/close results, native application menus, native dialogs, file permissions, navigation, Session/cookie isolation, local host startup, persistent configuration or shutdown. Those remain native-only paths in the source index and require separate native evidence. Simulated success is never described as persisted mode activation.

The coordinator's separate native smoke evidence is saved in [`../native-smoke.txt`](../native-smoke.txt). Its assertions and scope must be read from that log; the browser screenshots do not expand that native coverage.

The searchable `../interactions.html` and `../coverage-map.json` index 19 overlapping surface families and exact source snapshots. These counts are not independent actions or GUI passes. The generated, ignored `routeTree.gen.ts` has no fixed-baseline Git blob and is explicitly excluded from source snapshots; its original research record remains available.

## Rebuild and verification

After the coordinator freezes product changes, run `GALLERY_BUILD_VARIANTS=after python3 .trellis/tasks/archive/2026-10/10-20-interaction-desktop/gallery/build-archive.py` from the repository. Do not rebuild the frozen before bundle. Run `build-interactions.py`, then `build-comparison.py` once both actual screenshot sets exist. The comparison builder rejects missing screenshots or dimensions differing from the declared viewport. `verify-builds.py` checks every frozen/current resource and exact own-source provenance.

Generated bundles must stay under literal `dist/` directories and must not be run through lint/format tools. License notices retain their original bytes.
