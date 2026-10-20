# Publisher exact-tag independent review

2026-10-20. Reviewed frozen `publish-release.mjs`, `release-artifacts.test.mjs`, the current `desktop/runtime/releases-updates.md` contract and `github-release-403-fix.md`. No implementation correction was necessary. No commit, push, tag movement or GitHub mutation was performed by this checker.

## Findings (fixed)

None. No new implementation defect found.

## Findings (not fixed)

- Successful official create/upload/publish using the corrected payload still requires the next real tag workflow. Unit/fixture tests and read-only API probes do not establish that remote acceptance. Failed `v0.1.2` remains unchanged.
- The historical failure matches GitHub's documented target/workflow permission condition; its old publisher discarded the response message. This review confirms the contract and correction, not a newly captured original response body.

## Official contract and code path review

Independently fetched the official [Create a release documentation](https://docs.github.com/en/rest/releases/releases#create-a-release) anonymously. It explicitly describes additional workflow-write authorization for the resolved target's workflow difference from the default branch, notes GITHUB_TOKEN cannot receive that permission, and says the target parameter is unused when the tag already exists. Omitting that redundant creation parameter agrees with the intended existing-tag flow without expanding credentials.

- Local manifest/tag/HEAD checks and downloaded regular-file size/SHA256/SHA512 preflight remain in the actual CLI before remote mutations.
- `resolveReleaseTag` reads the official Git ref and peels annotated tag objects with finite depth, SHA format/type and cycle validation. Before draft creation/recovery and immediately before publication, the resolved remote commit must equal the build's exact 40-character SHA. A mismatch leaves assets unpublished; no tag operation is implemented.
- Create payload omits `target_commitish`. Draft recovery requires exact tag and build marker, permitting legitimate default-branch creation metadata. Already public releases, wrong-marker/tag drafts and unknown draft assets still fail before deletion/upload.
- Five-target manifests, existing partial draft handling, every uploaded asset's size and digest, and final single publication call remain intact. The final remote tag check follows digest checks.
- API diagnostics keep method/path/status, server message, permission header and request ID; they redact the known token and HTTP URLs, omit request query strings, bound text length and do not log Authorization or raw responses. Tests exercise token, body signed-URL query and request query removal plus non-JSON failure.

## Verification

- Node22.23.1 release behavior suite: **23/23 pass**, 0 skip. Independent log `publisher-independent-check.log`.
- Node22 current full root Node test list: **58/58 pass**, 0 skip. Independent log `publisher-root-node22-check.log`; includes all pre-existing root entries.
- Two changed mjs files: oxlint, oxfmt and Node syntax pass. `git diff --check`: pass.
- Independently executed the actual resolver with anonymous official API readers: Mimir annotated `v0.1.2` resolved to `1c7e8230406759874cf316bbbd971338108dcda2`, matching local `v0.1.2^{commit}`; MinIO annotated `RELEASE.2025-09-07T16-13-09Z` resolved to `07c3a429bfed433e49018cb0f78a52145d4bedeb`. The lightweight ref branch is covered by the behavior fixture, not mislabeled as these annotated live tags.
- No TypeScript changed and the prior complete Node22 repository gate remains recorded. This narrow publisher correction did not require another unrelated full monorepo run.
