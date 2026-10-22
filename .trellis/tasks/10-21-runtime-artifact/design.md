# 技术设计：runtime 产物与 manifest

## 1. 构建脚本

`scripts/build-runtime.mjs`：

```bash
node scripts/build-runtime.mjs \
  --out <absolute-or-relative-dir> \
  [--web <apps/web/dist>] \
  [--platform <darwin|linux|win32>] \
  [--arch <arm64|x64>] \
  [--skip-build]
```

步骤：

1. 校验 `--platform`/`--arch` 与当前进程一致（交叉构建显式拒绝；原生 runner 才能拿到正确原生模块）。
2. `pnpm --filter @mimir/server build`（除非 `--skip-build`）。
3. 在**仓库内** `staging = <repo>/.runtime-staging/<platform>-<arch>` 执行
   `pnpm --filter @mimir/server deploy --prod --node-linker hoisted <staging>`。
   **不能直接 deploy 到 `<out>`**：`patchedDependencies` 的相对路径按目标目录解析；`/tmp`、Docker `/out` 等仓库外目标会报 `Failed to read patch file`（实测）。staging 必须为空、gitignore、失败时清理。
4. 校验 `<staging>/dist/runtime/cli.js`、`dist/runtime/index.js`、`drizzle/meta/_journal.json`、`drizzle-sqlite/meta/_journal.json`、`package.json`；缺一失败。
5. 如传 `--web`：复制到 `<staging>/web/dist`，并校验 `index.html`。
6. `finalizeResourceTree(<staging>)`。
7. 删除并创建 `<out>`，把 `<staging>` 复制为 `<out>/app`；清理 staging。
8. 计算 manifest 并写入 `<out>/app/manifest.json`。
9. 打印 `manifest` 摘要（版本、平台、文件数、libc）。

**为什么用 `pnpm deploy` 而不是手抄 node_modules**：现有生产依赖树（含 native prebuilds、S3 SDK external、hoisted 布局）由 pnpm 负责；手抄会在 pnpm isolated 布局下漏包。`pnpm deploy` 的目录必须为空，脚本先删。

**为什么 deploy 后还要校验 dist**：`pnpm deploy` 的复制规则受 `.gitignore`/`files` 影响；不能假设构建产物一定被带上。缺文件在打包时失败，而不是在用户机器上 `ERR_MODULE_NOT_FOUND`。

**裁剪**：`apps/server/.npmignore` 排除 `src/test`、`scripts`、`vite.config.ts`、`vitest*.ts`、`drizzle*.config.ts`、`public`、`tmp-*`、`_verify*`；`dist`、`drizzle`、`drizzle-sqlite`、`src`（供 workspace 源码 exports）保留。若后续把 `exports` 改为 `dist`，可进一步去掉 `src`。

## 2. manifest

```json
{
  "name": "mimir-runtime",
  "productVersion": "0.1.8",
  "protocolVersion": 1,
  "shellAbi": 1,
  "gitSha": "af84971…",
  "platform": "linux",
  "arch": "x64",
  "libc": "glibc",
  "node": ">=22",
  "entry": "dist/runtime/cli.js",
  "library": "dist/runtime/index.js",
  "migrations": { "sqlite": "drizzle-sqlite", "postgres": "drizzle" },
  "web": "web/dist",
  "required": [
    "dist/runtime/cli.js",
    "dist/runtime/index.js",
    "drizzle-sqlite/meta/_journal.json",
    "drizzle/meta/_journal.json",
    "node_modules/better-sqlite3/package.json",
    "node_modules/sqlite-vec/package.json",
    "node_modules/@node-rs/jieba/package.json",
    "node_modules/@napi-rs/canvas/package.json"
  ],
  "schemaVersion": 1792311600001
}
```

- `productVersion` 来自 `apps/desktop/package.json`（发布真相）；`protocolVersion`（HTTP/API）与 `shellAbi`（shell↔sidecar IPC）来自 `apps/server/src/runtime/version.ts`。`shellAbi` 借鉴 LobeHub core manifest；当前为整数 `1`，变更 sidecar 握手/生命周期消息时递增。
- `schemaVersion` 取 SQLite journal 最后一条 `when`；诊断用。
- `libc`：Linux 用 `process.report.getReport().header.glibcVersionRuntime` 判断 glibc，否则 `musl`；macOS/Windows 写 `n/a`。
- `gitSha`：优先 `GITHUB_SHA`，否则 `git rev-parse HEAD`，失败写 `"unknown"`。
- `required` 是宿主启动前的最小校验集；desktop/fnOS 只读它，不再硬编码。native 模块列入 required，避免“启动后第一次 SQLite/检索才炸”。

## 3. 资源树物化

把 `apps/desktop/scripts/resource-tree.mjs` 与测试移到 `scripts/lib/resource-tree.mjs` / `scripts/lib/resource-tree.test.mjs`：

- 拒绝目录链接、绝对链接、越界链接；
- 文件别名复制成实体文件；
- 保持现有错误文案与计数返回 `{ files, materialized }`。
- `after-pack.mjs`、`build-fnos.mjs`、`build-runtime.mjs` 共用。

## 4. Docker

