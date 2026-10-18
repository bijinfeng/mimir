# S0 工程基础独立代码审阅

日期：2026-10-18。范围：正式 `apps/miniapp` 基础工程、workspace / lock 增量、小程序规范与 Trellis 包注册、现行任务授权和版本记录。按实际交付的 S0 审查，未把计划中的 S1–S5 当作已实现能力。

## Findings (fixed)

- 无需修改产品代码。静态审阅曾指出 PRD 末尾和实施命令说明的当前状态仍停留在规划期；主会话已同步正式开发授权和分步验证状态。

## Findings (not fixed)

- **全仓质量门未通过。** 主会话执行的 `pnpm check` 在 lint 阶段发现旧浏览器原型 7 个 error：`prototype/tests/mobile-runtime.spec.ts:143` 未使用的 `footer`，`src/mobile/BottomSheet.tsx:74` / `FlowStack.tsx:65` 渲染时读取 ref，`src/Prototype.tsx:372` 同步 effect 更新，以及 `:1295–1297` 三处缺少 JSX key。独立审阅读取 `/tmp/mimir-miniapp-s0-check.log`，并确认 `git diff HEAD -- <task>/prototype` 为空。它们属于既有原型，部分文件为受保护模板运行时；本轮未扩大修改或降低根规则。因此不能宣称全仓 `pnpm check` 通过，其后续阶段也未由该次命令执行。
- **微信端运行与视觉待验。** 没有实际 AppID、微信开发工具或 iOS / Android 验证条件；本轮只审阅源码和编译产物，未实际渲染三个页面、点击原生 tab 或验证请求。未把 WXSS 数值检查、游客 AppID 或浏览器原型冒充平台验收。README 与规范如实保留这些限制，S1–S5 继续待实施。
- 构建输出包含 NutUI 发布包 SCSS 的 Sass 弃用警告（旧 `@import` / 全局函数）。构建及产物校验成功；属于第三方源码，本轮未修改发布包或压低诊断。

上述范围限制之外，S0 未发现需要修改的代码问题。

## Verification

独立审阅在实现者明确释放产品文件、依赖和锁文件所有权后执行：

| 检查 | 结果 |
| --- | --- |
| `pnpm exec oxlint apps/miniapp` | pass |
| `pnpm exec oxfmt --check apps/miniapp pnpm-workspace.yaml .trellis/config.yaml` | pass，22 个匹配文件 |
| `pnpm --filter @mimir/miniapp typecheck` | pass |
| `pnpm --filter @mimir/miniapp test` | pass，3 项：空配置、HTTPS origin 规范化、非法配置拒绝 |
| `pnpm --filter @mimir/miniapp build` | pass，含 `verify:artifact`；641 个模块，361,987 原始字节，353.5 KiB |
| `pnpm --filter @mimir/web typecheck` | pass，包含路由生成 |
| `pnpm --filter @mimir/desktop typecheck` | pass，包含路由生成 |
| 本轮产品 / workspace / 小程序规范相关 `git diff --check` | pass |
| 全仓 `pnpm check` | fail，主会话先前执行的上述 7 个既有原型 lint error；未重复跑或伪报全门通过 |

构建完整日志：本机 `/tmp/mimir-miniapp-s0-review-build.log`。pnpm 验证命令均报告锁文件已是最新、无需重新解析；未使用 force、legacy peer 或降低安全策略。

### 依赖与产物证据

- 用各客户端 `package.json` 为基准的 `createRequire` 核对实际安装归属：miniapp React / React DOM **18.3.1**、React 类型 **18.3.31**；NutUI 发布声明内部解析的 React 类型同为 **18.3.31**。现有 web / desktop 仍解析 React / React DOM **19.3.0**、React 类型 **19.3.0**。
- 锁文件包含 pnpm 工具引导文档和 workspace 主文档。正确区分文档后，按原有 key 和完整条目内容对比 HEAD：原有 **15 个 importer、1,264 个 package 条目、1,266 个 snapshot** 全部保留且内容不变；只新增 miniapp importer、1,123 个 package 条目和1,132 个 snapshot。没有通过重解析升级既有客户端依赖。
- 精确 NutUI beta.10 的 optional React 18 type peer 补全与直接类型依赖一致；不修改其 React 运行时 peer。新增生命周期策略均为禁用不必要脚本，未放宽原有 release-age / supply-chain 规则。
- 产物审核检查 app 页和 tab 路由、三页 JS / JSON / WXML、全局与 Button WXSS、真实 webpack 模块图及原始目录大小。实际 React 18 / reconciler 0.29.0、Taro renderer 和按需 Button 入包；未导入实际 `node_modules/react-dom/`、Office、renderer 或 Node builtin external。pnpm peer 目录名中包含 `react-dom` 不等于实际导入该包，现有审核正则能区分。
- 静态检查编译 WXSS：44px Button 高度转换为88rpx，6px圆角为12rpx；这只证明样式编译，没有证明设备渲染或触控效果。353.5 KiB 是原始目录大小，不能当作微信上传包体测量。
- 固定服务地址仅允许无凭据、子路径、query 或 fragment 的 HTTPS origin；缺省时未配置，已配置不谎报网络连通。三页均明确未接入业务，没有复制原型模拟账号、资料或答案。

结论：**S0 代码、依赖隔离和可检查构建产物通过本轮独立审阅；完整产品与平台验收尚未完成。**
