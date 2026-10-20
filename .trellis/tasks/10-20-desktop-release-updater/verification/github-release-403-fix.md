# Release create 403: official contract and minimum publisher correction

Date: 2026-10-20. Scope: `publish-release.mjs` and existing release behavior tests. No remote mutation, credential scope request, permission change, tag movement, local release publication, or recovery workflow was performed by this implementer.

## Evidence

The coordinator observed all five build targets and aggregation succeed for `v0.1.2`, run `39390863778` attempt 2, but publish job `118538166693` failed creating the first draft with HTTP 403 despite job `Contents: write`. No existing draft/public release was present. The old publisher discarded the API message and permission header.

The current official [Create a release documentation](https://docs.github.com/en/rest/releases/releases#create-a-release), read directly on 2026-10-20, explicitly states:

> If the commit identified by target_commitish (or, when target_commitish is omitted, the latest commit on the default branch) adds or modifies any file under .github/workflows/ relative to the repository's default branch, the authenticating token must be authorized to modify workflows. Otherwise, this endpoint returns 404 Not Found; some authentication paths surface 403 Resource not accessible by integration instead.

It further states that classic/OAuth tokens need workflow scope, fine-grained/App tokens need Workflows write, and **GITHUB_TOKEN cannot be authorized for this**. The same endpoint's parameter documentation says `target_commitish` determines creation of a Git tag and is **unused if the Git tag already exists**. It is not a reliable release-identity field.

Actual read-only GitHub API results: annotated `refs/tags/v0.1.2` object `64394f6146f9b601cfe4e498ad07ee71af6cd528` peels to commit `1c7e8230406759874cf316bbbd971338108dcda2`; master was `71778c7a93cb0ad28d0c4db78c34a8c51ceddf6b`. `git diff v0.1.2..master --name-only -- .github/workflows` reports `.github/workflows/ci.yml`. The old create payload explicitly supplied that historical exact tag commit. These conditions match the documented additional permission check. The coordinator separately reported the same old payload returning 404 with an owner OAuth token lacking workflow scope; that attempt is not an implementer mutation or a successful release.

Generated notes remain enabled: the official notes-generation endpoint requires Contents write and there is no evidence it caused this first create failure. Existing `contents: write` remains unchanged; expanding token scopes is unnecessary for an existing, verified tag.

## Correction

1. Before any draft mutation, resolve the official remote tag using the Git ref API, peel annotated objects through the Git tag API, and require exact equality with the build commit. Missing/wrong tags, malformed objects, cycles, and nesting beyond the finite limit fail closed. Local checked-out tag/HEAD validation remains intact.
2. Create the draft for that **existing tag**, omitting the redundant `target_commitish`. GitHub's default target metadata therefore no longer sends a stale workflow tree into the extra authorization path; the verified tag still determines the release's actual source.
3. Resume only a draft with the exact tag and exact build marker. A default-branch string in `release.target_commitish` is legitimate creation metadata, not grounds to reject a correctly owned draft. Public releases and unrelated marker/tag drafts remain immutable.
4. After every uploaded asset is verified, resolve the remote tag again immediately before publication. Movement during upload stops publication.
5. Failed API calls now expose method, path, status, GitHub message, accepted permission header, and request ID. Known token bytes and response URLs are redacted; request query strings are omitted. No Authorization headers, signed redirect URLs, or raw response dumps are logged. Non-JSON failures still report operation and status.

## Verification

- Node22.23.1: existing release fixture suite plus added behaviors **23/23 passed, 0 skipped**. Covers omitted target parameter, wrong/missing tag before mutations, tag movement before publication, default-target metadata draft recovery, lightweight/annotated tags, malformed/cyclic/deep tag graphs, unrelated draft tags, and useful/redacted 403 plus non-JSON errors. Existing five-target byte/digest/upload/publication gates remain covered.
- Real read-only execution of `resolveReleaseTag('v0.1.2', official public API reader)` returned the exact `1c7e823...` commit. This did not use authentication or mutate GitHub.
- Focused oxlint, oxfmt, syntax, and diff checks passed. Successful raw test output: `ci-diagnostics/publisher-exact-tag-node22.log`; official documentation excerpt: `ci-diagnostics/github-create-release-official-note.txt`.

The fix has **not** yet created or published a GitHub Release. The coordinator plans to leave failed `v0.1.2` unchanged, use the corrected pipeline for first successful baseline `0.1.3`, then target `0.1.4` for real updater verification. Until that actual create/upload/publish succeeds, the corrected remote lifecycle remains unverified.

## Project research reference

Reused existing verified WeKnora reference (`research/distribution-evidence.md`): stable v0.8.3 and source snapshot `8dab7550f5069ef80877a65b52dc5483c45f7827`, official site and public `.github/workflows/app.yml`. Its native desktop CI is not evidence for GitHub's present Release authorization checks; the relevant authority is the current GitHub REST documentation and exact existing tag/source metadata above.
