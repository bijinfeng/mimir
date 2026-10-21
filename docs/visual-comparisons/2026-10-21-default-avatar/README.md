# 统一默认头像 · 2026-10-21

打开 `index.html` 查看同内容、同主题、同尺寸的前后对比。renderer 使用真实 `AccountRow` / `AccountSection` / `MimirProvider`；只固定 session/config 数据，无真实登录或新建账号。统一使用既有 admin / admin@example.com 夹具。

## 覆盖

| 入口 / 状态 | 证据 | 说明 |
| --- | --- | --- |
| 侧栏展开、折叠、账号菜单、资料设置 | `before/default-{light,dark}.{html,png}` / `after/default-{light,dark}.{html,png}` | 1000×600；实际头像保持 26 / 28 / 52px，尺寸条另查 16 / 20px |
| 自定义图片 | `before/custom-*` / `after/custom-*` | 同一合法图片夹具仍优先，未改上传裁切业务 |
| 自定义图片加载失败 | `before/failed-*` / `after/failed-*` | 浏览器真实请求不存在的图片，服务器返回404；等待 antd 回退并确认图片加载完成 |
| 空地址、不同显示名 | `UserAvatar.test.tsx` / `AccountAvatar.test.tsx` | 同一 admin session 只改显示名；不注册其他账号；无字母或问号回退 |
| 上传中预览、失败还原与资源释放 | `AccountAvatar.test.tsx` | 用可控上传 promise；真实 Upload change 与裁切确认回调；blob 预览优先并释放 |
| 小程序本地图片 | `miniapp-{before,after}.{html,png}` | 实际源码 JSX 片段和实际 `UserAvatar`；Image/View DOM适配器，仅核对图片/源码布局，不是微信设备证据 |
| 微信资源一致性 | `apps/miniapp/scripts/default-avatar.test.mjs` | 144×144 PNG 与唯一 SVG 源的生成结果逐字节比较；构建门禁另由独立 checker 验证 |

## 小程序基线与并行提交

实施开始时，小程序另一会话的 NutUI 资料卡与页面迁移尚未提交，旧 HEAD 没有头像。为保护并行工作，曾准备原账号行32px头像的 `commit-ready/apps/miniapp/src/pages/account/index.tsx`，并只替换工作树48px资料卡中的 initial。

在验收期间，另一会话提交 `2991795` 与 `c06f843`，新 HEAD 已包含48px资料卡，并使用 `<View className="profile-avatar" aria-hidden="true">` 而非 NutUI Avatar 包裹。最终产品保留这个已提交的 View、尺寸与布局，只添加 UserAvatar import、移除 initial 计算、将 initial 子节点替换为本地 UserAvatar。现在 `owned-paths.json` 直接复制 account 页，不再使用 override。

最终 `miniapp-{before,after}` 对比以 `c06f843` 的实际 View 资料卡为 before、当前头像改动为 after；源码冻结在 `source-before/apps/miniapp/src/pages/account/index.tsx` 与 `source-fragments/miniapp-{before,after}.tsx`。`miniapp-shared.scss` 使用同一份已提交的小程序样式，不把并行布局迁移计入头像改动。

早期 NutUI资料卡/32px账号行对比、源码片段和manifest保存到 `superseded/pre-rebase-miniapp/`；任务中旧 `commit-ready` 仅为历史保留，不是最终提交方案。HEAD → 早期工作树的资料卡/布局差异不归因于本任务。`miniapp-working-tree-avatar-only.patch` 已改为相对最新HEAD的头像独立补丁。

## 复现与边界

- 生成资源：`node scripts/generate-default-avatar.mjs`。SVG 是唯一几何与色彩源；独立用户图案不扩展品牌图标生成合同。脚本复用桌面已有的 `@napi-rs/canvas`，不新增运行依赖。
- renderer 归档：`node docs/visual-comparisons/2026-10-21-default-avatar/render.mjs`。Chrome + 现有本地 Playwright，before 使用冻结源 transform，after 使用当前产品源；保存已渲染 DOM 与注入 CSS，移除 JS，图片内嵌。
- 小程序归档：`node docs/visual-comparisons/2026-10-21-default-avatar/render-miniapp.mjs`。只读实际页面片段与样式；native-image-adapter.tsx 明示DOM映射，不模拟微信平台。
- HTML 无网络、JS 或字体包依赖，未嵌入 Office / KaTeX 字体。`capture-manifest.json` 记录尺寸、溢出、图像加载与SHA-256；`offline-verification.json` 核对冻结 HTML 可离线打开。
- 原生设备/微信开发工具视觉与运行仍待验；浏览器适配结果和编译产物不能替代此项。
- 本地已通过 renderer typecheck、定向9tests、miniapp typecheck/9tests、changed oxlint、3个antd lint。全量 `pnpm check` 与生产构建由主会话独立 task-only 实体依赖副本验证，不能以本说明替代其结果。

初轮默认态PNG与manifest保存在 `superseded/initial-pass/`。首轮截图发现浮层动画尚未结束和指针 tooltip 遮挡，最终合并修复只改归档脚本等待动画并移开指针，不改产品。视觉检查限制为一次初轮与一次确认，不扩展审美方案。
