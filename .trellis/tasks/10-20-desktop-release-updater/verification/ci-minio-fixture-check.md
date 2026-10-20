# Independent MinIO CI fixture review

2026-10-20. Scope: frozen `.github/workflows/ci.yml` S3 fixture correction. No implementation edit, commit, push or additional full repository test run by this checker.

## Findings (fixed)

None. No new implementation defect was found.

## Findings (not fixed)

- Native Ubuntu execution of the new CI download/start/cleanup shell remains for the next GitHub run. The author's real S3 execution used the exact Linux AMD64 binary under Colima emulation on ARM64, not a native Ubuntu runner; those evidence boundaries remain explicit.
- The historical binary is fixed test infrastructure bound to loopback, not a product dependency or externally exposed service. This review does not establish compatibility with every MinIO/AWS version.

## Official provenance independently checked

Used unauthenticated `curl` against the official public `api.github.com/repos/minio/minio` metadata endpoints, with no token or signed redirect URL:

- Asset `404655976`: name `minio.linux-amd64.RELEASE.2025-09-07T16-13-09Z`, state uploaded, size **110989496**, digest **sha256:7c5bd8512c6e966455b1d198209358b2d191c77a83ab377c4073281065fb855f**. Its official browser download URL belongs to that same MinIO release.
- Tag `RELEASE.2025-09-07T16-13-09Z` resolves first to annotated tag object `01ce918d8279a20e4706b96a64396146894adee4`, which resolves to commit **07c3a429bfed433e49018cb0f78a52145d4bedeb**.
- The frozen workflow uses the exact official API asset with `Accept: application/octet-stream`, anonymous redirects and the exact fixed SHA256. The author's checksum-asset and full binary verification evidence is recorded in `ci-minio-fixture-fix.md`; this checker did not download another 111MB copy merely to repeat that successful check.

## Actual shell and test path review

- Under the Ubuntu Actions default Bash fail-fast shell, failed download, checksum, version execution, final readiness probe or Vitest command fails the step. The script contains no success fallback for these commands. Cleanup is registered before download; only owned process cleanup tolerates already-exited processes.
- A fresh mkdtemp root owns binary, data and server log. API and console bind explicitly to **127.0.0.1:19000/19001**. The direct background command's `$!` identifies the owned server; EXIT cleanup sends TERM, waits up to five seconds, then KILL/reaps and removes that root. There is no global process-name kill or unrelated container operation in the CI implementation.
- `plugins/storage/src/s3.integration.test.ts` is unchanged, and the exact existing test invocation and opt-in credentials remain. Its two real cases retain byte roundtrip, Chinese-key copy/missing old key, idempotent deletion/probe, and **1002-object LIST pagination** assertions. No mock endpoint, skipped assertion or budget change was introduced.
- Reviewed `official-minio-amd64-s3-tests.log`: checksum OK, image architecture linux/amd64, binary reports the exact release/commit and `go1.24.6 linux/amd64`, original **2/2 tests pass**, wrapper exit0. Reviewed `minio-colima-restored.log`: the temporary owned image was removed, Colima stopped and context returned to default.

## Verification

- `actionlint .github/workflows/ci.yml`: pass.
- `oxfmt --check .github/workflows/ci.yml`: pass.
- Extracted the actual YAML S3 `run` block with the project's YAML parser and passed that block to `bash -n`: pass. The reproducible local wrapper separately passed `bash -n`.
- S3 integration source diff: empty. `git diff --check`: pass.
- No TypeScript or product runtime file changed; the latest comprehensive Node22 `pnpm check` exit0 remains applicable as previously recorded. This fixture's actual native CI S3 acceptance must be confirmed separately after push.
