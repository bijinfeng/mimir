---
name: mimir-miniapp-build
description: Taro React 18 依赖隔离、固定服务地址与微信构建合同
paths:
  - apps/miniapp/**
---

# 工程与构建合同

## 1. Scope / Trigger

修改 `apps/miniapp/package.json`、Taro / Babel 配置、服务地址、微信项目配置或产物验证时适用。代码入口是 `config/index.ts`、`config/server.mjs`、`project.config.json` 和 `src/app.config.ts`。

## 2. Signatures

```ts
resolveServerOrigin(value?: string): string
```

该纯函数由 Taro 构建配置调用，构建时将返回值注入 `MIMIR_SERVER_ORIGIN`。这是公开地址常量，不是密钥容器。

```sh
pnpm --filter @mimir/miniapp dev:weapp
pnpm --filter @mimir/miniapp typecheck
pnpm --filter @mimir/miniapp test
pnpm --filter @mimir/miniapp build
pnpm --filter @mimir/miniapp verify:artifact
```

`build` 执行微信编译及产物校验；`verify:artifact` 只检查已有产物，不能代替重新构建。

## 3. Contracts

- Taro 核心、CLI、React 框架和微信平台插件统一精确版本 `4.3.0`；使用 webpack5 runner。
- React / React DOM 精确 `18.3.1`，React 类型保持 18 系列；NutUI 精确 `4.0.0-beta.10`。当前 Web / Desktop 的 React 19 catalog 不适用于小程序。
- 不强制替换 `react-reconciler`，不通过 `force` / `legacy-peer-deps` 隐藏兼容问题。依赖升级需重新核对 peer、渲染器源码与实际构建。
- NutUI beta.10 的声明导入 React 类型却缺少对应 peer。根 `pnpm-workspace.yaml` 仅为该精确版本补充 optional `@types/react: ^18.3.0` peer，使声明与本包 React 18 类型一致；这是补全包元数据，不能推广为忽略类型错误或更改 React 运行时范围。
- 按需 Button 样式需要 NutUI 的 SCSS 变量；`config/index.ts` 通过 `sass.resource` 注入该包 `dist/styles/variables.scss`，页面再导入组件自己的 `style`。
- 可选构建环境变量 `MIMIR_MINIAPP_SERVER_URL`：空值表示未配置；非空必须是无账号密码、路径、查询参数或 fragment 的 HTTPS origin。纯根路径 `/` 可省略，返回规范化的 `url.origin`。
- 页面只读取编译后的 `MIMIR_SERVER_ORIGIN`；用户固定部署地址，不提供任意服务端切换。账号密码和 token 不写进构建常量。
- `sourceRoot: src`、`outputRoot: dist`；`project.config.json` 的 `miniprogramRoot` 对应 `dist/`。保留微信合法域名校验。
- 版本库使用游客 AppID 作为工程占位；真实 AppID 和本地开发工具配置按包 README 的操作管理，不能声称游客占位即可完成正式预览或发布。
- 主包体积按未压缩微信产物检查；当前无分包。新增分包或插件后应扩展验证，不能继续用整包总和冒充各分包预算。
- `ModuleAuditPlugin` 在编译成功后把真实模块标识写入忽略的 `.temp/runtime-modules.json`；产物脚本据此确认 Taro 渲染器和按需 NutUI 进入编译，并拒绝 React DOM / Office / renderer 等浏览器依赖。不把仅检查 manifest 当作运行时依赖检查。
- 样式产物以 `app.wxss` 的实际 `@import` 图检查：多页面复用 NutUI 时 Taro 可抽取至 `common.wxss`。必须断言可达样式含 `.nut-button`，不能硬编码要求聊天页单独生成 `index.wxss`，也不能仅凭模块进入编译就推断样式已加载。

## 4. Validation & Error Matrix

| 输入 / 条件 | 行为 |
| --- | --- |
| 未提供或空白地址 | 返回空串；界面显示尚未配置 |
| `https://example.com/` | 返回 `https://example.com`，不做网络连通性承诺 |
| HTTP、账号密码、子路径、查询或 fragment | 构建配置校验失败 |
| 无法解析的 URL | URL 解析抛错，不能降级为默认生产地址 |
| 缺少微信入口、注册页或包体超预算 | 产物校验失败，不能宣称基础构建交付通过 |
| 未取得真实 AppID / 开发工具 / 设备 | 构建证据仍有效，微信端视觉与运行验收保持待验 |

## 5. Good / Base / Bad Cases

- Good：构建前设置固定 HTTPS origin，输出对应微信产物；在合法域名配置完成后，再进行真实请求验证。
- Base：不配置域名仍能构建工程，明确显示未配置，不发送请求或伪造连接成功。
- Bad：把临时 URL、密码或 token 填入 `defineConstants`，或把原型 React 19 的浏览器成功当作微信兼容证据。

## 6. Tests Required

- `scripts/server.test.mjs` 覆盖空地址、合法 origin 规范化、HTTP / credentials / path / query / fragment 等拒绝路径。
- 类型检查覆盖 `src` 和 `config`；不以声明为 `any` 解除 React 版本或 Taro 配置错误。
- 构建后检查 app 配置、注册页面、JS / WXML / WXSS 等必需产物与包体预算，实际断言以产物脚本为准。
- 升级 React / Taro / NutUI 后重新构建并核对安装图，不只检查 manifest 字符串。

## 7. Wrong vs Correct

```jsonc
// Wrong：把网页运行时直接推广到微信端
{ "react": "catalog:", "@tarojs/react": "4.3.0" }
// Correct：使用当前渲染器支持且用户确认的运行时
{ "react": "18.3.1", "@tarojs/react": "4.3.0" }
```

```ts
// Wrong：配置存在就当作登录/连通成功
const connected = Boolean(MIMIR_SERVER_ORIGIN)
// Correct：配置状态与连接、登录结果分别表达
const configured = Boolean(MIMIR_SERVER_ORIGIN)
```
