# 桌面客户端入口与更新验收

日期：2026-10-20。模块 17。延续用户直接实施授权；只补真实可达性与短内容排布，不改保存/更新协议。

## 实际改变

- `ClientSection`：设置 › 客户端分“使用方式”和“关于客户端”两段；显示主进程返回的真实版本；新增“关于 mimir”入口。浏览器部署仍不渲染该分区。
- `Platform`：桌面分支新增 `openAbout`，由 `apps/desktop` 入口用桌面自己的路由树导航到 `/client/about`；共享层不需要知道桌面专属路径。
- `AboutPage`：增加返回控制；原有版本、使用方式和更新入口保留。
- 原生菜单：`mimir` 菜单增加“关于 mimir”，显示应用版本与当前本地/云端使用方式；更新与退出顺序不变。
- `UpdatePage`：正文包在可滚动内容区，短内容在剩余高度内成组居中；长说明保持从顶部滚动，footer 固定。

## 验证

- Renderer：`ClientSection` 3 项、平台契约与登录恢复相关 10 项通过；`pnpm --filter @mimir/renderer typecheck` 通过。
- Desktop：关于页 1 项、更新页 12 项通过；`pnpm --filter @mimir/desktop typecheck` 通过。
- 真实组件：24 组前后 HTML/PNG，`comparison.html` 可离线打开；设置 › 客户端与关于页 8 组，更新页 16 组，浅深与 920/390、600/360 覆盖；无横向溢出。
- 定向 lint/format 通过；全仓 `VITEST_MAX_WORKERS=1 pnpm check` 退出 0（lint、样式守卫、格式、全包 typecheck、全部测试），完整输出见 `full-check.txt`。

## 边界

- HTML 证据中的更新状态、版本与说明是显式验收夹具，模拟桥不代表已发布、已下载或已安装。
- 原生菜单只验证源码接线和类型/构建；未在真实 Electron 打开系统菜单截图，未验证系统通知、窗口拖动、真实跨版本安装或重启恢复。
- 关于页的返回使用 `window.history.back()`；从设置页进入的 SPA 历史已验证代码路径，未在打包客户端重复手工点击。
