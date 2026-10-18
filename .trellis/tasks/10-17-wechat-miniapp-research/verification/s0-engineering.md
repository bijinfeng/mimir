# S0 工程验证记录

日期：2026-10-18。范围为真实 Taro 工程基线；本记录不代表 AC1–AC10 业务验收或微信端运行验收。

## 实现与版本

- 用户已批准正式开发，并在 React 19 兼容性核对后明确选择保留 Taro / NutUI，采用 React 18.3.1。
- 新包 `apps/miniapp`：Taro 4.3.0、React / React DOM 18.3.1、NutUI React Taro 4.0.0-beta.10、webpack5，三原生入口“问答 / 知识库 / 我的”。
- 当前只显示未接入状态；固定 HTTPS origin 在构建时注入，未配置时不编造默认服务地址。没有真实 API、模拟回答或成功登录状态。
- NutUI 按需 Button 使用独立样式，并注入其 SCSS 变量。仅为该精确版本补齐缺失的可选 React 18 类型 peer；没有放宽运行时 peer 或替换 reconciler。
- 7 项 `allowBuilds` 增量均为明确拒绝：无须的源码 fallback、统计、外部插件安装与捐赠提示。保留 release-age 和供应链检查。
- 已有 15 个 importer、1264 个 package 与 1266 个 snapshot 逐项保留；新增小程序 importer、1123 个 package 与 1132 个 snapshot，新旧图共存。大幅锁文件 diff 包含新增 Taro 工具链与其 peer 组合，不能仅凭行数判断旧端升级。

## 已执行的工程检查

| 检查 | 结果 / 证据 |
| --- | --- |
| 完整 `pnpm install --frozen-lockfile` | 实施者最终两次成功，2387 条供应链检查通过 |
| `pnpm --filter @mimir/miniapp typecheck` | 实施者与独立审阅者均通过 |
| `pnpm --filter @mimir/miniapp test` | 3 项通过；主会话另用 Node 直接运行同一测试，3/3 通过 |
| `pnpm --filter @mimir/miniapp build` | 实施者与独立审阅者微信编译及产物验证均通过；无 H5 |
| scoped oxlint / oxfmt / 差异空白 | 实施者与独立审阅者均通过 |
| 官方研究快照 | 主会话核对 manifest 全部来源及本地证据的字节数 / SHA-256，通过 |
| Trellis 任务上下文 | implement 15 条 / check 16 条校验通过；新 miniapp 包和规范入口可发现 |

最终实施者产物：三页、641 个编译图模块、361987 原始字节（353.5 KiB）。体积为整个本地 `dist/`，不是微信开发者工具的上传包体测量。构建模块图确认 Taro renderer / React reconciler / 按需 NutUI，未发现 React DOM、Office 或 Node builtin 外部模块。

独立审阅与最终命令结果见 [s0-code-review.md](s0-code-review.md)。本记录中“实施者通过”不能替代独立审阅结论。

## 全仓质量门未通过

主会话运行 `pnpm check`，在 lint 步骤退出 1，后续串联步骤没有执行。七个 error 均位于本轮未改动的浏览器原型；已用 `git diff HEAD -- prototype` 核对无差异：

- `prototype/tests/mobile-runtime.spec.ts:143`：未使用的 footer。
- `prototype/src/mobile/BottomSheet.tsx:74`、`FlowStack.tsx:65`：渲染期 refs。
- `prototype/src/Prototype.tsx:372`：effect 内同步 setState。
- `prototype/src/Prototype.tsx:1295–1297`：三个 JSX key。

暂存区全量 `git diff --cached --check` 另在官方源码摘录的 8 个空行编号前缀处提示行尾空白（`research/react19-compatibility/published-source-excerpts.txt`）。这些摘录已纳入证据哈希，保留原样；排除此单一证据文件后，本轮全部差异空白检查通过。该处理不改变产品代码检查或原始证据。

完整临时日志：`/tmp/mimir-miniapp-s0-check.log`。本轮未修改原型受保护 runtime、未降低 lint 规则；不能将小程序局部检查通过表述为全仓质量门通过。

现有 web / desktop 类型检查曾在锁变更中间态触发 pnpm 自动安装，主会话立即取消，退出 130；该次未运行到类型检查，不能算通过。最终稳定状态已由独立审阅者复验通过；新包解析到 React 18.3.1 / React 类型 18.3.31，现有 web / desktop 仍解析到 React 19.3.0 / 类型 19.3.0。

## 警告与未验项

- 构建仍有 NutUI 第三方 Sass 弃用警告；最终 peers 仅剩既有 oxc-transform-react 与 TanStack AI 版本警告。没有新增 Less peer 警告。
- 本机发现 WeChat.app，但未发现微信开发者工具；没有微信 UI 截图、模拟器或真机运行结果。编译图、WXSS 检查和浏览器原型都不能证明微信交互已验收。
- 基础库配置为 3.0.0，尚未实测平台兼容；真实 AppID、固定域名与证书、合法域名、iOS / Android、审核发布条件待验证。
- S1–S5 仍未完成。共享业务契约的客户端编译验证随 S1 首次接入进行；S0 没有为了测试导入而加入无实际用途的业务依赖。
- 本轮提交仅记录工程基线，不归档整个任务，不宣称可以真实检索、阅读或编辑知识库。