```dockerfile
FROM node:22-bookworm-slim AS builder
# ... pnpm install, copy repo
RUN node scripts/build-runtime.mjs --out /out/runtime --web apps/web/dist

FROM node:22-bookworm-slim AS runner
# ... user, workdir
COPY --from=builder /out/runtime /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
CMD ["node", "dist/runtime/cli.js"]
```

- 基础镜像从 Alpine 改 Debian slim：fnOS 是 glibc，统一 libc 是**将来共用 Linux 产物**的前提；当前不承诺 Docker 与 fnOS 逐字节相同，只统一脚本/布局。若 fnOS 目标 glibc 低于 bookworm 的 2.36，回退为 fnOS 原生构建并记录。
- DSH/CI 构建时 deploy staging 在 `/repo/.runtime-staging`，`/out` 只接收复制结果；否则 patch 路径失败。
- `WEB_DIST` 不再需要；runtime 的 env 映射把 `WEB_DIST` 当兼容输入，Docker 显式设 `WEB_DIST=/app/web/dist` 或 config 默认 `web/dist`。
- healthcheck 仍打 `/healthz`。
- 构建阶段不需要 `pnpm deploy` 单独命令；脚本内部完成。

## 5. fnOS

`scripts/build-fnos.mjs`：

1. 校验版本（`apps/desktop/package.json` 与 `apps/fnos/manifest` 一致）。
2. `pnpm --filter @mimir/web build`（base-path 中立由子任务 4 保证；本任务先沿用旧构建）。
3. `node scripts/build-runtime.mjs --out staging/app/server --web apps/web/dist`。
4. 写 `staging/app/version.json`（`{ productVersion }`），供 launch 做运行时握手；复制 `apps/fnos` 源文件（manifest/wizard/cmd/app）。
5. `fnpack build`。
6. 校验 `staging/app/server/manifest.json`、`staging/app/version.json` 与 native ELF。

`apps/fnos/app/launch.mjs`：

```js
const manifest = JSON.parse(await readFile(path.join(appDest, 'server/manifest.json'), 'utf8'))
const expected = JSON.parse(await readFile(path.join(appDest, 'version.json'), 'utf8'))
if (manifest.productVersion !== expected.productVersion) throw new Error(...)
const { startRuntime } = await import('./server/dist/runtime/index.js')
const runtime = await startRuntime({
  product: { version: manifest.productVersion, protocolVersion: manifest.protocolVersion, shellAbi: manifest.shellAbi },
  nodeEnv: 'production',
  dataDir,
  database: { kind: 'sqlite', file: path.join(dataDir, 'mimir.db') },
  listener: { kind: 'unix', path: path.join(appDest, 'app.sock') },
  publicUrl: 'http://localhost',
  auth: {
    secret: config.authSecret,
    owner: { email: config.ownerEmail, password: config.ownerPassword },
    fnosGateway: { basePath: '/app/mimir' },
    trustedOrigins: [],
    cookiePath: '/app/mimir',
    secureCookies: false,
  },
  static: { dir: path.join(appDest, 'server/web/dist'), basePath: '/app/mimir/' },
  migrations: { sqlite: path.join(appDest, 'server/drizzle-sqlite'), postgres: path.join(appDest, 'server/drizzle') },
})
```

- 进程信号由 launch.mjs 转给 runtime.close()。
- 旧 `MIMIR_FNOS_SOCKET` / `WEB_DIST` / `MIMIR_BASE_PATH` env 不再设置。

## 6. 桌面打包

`apps/desktop/scripts/deploy-server.mjs` 改为：

```js
node scripts/build-runtime.mjs --out apps/desktop/runtime-build --skip-build
```

（`pnpm desktop:build` 已先构建 server，所以 `--skip-build`；独立调用时不传。）

`electron-builder.yml` / `after-pack.mjs`：

- 删掉 `deploy/dist`、`deploy/drizzle-sqlite`、`deploy/node_modules` 三段复制。
- 改为 `cp(runtime-build, resources/server)` 一次复制，保留 manifest。
- `finalizeResourceTree` 仍执行，防止 Windows junction/绝对链接。
- `files: dist/**` 不变；桌面 renderer 仍进 asar。

## 7. 测试

`scripts/runtime-artifact.test.mjs`（node:test，不跑完整构建）：

- manifest 生成函数：版本、platform/arch、libc、required、schemaVersion。
- 缺 `dist/runtime/cli.js` 时 `verifyRuntimeTree` 抛错并列出缺项。
- 平台/架构不匹配时拒绝。
- `finalizeResourceTree` 现有测试迁移后仍通过。

产物级 smoke（在能构建的平台手动/CI 跑）：

```sh
node scripts/build-runtime.mjs --out /tmp/mimir-runtime --web apps/web/dist
node /tmp/mimir-runtime/app/dist/runtime/cli.js --config /tmp/mimir-runtime.json
curl -fsS http://127.0.0.1:<port>/healthz
```

## 8. 回滚

- 旧 `deploy-server.mjs` 与 Dockerfile 保留到第 5 步通过；`runtime-build` 是独立目录，不覆盖旧产物。
- fnOS 旧 staging 逻辑保留一版；`manifest` 读失败时明确报错，不静默回退。
- 产物格式变化不影响源码构建；回滚只需恢复脚本。
