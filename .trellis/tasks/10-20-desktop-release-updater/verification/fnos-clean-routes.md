# fnOS 干净检出 Web 路由前置修复

2026-10-20，源失败为 GitHub run `39385621049`，原始错误见 `github-fnos-first-failed.log`。本机为 macOS ARM64，使用 Node `v22.23.1` / pnpm `12.4.2` 复现和验证 Web 阶段；不将此结果当作 Linux FPK 构建通过。

## 根因与修复范围

`@mimir/web build` 先生成应用自己的路由树，再执行 `tsc --noEmit`。共享 renderer 的公开入口同时引入 `src/route-register.ts`，后者需要共享基础路由生成文件。GitHub 干净检出没有这份忽略文件，因而 Web 已生成自己的树仍然报 TS2307，以及关联的路径类型错误。

修复位于共享 `packages/renderer/generate-routes.mjs`：当消费方生成自己的路由树时，先用现有唯一配置生成共享基础类型树，再生成消费方树。共享树不传入平台额外路由；直接生成共享树仍只运行一次。保留原有 `tsc`、路由配置、平台树位置及 fnOS `/app/mimir/` 前缀，没有在工作流里临时补生成步骤。

新增 `scripts/renderer-routes.test.mjs` 使用隔离临时目录、真实 TanStack Generator 和最小路由夹具，验证缺失共享树时 Web 生成会补齐，删除后 desktop 生成也补齐，且 `/client/settings` 只存在消费方树，直接共享生成不会引入该路由。加入根 Node 测试入口，保留所有原有测试。

## 真实复现和验证

- 修复前，删除实际被忽略的 `apps/web/src/routeTree.gen.ts` 与 `packages/renderer/src/routeTree.gen.ts`，执行 `MIMIR_BASE_PATH=/app/mimir/ pnpm --filter @mimir/web build`（Node22）：复现 GitHub 同样 TS2307 与路径类型错误，构建失败。日志 `fnos-web-clean-before.log`。
- 修复后，再次删除上述两个实际生成文件，使用相同 Node22、命令和前缀完整运行 Web 构建：exit 0，包括原有 `tsc --noEmit` 和 Vite build。日志 `fnos-web-clean-after.log`，包含两份树的生成记录。Vite 有已有 vendor eval 和混合动态导入警告，无编译错误。
- 对实际 `apps/web/dist/index.html` 断言包含 `/app/mimir/assets/`：通过。
- Node22 `pnpm --filter @mimir/desktop routes:generate`：通过；真实桌面树含 `/client/about`，共享基础树不含该路由。
- Node22 `node --test scripts/renderer-routes.test.mjs`：1/1 通过（覆盖 Web、desktop、共享包三种调用）。
- 修改文件 `oxlint`、`oxfmt --check`、`git diff --check`：通过。

完整 Linux x64 原生 fnOS 构建、实际 FPK 验证和五目标汇总仍需下一次 GitHub 运行。未修改其他代理负责的 server Vite、工作流或 PostgreSQL 测试配置。

## 独立复核

已沿共享 `route-register.ts` → 基础树，以及 Web/desktop 各自生成树的实际引用核对：生成器先使用唯一的 `routeGeneratorConfig` 补齐共享树，不传平台额外路由；再生成消费方树，保留桌面 `/client` 扩展。根测试入口新增该回归且保留旧入口，无工作流旁路或类型检查删减。

独立以 Node22.23.1 运行当前根 Node 测试完整列表 **53/53通过**（包含真实 Generator 的新增隔离回归），日志 `final-root-node22-check.log`。renderer、web、desktop 三包 typecheck 均 exit0；生成器/测试 oxlint、两文件和根 package.json oxfmt、四工作流 actionlint、git diff check 均 exit0。作者的实际干净 Web 前缀构建前后日志已核对，本次没有重复删除共享生成物或重复完整 Web 构建。未发现需要修复的代码问题。
