# CI real MinIO fixture correction

Date: 2026-10-20. Scope: `.github/workflows/ci.yml` S3 fixture only. No production changes, skipped tests, third-party service, test budget changes, or S3 assertion changes.

## Observed failure and official distribution evidence

CI run `39389655084` had already passed `pnpm check`, build, and PostgreSQL tests. `github-ci-s3-failed.log` shows the S3 step exited 125 while pulling `minio/minio@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e`; the integration tests never began.

The official historical release README recommends `quay.io/minio/minio`, but current anonymous registry checks fail as well: two historical tags and latest were unavailable, the anonymous bearer token permitted no pull actions, and a real `docker pull --platform linux/amd64` for that digest returned HTTP 401. No official OCI digest was invented or replaced with a third-party image.

Current official source snapshot [`7aac2a2c5b7c882e68c1ce017d8256be2feea27f`](https://github.com/minio/minio/blob/7aac2a2c5b7c882e68c1ce017d8256be2feea27f/README.md#source-only-distribution) says community MinIO is now distributed as source only and lists historical GitHub Releases as available legacy binaries. The old `dl.min.io` archive endpoint returned 410. The coordinator authorized the minimal verified official historical binary fixture instead of the unavailable image.

## Fixed official bytes

- Official release: [`RELEASE.2025-09-07T16-13-09Z`](https://github.com/minio/minio/releases/tag/RELEASE.2025-09-07T16-13-09Z), published `2025-09-07T18:53:04Z`.
- Release tag object `01ce918d8279a20e4706b96a64396146894adee4` points to source commit `07c3a429bfed433e49018cb0f78a52145d4bedeb`.
- Binary: `minio.linux-amd64.RELEASE.2025-09-07T16-13-09Z`, asset ID `404655976`, size **110,989,496** bytes. Fixed official API download: `https://api.github.com/repos/minio/minio/releases/assets/404655976` with `Accept: application/octet-stream`.
- SHA256: `7c5bd8512c6e966455b1d198209358b2d191c77a83ab377c4073281065fb855f`.
- Independent official checksum asset `404655965` (`minio.linux-amd64.RELEASE.2025-09-07T16-13-09Z.sha256sum`) was anonymously downloaded. Its contents, the binary asset's GitHub API `digest`, and the complete locally downloaded binary's SHA256 all match.
- Both downloads used unauthenticated `curl` against the official API, following its redirect; no GitHub token or signed redirect URL is recorded. Direct github.com download connectivity on this host failed, while the official API route succeeded.

The workflow pins this asset ID and SHA, emits its actual version, and runs it directly on the native Linux x64 CI runner. API and console bind only to `127.0.0.1`. Existing S3 fixture credentials, readiness checks, and the exact test invocation are preserved. EXIT cleanup targets only its owned PID, gives TERM five seconds then KILL if necessary, waits/reaps it, and removes the mkdtemp fixture root. A download/hash/startup failure remains a failing S3 step.

## Real execution and checks

Local host is ARM64, so the verification deliberately ran the exact **Linux AMD64** ELF binary under Colima's AMD64 emulation. A temporary scratch image only wrapped the downloaded static binary (no base/third-party MinIO image). Image inspect reported `linux/amd64`; the actual binary emitted:

```
minio version RELEASE.2025-09-07T16-13-09Z (commit-id=07c3a429bfed433e49018cb0f78a52145d4bedeb)
Runtime: go1.24.6 linux/amd64
```

Against that real MinIO server and existing test credentials, Node **22.23.1** ran the unchanged command:

```
pnpm --filter @mimir/plugin-storage exec vitest run src/s3.integration.test.ts
```

Result: **1 test file, 2 tests passed**, duration 2.40s. These are the existing real byte roundtrip/Chinese-key CopySource/idempotent deletion/probe assertions and the **1002-object** LIST pagination assertions. No fake endpoint was used. Raw successful output is `ci-diagnostics/official-minio-amd64-s3-tests.log`; the reproduction wrapper is `ci-diagnostics/minio-amd64-probe.sh` (assumes the fixed binary is downloaded to `/tmp/mimir-minio-linux-amd64`).

`oxfmt --check .github/workflows/ci.yml`, `actionlint .github/workflows/ci.yml`, and `git diff --check` passed. Actual native Ubuntu CI execution of the new download/process lifecycle remains for the next push; local S3 tests exercised the same verified Linux x64 bytes, not the host's ARM build.

Colima was initially stopped and the Docker context was `default`; it was temporarily started, no pre-existing containers were running, only the owned test container and image were created/removed, and final state was restored to **Stopped** plus **default** context. Evidence: `ci-diagnostics/minio-colima-restored.log`. No other containers were changed.

## Required project reference comparison

Reused verified WeKnora evidence from `research/distribution-evidence.md`: official site, public release `v0.8.3`, source snapshot `8dab7550f5069ef80877a65b52dc5483c45f7827`, `.github/workflows/app.yml`. Its Go/Rust desktop build does not establish availability of MinIO's external container registry or replace Mimir's real S3 adapter assertions. This fix follows MinIO's own official source/distribution evidence and actual pinned-byte execution.
