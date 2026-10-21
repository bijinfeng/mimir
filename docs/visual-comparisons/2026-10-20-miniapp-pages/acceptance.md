# 小程序业务页验收

日期：2026-10-20。模块 28。真实服务端、真实登录会话、Taro H5 产物。

## 实际改变

- 表单控件与选择器改用 NutUI Input/TextArea/Picker/Segmented；主操作继续使用 NutUI Button。
- 空态/加载/头像改用 NutUI Empty/Loading/Avatar。
- 问答页高度改为 `100%`，composer 不再被 tabbar 截断；空态居中。
- 阅读页把品牌 token 挂到 `:root`，H5 的主操作由 NutUI 默认红改为品牌绿。
- H5 关闭 pxtransform；所有截图按 390×844 1:1 像素截取。
- 编辑页正文固定 320px 内滚，工具条回到正文下方；标题/标签为 NutUI 输入框。

## 验证

- `pnpm --filter @mimir/miniapp typecheck` 通过。
- `pnpm --filter @mimir/miniapp test` 通过。
- `MIMIR_MINIAPP_SERVER_URL=https://mimir.example.com pnpm --filter @mimir/miniapp build` 通过（微信产物）。
- 全仓 `VITEST_MAX_WORKERS=1 pnpm check` 退出 0，完整输出见 `full-check.txt`。

## 边界

- 证据来自 H5 快速预览，不是微信真机；WeApp 仍需在开发者工具/真机复核触摸、键盘和安全区。
- 本地代理使用自签名证书，仅用于本次截图；不进入产品配置。
