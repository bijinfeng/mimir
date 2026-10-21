# 小程序入口页验收

日期：2026-10-20。模块 28 的第一组页面。真实微信开发者工具 2.01.2510260，模拟器 iPhone 12/13 Pro，页面区 390px。

## 实际改变

- `Gate`：未配置、未登录两态统一为品牌行 + 标题 + 说明；已配置时显示服务端卡片、全宽登录按钮和来源说明。
- 登录页：品牌/标题分层，字段保持 44px；禁用按钮使用中性灰背景与灰色文字，不再出现 NutUI 的粉色 disabled 填充；未填完时显示“填写账号和密码后继续”。
- 全局 `app.scss` 只新增门/登录样式和禁用按钮覆盖，不改业务请求、会话或密码处理。

## 验证

- 微信开发者工具模拟器真实截图：连接门 390×671、登录 390×753；修复后重新编译并重新截取。
- `MIMIR_MINIAPP_SERVER_URL=https://mimir.example.com pnpm --filter @mimir/miniapp build` 通过（7 页、667 模块、469556 bytes）。
- `pnpm --filter @mimir/miniapp test`、`typecheck` 见终端记录。
- 全仓 `VITEST_MAX_WORKERS=1 pnpm check` 退出 0（含 miniapp 8 项测试），完整输出见 `full-check.txt`。

## 边界

- 截图为开发者工具模拟器，不是 iOS/Android 真机；未验证键盘遮挡、安全区和微信审核环境。
- 服务端地址仍为示例域名，未执行真实登录；其余 5 个业务页面待下一轮。
