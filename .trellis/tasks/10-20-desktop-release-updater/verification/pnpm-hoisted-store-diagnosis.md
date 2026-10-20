# Read-only pnpm12 hoisted hidden-store diagnosis

Date: 2026-10-20. Installed/committed package manager: pnpm 12.4.2. No deploy, build, pruning, or runtime source changes were performed for this investigation.

## Origin and runtime role

Official tag `v12.4.2` resolves to commit `9502f3c457717dae3a4ddbf4315a8c4aee16fdb4` (GitHub tree API, complete/non-truncated). Concrete source evidence:

- [deploy/install.rs](https://github.com/pnpm/pnpm/blob/9502f3c457717dae3a4ddbf4315a8c4aee16fdb4/pnpm/crates/cli/src/cli_args/deploy/install.rs#L102): `create_deploy_install_config()` puts `virtual_store_dir` at the target's `node_modules/.pnpm`, assigns `global_virtual_store_dir` to that same directory, disables the global-store layout, and retains the selected hoisted linker.
- [dir_clone_cache.rs](https://github.com/pnpm/pnpm/blob/9502f3c457717dae3a4ddbf4315a8c4aee16fdb4/pnpm/crates/deps-restorer/src/dir_clone_cache.rs#L101): `eligible()` explicitly requires `cfg!(target_os = "macos")`, isolated/hoisted linker, disabled global virtual store, and package import method auto/clone/clone-or-copy. This is the APFS `clonefile(2)` materialization cache; canonical content is cached once and directory-cloned into the ordinary flat hoisted locations.
- [hoisted.rs](https://github.com/pnpm/pnpm/blob/9502f3c457717dae3a4ddbf4315a8c4aee16fdb4/pnpm/crates/deps-restorer/src/install_frozen_lockfile/hoisted.rs#L92) and [create_virtual_store.rs](https://github.com/pnpm/pnpm/blob/9502f3c457717dae3a4ddbf4315a8c4aee16fdb4/pnpm/crates/deps-restorer/src/create_virtual_store.rs#L204): hoisted linking materializes real package directories from CAS paths; the source explicitly says hoisted has no runtime virtual store.
- [link_hoisted_modules/dir_clone.rs](https://github.com/pnpm/pnpm/blob/9502f3c457717dae3a4ddbf4315a8c4aee16fdb4/pnpm/crates/deps-restorer/src/link_hoisted_modules/dir_clone.rs#L66): cache import projects canonical content into `node.dir`; absent/ineligible cache falls back to the normal indexed importer.

Observed local package pair:

- Runtime: `server-deploy/node_modules/@aws-sdk/middleware-sdk-s3/dist-es/submodules/s3/middleware-check-content-length-header/check-content-length-header.js` (131 characters relative to server root).
- Canonical cache: `server-deploy/node_modules/.pnpm/@aws-sdk/middleware-sdk-s3/3.972.79/32610c8ac830188a0a4e1b93f9a1aa74cadd72b83679ee585ed442fce9c455dd/node_modules/@aws-sdk/middleware-sdk-s3/dist-es/submodules/s3/middleware-check-content-length-header/check-content-length-header.js` (251 relative characters).

The two files have identical bytes, distinct inodes, and link count 1 each, consistent with independent APFS clones. The existing successful relocated SDK/host probe resolved the normal flat package entry and passed the finite resource-tree finalizer. A read-only scan of 10,282 deployed JS/CJS/MJS sources outside the top-level cache found zero static `from`, `import()`, or `require()` specifiers containing `.pnpm`; 442 package manifests had no `.pnpm` references in main/module/exports/imports. This scan does not prove arbitrary computed paths cannot exist. Official linker source and actual relocated runtime checks provide the stronger causal evidence.

This cache is **macOS-only**, so these local backing copies do not explain the old native Windows installation failure. Vite-generated `dist/node_modules/.pnpm` is a separate real import graph and must be preserved: parser/Office compiled imports still refer to that tree. Never delete every directory named `.pnpm` indiscriminately.

## Supported option, without applying a change

`packageImportMethod: copy` bypasses the directory-clone cache while retaining the hoisted runtime layout. Official [explicit_copy_method_bypasses_the_cache test](https://github.com/pnpm/pnpm/blob/9502f3c457717dae3a4ddbf4315a8c4aee16fdb4/pnpm/crates/cli/tests/suite/dir_clone_cache.rs#L97) asserts that package files land in the flat layout and canonical slots are not populated. Explicit hardlink also fails the cache eligibility gate, but copy is the simpler portability contract for an isolated deploy output.

Read-only CLI validation `pnpm --config.package-import-method=copy config get package-import-method` returned `copy`. If later approved, this supported setting can be scoped to the deployment invocation with `--config.package-import-method=copy`; no root installation policy or post-hoc cache deletion is needed. It has **not** been exercised on a fresh deploy here, because the coordinator requested no shared-output mutations during native clean builds. Thus source-backed cache bypass is established; a complete portable package under that option remains unverified.

The next Windows strict installed inventory remains the authority for real missing paths. No pruning or deployment option changes are recommended as a Windows fix based on this local cache alone.

## Required project reference comparison

Reused prior checked evidence in `research/distribution-evidence.md`: WeKnora official site and public source, stable `v0.8.3`, snapshot `8dab7550f5069ef80877a65b52dc5483c45f7827`, `.github/workflows/app.yml`. Its Go/Rust desktop build does not deploy a Node/pnpm service graph, so it cannot establish the meaning or safe removal of pnpm canonical cache paths. This question is answered by the exact pnpm12 sources and Mimir's deployed module resolution.
