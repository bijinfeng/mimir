# Mimir 微信小程序

正式客户端的 S0 工程基线，区别于任务目录中的 React / Vite 交互原型。当前三个原生入口为“问答 / 知识库 / 我的”，仅显示未接入状态，没有模拟资料、回答或成功登录。登录、检索、阅读和写入将在后续步骤接入现有服务。

## 版本与依赖边界

- Taro CLI、React 渲染器、运行时、组件、平台与 webpack5 runner：`4.3.0`。
- React / React DOM：`18.3.1`；React 类型：`18.3.31` / React DOM 类型：`18.3.7`。不使用现有 web / desktop 的 React 19 catalog。
- NutUI React Taro：`4.0.0-beta.10`，当前仅直接引入 Button 及对应样式，不引入组件库总入口。
- TypeScript 使用 workspace catalog；Webpack `5.91.0`，不与现有 Vite 8 构建共用。

工作区仅为 NutUI 此精确版本补充缺失的可选 React 18 类型 peer，防止其声明解析到根 React 19 类型。NutUI SCSS 通过 Taro sass.resource 注入官方 variables.scss，颜色及 44px 按钮高度由本包 CSS 变量覆盖。

Taro 的 React renderer 使用 React 18 的 reconciler；安装 React DOM 满足依赖关系，并不意味着微信运行时使用浏览器 React DOM。产物校验会拒绝 DOM / Office 等模块进入微信包。

## 开发与验证

在仓库根目录执行：

```bash
pnpm install --frozen-lockfile
pnpm --filter @mimir/miniapp dev:weapp
pnpm --filter @mimir/miniapp typecheck
pnpm --filter @mimir/miniapp test
pnpm --filter @mimir/miniapp build
```

微信开发者工具导入 `apps/miniapp`，读取 `project.config.json`，小程序目录为 `dist/`。默认 `touristappid` 用于离线工程导入，不能用于正式账号发布。基础库暂设 `3.0.0`（高于分块请求需求的 `2.20.2`），仍须在实际账号和 iOS / Android 上验证。

真实 AppID 尚未提供。使用真实账号时在本机微信开发者工具中配置 AppID；工具如改写共享 `project.config.json`，不要提交该本机改动。`project.private.config.json` 被忽略，仅用于微信工具自身的机器设置，不承诺它能够覆盖 AppID。真实凭据与发布产物均不得提交。

`build` 编译微信产物并执行 `verify:artifact`：核对三页及 tab 路由、原生模板和样式文件、编译模块图，并报告 `dist/` 全部文件的原始字节大小。S0 没有分包，采用 2 MiB 原始大小守卫；这不是开发者工具的上传包体测量，也不能替代真机 / 上传验证。构建模块图写入忽略目录 `.temp/`。

安装脚本遵循根 allowBuilds：NutUI 用量统计、Taro CLI 外部性能插件安装、捐赠通知和无需的本机编译 fallback 均显式拒绝；当前平台使用已发布的原生预编译包，不放宽 release age 或 peer 检查。

此包不提供 H5 预览命令；浏览器原型不能作为微信运行效果证据。

## 固定服务端

构建时传入固定实例的 HTTPS origin，例如：

```bash
MIMIR_MINIAPP_SERVER_URL=https://mimir.example.com pnpm --filter @mimir/miniapp build
```

`MIMIR_MINIAPP_SERVER_URL` 只接受 HTTPS origin，不接受账号密码、路径、查询参数或 fragment。没有配置时显示“尚未配置”，配置后仍明确显示“尚未验证连接”。该地址不是密钥，会编译进客户端。“我的”页只展示地址，不提供任意实例切换。

`.env.example` 仅为示例；此工程不自动加载 `.env`。请由 shell / CI 注入，避免误读仓库服务端环境和凭据。实际域名还须配置微信 request / downloadFile 等合法域名与有效证书。当前 S0 不发出请求，尚未验证域名、认证、中文流式、微信原件打开或任何产品验收能力。
