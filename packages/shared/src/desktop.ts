/**
 * 桌面端宿主 ↔ 载体的握手契约（D-046）。
 *
 * 主进程启动私有宿主后，通过 preload 把这份只读信息暴露给页面
 * （`window.mimirDesktop.boot()`）。页面目前不依赖它——窗口加载的就是
 * 宿主自己的地址，cookie 与相对路径天然同源；这份契约为将来的载体形态
 * （跨源认证宿主、CLI、扩展）与「关于」面板预留，是最小穿越边界。
 */

export interface DesktopBootInfo {
  /** 宿主源，如 `http://127.0.0.1:41234` */
  origin: string
  /** 数据根（macOS 在 `~/Library/Application Support/mimir/data`） */
  dataDir: string
  /** 应用版本（electron app.getVersion()） */
  version: string
}
