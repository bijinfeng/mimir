# Research: React 19 与 Taro / NutUI 的正式小程序兼容性

- Query: 用户要求 React 使用最新 19.x；在已选 Taro 4.3.0 + NutUI React Taro 4.0 下，是否有官方支持的组合？
- Scope: mixed；核对当前工程、npm 官方发布元数据与发布包源码，不安装依赖、不修改产品代码。
- Date: 2026-10-18

## Findings

**当前已选的小程序组合不能直接升级 React 19。** npm 当前最新稳定 React / React DOM 为 **19.3.1**，但 Taro React 渲染器仍依赖 React 18 的内部接口；这超出了组件库 peer 范围尚未更新的问题。主会话随后获得用户明确选择：保留 Taro / NutUI，正式小程序采用 **React 18.3.1**；这是兼容性证据后的用户决定，不是研究者静默降级。

### 官方发布版本与约束

| 包 / 官方源 | 本轮结果 | 对当前任务的含义 |
| --- | --- | --- |
| [react/latest](https://registry.npmjs.org/react/latest)、[react-dom/latest](https://registry.npmjs.org/react-dom/latest) | 均为 19.3.1；React DOM peer 为 `react: ^19.3.1` | “最新 19.x”应指 19.3.1，不能沿用原型的 19.2.7 冒充最新 |
| [@tarojs/react 4.3.0](https://registry.npmjs.org/@tarojs%2freact/4.3.0) | peer `react: ^18`；依赖 `react-reconciler: 0.29.0` | React 19 不在支持范围，且实际渲染器存在内部接口断裂 |
| [@tarojs/plugin-framework-react 4.3.0](https://registry.npmjs.org/@tarojs%2fplugin-framework-react/4.3.0) | peer `react: ^18` | 构建框架插件同样未声明 React 19 |
| [react-reconciler 0.29.0](https://registry.npmjs.org/react-reconciler/0.29.0) | peer `react: ^18.2.0` | 自定义小程序渲染器属于 React 18 系列 |
| [NutUI React Taro 4.0.0-beta.10](https://registry.npmjs.org/@nutui%2fnutui-react-taro/4.0.0-beta.10) | peer `^16.8.0 \|\| ^17.0.0 \|\| ^18.0.0` | 用户选定的 NutUI 4.0 同样未声明 React 19；即使它能运行，也不能解决底层渲染器问题 |
| [@tarojs/taro 4.3.0](https://registry.npmjs.org/@tarojs%2ftaro/4.3.0) | optional peer `@types/react: ^18` | 类型链也需要兼容验证，不应仅修改直接 React 依赖 |
| [Taro React dist-tags](https://registry.npmjs.org/-/package/@tarojs%2freact/dist-tags) | latest 4.3.0、beta 4.3.1-beta.3、alpha 4.3.1-alpha.4 | 核对当前 latest / beta / alpha 通道，未发现可直接选择的 React 19 支持组合 |
| [Taro React beta](https://registry.npmjs.org/@tarojs%2freact/beta)、[alpha](https://registry.npmjs.org/@tarojs%2freact/alpha) | 二者仍 peer `^18`、reconciler 0.29.0；对应框架插件也仍 peer `^18` | 升级到这两个当前预发布版本不能解除限制 |

NutUI 的 dist-tags 仍为 latest=beta.9、beta=beta.10，不能用 `latest` 指代已选 beta.10。React 18 的已发布稳定补丁 18.3.1 已核对官方版本元数据；用户选择后由实施代理继续构建验证，研究结论不等同于验收通过。

### 发布包源码：实际断裂位置

直接下载官方 registry 指向的 tarball，在内存解包检查；没有运行 npm install。证据见 [发布源码摘录](react19-compatibility/published-source-excerpts.txt)，保留原始包内行号、完整源码文件 SHA-256；对应 tarball 的 SHA-256 和 registry integrity 位于 `*-tarball-meta.json`。

1. `@tarojs/react@4.3.0` 的 `package/dist/react.esm.js:3` 导入 `react-reconciler`，`:747` 执行 `Reconciler(hostConfig)`，`:864` / `:869` 使用该版 `createContainer` 参数约定。它不是用 React DOM 为微信小程序渲染。
2. `react-reconciler@0.29.0` 的 `package/cjs/react-reconciler.development.js:21` 读取 `React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED`，`:491` 解引用其 `ReactCurrentOwner`，`:1019` 读取 `ReactCurrentDispatcher`。
3. `react@19.3.1` 的 `package/cjs/react.development.js:879–880` 改为导出 `__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE`；完整导出中没有上述 React 18 私有字段。这意味着旧 reconciler 初始化会读取缺失对象，不能靠放宽 peer 范围、仅通过 TypeScript / 打包来证明能运行。

不能将 `react-reconciler` 强制替换为某个 19 系列配套版本便宣称完成升级：Taro 的 host config、root 创建、调度与更新协议都需随官方适配验证。本轮不实施自维护 renderer、不使用 force / legacy-peer-deps、不引入随机 fork。

### 严格依赖探针（主会话执行）

主会话在仓库外临时目录，仅声明 `react: 19.3.1` 和 `@tarojs/react: 4.3.0`，执行严格、只生成锁文件的 npm 依赖解析。结果退出 **1 / ERESOLVE**：Taro peer `react: ^18` 无法接受 19.3.1，尚未到工程构建阶段。

精确命令：`npm install --package-lock-only --ignore-scripts --strict-peer-deps --no-audit --no-fund`。探针目录独立于项目，没有对仓库执行依赖安装。

精确输入见 [probe package.json](react19-compatibility/strict-probe-package.json)，原始错误正文见 [脱敏输出](react19-compatibility/strict-probe-result.txt)；仅将个人 npm 日志绝对路径替换为 `<npm-log-path>`。此项是依赖解析失败证据，不是小程序启动测试。

### 当前仓库文件与代码模式

| 文件 | 作用 / 证据 |
| --- | --- |
| `pnpm-workspace.yaml:42–44` | Web 的 React / React DOM catalog 同为 `^19.3.0`；该 catalog 不能直接证明 Taro renderer 兼容 |
| `apps/web/package.json:18–19` | Web 使用上述 catalog 和 React DOM，与小程序渲染路径不同 |
| `.trellis/tasks/10-17-wechat-miniapp-research/prototype/package.json:24–25` | 浏览器原型固定 React / React DOM 19.2.7；Vite / DOM 原型运行不能用于小程序兼容验收 |
| 任务 `prd.md`、`design.md`、`implement.md` | 已确认正式开发授权，S0 要求先核对兼容性；本轮用户最新 19.x 意向优先，不能静默回落或绕过约束 |
| [前轮选型研究](taro-component-selection.md) | 记录 Taro 5.0 消息核验及原先 React 18 基线；本报告补充 React 19 的实际 renderer 断裂证据 |

相关规范为 `.trellis/spec/project/index.md`、`architecture.md`、`design.md` 与 `rules.md`：现有 Web / Desktop 保持运行，新端依赖按其运行时验证；小程序工程不能复用浏览器设备壳或以原型验收替代平台验收。正式实现仍须完成 S0 构建、产物与微信端验证。

### WeKnora 必查与适用边界

再次读取 [官网](https://weknora.weixin.qq.com/)（HTTP 200）、[官方最新 release](https://api.github.com/repos/Tencent/WeKnora/releases/latest)（v0.8.3，2026-10-14 发布），及固定 commit [`3e22822c1d2397be730c458c7539d0eb8c113a24` 的小程序 app.json](https://github.com/Tencent/WeKnora/blob/3e22822c1d2397be730c458c7539d0eb8c113a24/miniprogram/app.json)（HTTP 200）。其源码明确为知识库、问答、设置三个原生页面，保留知识库范围和阅读 / 问答职责参考价值；不能据此证明 React 19、Taro 或 NutUI 兼容。没有使用其 Markdown 工具栏作为 Office 编辑主要参考。

## Caveats / Not Found

- 本轮检查官方 npm 已发布的 latest / 当前 beta / 当前 alpha，以及选定版本的 tarball；未把未发布分支、实验 tag 或未来承诺当作正式支持。
- 本研究没有构建真实小程序、运行微信开发工具或真机；未声称 React 18 + NutUI beta 已经通过全部兼容验收。
- 源码证据能说明 React 18 私有接口与 React 19 导出不一致；没有通过随意补私有字段验证非官方兼容层。
- 所有网络快照与本地证据的 hash 汇总见 [manifest](react19-compatibility/manifest.json)，仅反映本轮读取时点；官方版本与 tags 后续可能变化。
