# 第七版渡鸦四端接入

2026-10-21。入口：[真实组件前后对比](comparison.html) · [实际平台资源](assets.html)。

## 口径

用户批准的第七轮路径直接复制为 `assets/brand/mimir-mark.svg`，未调整轮廓、比例、眼点或翼线。配色来自 `assets/brand/brand.json`，主绿 #00834d，反白 #FFFFFF，深色强调 #6bdaa5。组件继续继承 currentColor，因此导航和官网标题与相邻文字同色，登录及选择页继承原有品牌色；按钮及页面主题未改变。

前后使用相同页面组件、内容、主题、尺寸与固定展示数据，唯一替换的是品牌组件/资源。`source/before/BrandMark.tsx` 保留接入前真实组件。`harness.tsx` 导入实际 NavSidebar、TitleBar、SetupPage、OfficialSite 与登录路由，使用真实 MimirProvider；数据及桌面 IPC 是明确的展示夹具，不证明系统 IPC、窗口操作或后端连接。生产构建使用与应用相同的 React Compiler sources，避免自制开发配置跳过 vendor 类型转换。

`before/`、`after/` 保存浏览器真实 DOM、CSSOM 和截图；HTML 移除运行脚本、预加载脚本和本组画面未使用的 Office/数学字体声明，并内嵌所需图片；界面文字使用既有系统字体栈。快照供离线审阅，表单、路由和窗口控件在快照中不可交互。前六轮提案和旧对比原样保留，未拿规划模拟图充当产品截图。

## 覆盖与结果

| 入口 | 真实资源 / 尺寸 | 证据 |
| --- | --- | --- |
| 共享 BrandMark | currentColor、evenodd、size/title/aria；16/20/24/28/32/48/64px | samples-light/dark，真实 TitleBar 18px、NavSidebar 22px，单色/反白尺寸矩阵 |
| 官网 | 实际 OfficialSite，1440×900，浅/深 | home-light/dark；等待真实工作台示例完成加载 |
| Web 登录 | 实际登录路由，390×844，浅/深 | login-light/dark；固定已有账号状态，不提交登录 |
| 桌面选择页 | 实际 SetupPage，900×680，浅/深 | setup-light/dark；固定首启桥响应 |
| 两份 favicon | apps/{web,desktop}/public/favicon.svg，64 viewBox，16/32px | assets.html；深色媒体查询使用强调绿 |
| 桌面容器 | icon.png 1024；ICO 16/24/32/48/64/128/256；ICNS 11 个 PNG 块 | 容器目录、载荷尺寸与源生成一致性测试；沿用 .82 留白与圆角底板 |
| fnOS 四处 | ICON.PNG、ICON_256.PNG、app/ui/images/icon_64.png、icon_256.png | 64/256px，测试与 assets.html；未安装 fnOS |
| 小程序 Gate/登录 | 原生 Image 引用本地 assets/brand/icon.png 128×128，30px 展示 | 真实 Taro H5 构建 390×844；WeChat 产物字节与源一致，并断言运行时引用 |
| 小程序头像交付 | assets/brand/exports/miniapp-avatar.png，1024px 完整正方形 | assets.html；像素测试验证角点不透明、鸟形处于圆形安全区，未后台上传 |

共享 16 张、Taro H5 4 张组件截图，无页面脚本错误、无横向溢出。精简后的三个离线 HTML 复核无脚本错误：导航/标题栏与小程序登录截图差异少于 0.03%，官网静态快照约 0.82% 像素差异，主要在下方 Markdown 示例的只读布局；真实浏览器 PNG 保留为视觉验收依据，记录见 `offline-verification.json`。实际查看了深色导航/标题栏和尺寸矩阵、官网完整首屏、深色窄屏登录、浅色选择页、小程序 Gate/登录和两套实际资源。16px 保留鸟形、喙和开放翼线；小眼点属于辅助细节，未另画小图版本。

小程序 H5 前后来自临时工程：相同 baseline 源码与相同现有 H5 配置/依赖，after 仅叠加本任务 BrandMark 引用及样式。这样保留其他会话进行中的 NutUI 输入迁移，且不把其视觉变化混入图标对比。H5 tabBar 的占位外观是该浏览器桥接平台自身的表现，前后相同；微信原生 tabBar 未实测。H5 配置仅用于本地视觉验证，不在本任务提交范围。

## 验证

- `pnpm --filter @mimir/desktop icons`：重复执行；13 个派生文件字节稳定。生成器 3 条测试通过，守住全部实际输出、非法来源拒绝、ICO/ICNS 目录、头像角点/圆形安全区与眼部镂空。
- `pnpm --filter @mimir/renderer test`：86 files / 640 tests 通过。既有同形测试升级为比较实际组件渲染、生成模块、主源与两份 favicon，辅助功能和继承颜色保留。
- `pnpm --filter @mimir/miniapp test`：8 条通过；微信 `build` 与增强 `verify:artifact` 通过，清洁任务副本 7 pages / 670 modules / 471956 raw bytes（460.9 KiB），原生 Image、PNG 文件与运行时引用进入产物。
- `pnpm --filter @mimir/desktop build`：三段生产构建通过。
- `node --test scripts/fnos-package.test.mjs scripts/fnos-build.test.mjs`：通过。
- 首次工作区 Web build / miniapp typecheck / `pnpm check` 受其他会话的 React18 类型解析、未完成 NutUI Input 属性迁移及未忽略 dist-h5 生成物影响；未改这些文件或降低规则。最终在独立临时源码副本中安装本地实体依赖后，原 `pnpm check` 以 exit 0 通过，包含 lint、样式守卫、格式、全仓类型和测试；详见 [清洁验证记录](verification/clean-check.md)。原工作区的并行工作未纳入该副本。日志在 `verification/`，已去除终端颜色转义及行尾空格，诊断文本保留；原始副本保存在 `/tmp/mimir-icon-raw-archive-logs/`。此前失败保留为历史证据，不代表最终隔离验收结果。

## 复现

装好项目现有依赖和 Playwright 后，从仓库根运行：

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node docs/visual-comparisons/2026-10-21-brand-icon/render.mjs
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node docs/visual-comparisons/2026-10-21-brand-icon/render-assets.mjs
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node docs/visual-comparisons/2026-10-21-brand-icon/render-miniapp.mjs /path/to/before/dist-h5 /path/to/after/dist-h5
```

默认使用本机 Chrome；可通过 `CHROMIUM_PATH` 指向已安装的测试浏览器。共享 harness 临时输出在系统临时目录，不修改产品文件；接入前主形及平台资源已复制进 `source/before/`，不依赖任务目录保持活跃。小程序前后工程分别用归档的 `source/before/miniapp/{ui.tsx,login.tsx,app.scss}` 和接入后对应源文件，在同一 Taro H5 配置下构建；截图脚本接收两份 `dist-h5`，不生成或提交另一套产品运行时。清洁 checkout 若没有 H5 插件，可审阅已归档的 HTML/PNG；不应为了重放截图改变正式微信依赖合同。

## 未验证的环境

没有运行安装包系统图标、Dock/任务栏缓存刷新、fnOS 真机或微信开发工具/真机。没有发布、安装、上架或后台头像上传。包内资源及浏览器渲染验证不能证明这些环境的最终呈现。
