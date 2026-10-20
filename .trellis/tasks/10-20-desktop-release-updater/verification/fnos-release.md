# fnOS unified stable release: implementation and evidence

2026-10-20. User extension: publish a native fnOS package together with the desktop clients. The already running `v0.1.1` desktop baseline is preserved. Parent coordinates the next stable version (`0.1.2`), tags, GitHub runs and actual publication; this implementer does not change versions, commit, push or publish.

## Release flow

`desktop-release.yml` keeps its four native desktop builds and invokes the local reusable `fnos-build.yml` with the version gate's exact output. `aggregate` requires both the complete desktop matrix and the fnOS job, then downloads `fnos-x64` to `incoming/fnos-x64`. A failed reusable job or missing artifact prevents aggregation and publication. Manual dispatch still creates artifacts only; the single publish job retains the existing stable-tag-only condition and sole `contents: write` permission.

The committed version gate now reads **both** `apps/desktop/package.json` and `apps/fnos/manifest`. `validateCommittedReleaseVersion(desktopVersion, fnosManifestText, tag?)` rejects differing, missing, duplicated or padded fnOS versions, as well as unstable or mismatched tags. Only these two release identities advance; unrelated workspace package versions remain independent.

`targets` remains the four Electron targets, preserving the existing package verifier and builder consumers. New `releaseTargets` adds `fnos-x64` with fixed `platform=linux`, `arch=x64`, `.fpk`, and `updateMode=manual`.

The established CLI is extended without an override:

```sh
node apps/desktop/scripts/release-artifacts.mjs stage apps/fnos/release staged/fnos-x64 fnos-x64 X.Y.Z manual
```

It requires the nonempty regular file `mimir-X.Y.Z-fnos-x64.fpk`, hashes its real bytes, and writes `build-manifest.json`. Every staged target's manifest now includes `targetKey/platform/arch/version/updateMode` and asset name/size/SHA-256/SHA-512. Aggregate verifies all five identities and every actual asset byte set before creating the complete output directory. fnOS rejects automatic mode, incorrect architecture/platform/version, missing FPK, duplicate or unexpected manifest entries, and Electron YAML or blockmap entries. Both mac architectures still share one correctly merged `latest-mac.yml`.

The final release manifest requires the FPK alongside all existing desktop assets. The publisher independently rechecks downloaded regular files, sizes and **both** digests before remote mutation. After upload, every remote asset, including the FPK, must match size and SHA-256 before the sole draft-to-stable/latest operation. Upload/digest failure keeps the draft unpublished; published Releases and unrelated drafts remain immutable.

FPK is **not** listed in Electron updater YAML, cannot be auto-installed by Electron, and remains managed through fnOS's normal installation/upgrade mechanism. Desktop updater runtime and official-baseline harness are unchanged; historical Releases without an FPK are not reinterpreted or modified.

## Build/aggregate verification boundary

The native build owner independently validates the real fnpack archive: its embedded `manifest` identity/runtime and `app.tgz`, deployed Linux x86_64 native modules, and feasible host smoke checks before staging. The aggregation layer verifies the trusted build's platform/architecture envelope and exact hashes; it does not re-extract the large FPK or claim that arbitrary named fixture bytes constitute an installable FPK.

The release regression tests use real on-disk fixture bytes and real SHA-256/SHA-512 calculations for all five targets. These establish the transport, completeness and publication ordering contracts. Actual fnpack packaging, GitHub runner execution, anonymous published FPK download, and real fnOS device installation/upgrade require separate evidence from the native build and parent sessions.

## Local checks

Passed under Node **22.23.1**:

```sh
/Users/admin/.nvm/versions/node/v22.23.1/bin/node --test apps/desktop/scripts/release-artifacts.test.mjs
```

**18/18 tests passed.** Exact command, output and observed exit 0 are archived at `verification/ci-diagnostics/fnos-release-tests-node22.log` (ignored log; explicit force-add needed). Coverage includes:

- Exact committed version agreement and stable tags.
- Five-target aggregation with exact FPK byte preservation and no FPK references in the three Electron YAML files.
- Missing fnOS artifact, tampered FPK, wrong manifest target/platform/architecture/version/mode, malformed digests/sizes, duplicate entries and unexpected updater metadata.
- No draft creation with a missing FPK; FPK-specific upload and remote-digest failure cannot publish an otherwise complete desktop release.
- Post-download FPK tampering and independently changed size/SHA-256/SHA-512 rejected by the publisher's local directory validation.
- Existing real electron-builder naming, mac metadata, signing mode, immutable published Releases and owned-draft recovery behavior.

The actual committed version CLI also returned `0.1.1` after the native owner synchronized the fnOS manifest. Focused source lint, formatting and Node syntax checks pass. Full repository quality gate, reusable-workflow actionlint, real Linux fnpack build and remote integrated publication are coordinated with the other owners and recorded separately; these local tests do not stand in for them.

Owned changed files: `release-artifacts.mjs`, `release-artifacts.test.mjs`, `publish-release.mjs`, `desktop-release.yml`, README release/download instructions and this verification report. No changes to fnOS build implementation, root package scripts, updater code or release tags by this implementer.
