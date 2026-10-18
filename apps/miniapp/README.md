# Mimir 微信小程序

独立 Taro 微信客户端，沿用固定域名服务端的知识库、目录、资料、笔记和会话。三个原生 tab 为“问答 / 知识库 / 我的”；登录、阅读、笔记和链接收集使用注册子页面。任务中的浏览器原型仅用于交互设计，未复制其 DOM 或设备外壳。

本轮已完成客户端与小程序专用 API 的接线。按用户要求，没有运行本轮测试、类型检查、lint、构建、开发者工具或真机验证；现有 `dist` 若存在仍是旧构建，不能代表当前源码。下列命令留给后续统一验证。

## 已实现的流程

- 登录现有邮箱 / 用户名账号，设备凭证过期提示、连接检测、退出撤销及明确放弃草稿后的本机清理。仅存设备 token，不存密码。
- 默认继续最近会话；固定范围为全库、目录子树或文档。范围切换新开会话；支持提问、只搜索、分页历史、复制、编号引用片段与全部来源、完整回答存为笔记。
- 真实微信分块请求，增量 UTF-8 / SSE 解码、AG-UI 事件与真实检索过程；未收到完成事件显示待确认。后台停止接收、前台仅查操作和历史，不自动重新生成。中断可查询结果或使用原请求编号重发。
- 目录 / 标签筛选及文档分页；原生 Markdown 阅读、可点击内链、外部链接复制、代码和横向表格。HTML 作为文本显示，不执行脚本。图片受微信域名、防盗链与来源可用性限制，失败时提供来源。
- 阅读“问这篇”、独立轻量追加、完整笔记编辑、只改元信息；非笔记正文只读。历史引用保留生成时的片段，打开原文重新核对偏移，变化时明确提示。
- Markdown 源文 / 预览与显式保存，草稿按实例 / 账号 / 文档及新笔记身份隔离。后台和离页保留草稿，支持从“我的 → 本机草稿”恢复。版本冲突可继续保留、保留并重载、另存为新笔记；成功回读新版本后才清除草稿。
- URL 与已有目标目录收集；显示真实阶段和部分失败。202 操作前台短时轮询，后台停止；丢失响应可查询或重发同一请求，不伪造进度。
- 原件经设备 header 鉴权下载、检查 HTTP 状态后交给微信 `openDocument`，支持 doc/docx/xls/xlsx/ppt/pptx/pdf；不伪造正文到原件的页码定位。退出时清理此账号本次下载的临时文件。

模型密钥、索引、文档写入和权限判断均由服务端负责。共享 DTO 的唯一入口是 `@mimir/shared/miniapp`，客户端使用 type-only imports，不带入 Zod、Office、Ant Design 或网页渲染器。

## 版本与依赖边界

- Taro CLI、React 渲染器、运行时、组件、平台与 webpack5 runner：`4.3.0`。
- React / React DOM：`18.3.1`；React 类型：`18.3.31` / React DOM 类型：`18.3.7`。不使用现有 web / desktop 的 React 19 catalog。
- NutUI React Taro：`4.0.0-beta.10`，具体组件及样式按需导入，不导入组件库总入口。
- TypeScript 使用 workspace catalog；Webpack `5.91.0`，与现有 Vite 8 构建隔离。

工作区仅为 NutUI 此精确版本补充缺失的可选 React 18 类型 peer。NutUI SCSS 通过 `sass.resource` 注入官方变量；页面延续紧凑白灰布局、绿色主动作和 44px 触控区。

## 配置与运行

在仓库根目录执行以下命令。不要对真实知识库运行测试数据库清理脚本。

```bash
pnpm install --frozen-lockfile
MIMIR_MINIAPP_SERVER_URL=https://mimir.example.com pnpm --filter @mimir/miniapp dev:weapp
```

`MIMIR_MINIAPP_SERVER_URL` 是构建时固定 HTTPS origin，不接受账号密码、路径、查询或 fragment；不填时页面显示尚未配置。该值公开编译进小程序，不得放入密钥。`.env.example` 仅为示例，工程不自动加载 `.env`；由 shell / CI 注入。

服务端在自己的 `.env` 或部署环境中设置 `MIMIR_MINIAPP_ENABLED=1`，默认关闭时专用接口返回 404；此开关与客户端构建地址是两个独立配置。部署前按原流程备份并更新数据库：PostgreSQL 使用 `pnpm db:migrate`，SQLite 沿用启动时迁移。新增迁移为 PG `0014_strange_mastermind.sql`、SQLite `0012_cuddly_namora.sql`；本轮未对实例执行迁移。

实际域名须配置微信 `request` / `downloadFile` 合法域名与有效 HTTPS 证书，远程图片域名也受平台限制。反向代理须保留 `Authorization`，关闭 SSE 响应缓冲并允许问答长连接。没有任意实例切换或通用文件代理。

微信开发者工具导入 `apps/miniapp`，读取 `project.config.json`，小程序目录为 `dist/`。默认 `touristappid` 仅为占位，不能用于正式账号发布。真实 AppID 在本机配置，不提交工具对共享配置的本机修改；`project.private.config.json` 被忽略，但不承诺其能覆盖 AppID。基础库暂设 `3.0.0`；低于分块请求要求的 `2.20.2` 会阻止问答并提示升级。

## 后续统一验证

```bash
pnpm --filter @mimir/miniapp test
pnpm --filter @mimir/miniapp typecheck
MIMIR_MINIAPP_SERVER_URL=https://mimir.example.com pnpm --filter @mimir/miniapp build
```

`build` 编译并运行产物审计：七页注册、三个 tab、原生模板 / 样式、真实模块图和 2 MiB 原始主包预算。仍未分包；原始字节预算不代替微信上传测量。模块图写入忽略目录 `.temp/`，不会降低现有依赖安全检查。

已补充增量 UTF-8（跨块中文 / emoji）、SSE CRLF / 多行 / 半帧、错误和完成事件的测试源码，尚未执行。Node 测试直接导入实际纯 TypeScript 解码模块，需要支持类型剥离的 Node 版本（仓库当前 Node 25）。

请在真实 iOS / Android 微信中统一检查：账号登录 / 过期 / 退出、中文流式、前后台与弱网、全库 / 子树 / 长文尾部隔离、引用原文变化、草稿恢复与电脑端并发冲突、重复操作、原件查看及收集失败。AppID、正式域名、主体类目、备案与隐私 / AI 服务审核尚待实际配置与平台确认，不将源码完成视为可发布验收。
