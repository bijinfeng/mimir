# 原生客户端交互记录

2026-10-20，macOS ARM64；CUA 操作首个成功 ZIP 解压副本 `/tmp/mimir-desktop-review/mimir.app`，分别使用空白/本地与临时云端 fixture 的一次性 userData。它是最终检查修复前的完整包；对应 UI 文件与最终版相同，不能代替最终包安全分支 smoke。

已实际操作：

- 首次选择页的 mimir 原生菜单包含“软件更新…”，在未启动知识库宿主时打开 file:// 独立更新窗口。当前版本为 0.1.0，官方没有 Release，真实显示“目前还没有可用的发布版本”。初次打开的 AX 焦点为软件更新标题。
- 关闭详情后选择页仍可使用；进入临时本地模式后原生菜单仍有入口。打开的详情 URL 带 appearance=light，Tab 可到“查看发布记录”，手动检查先进入检查中并禁用动作，真实请求完成后恢复“暂无版本/再次检查”。关闭详情返回原工作区。
- 临时云端 fixture 页面实际显示“桌面桥：未注入”；其原生菜单也能打开同一客户端自带 file:// 更新入口，URL 带 appearance=auto。关闭详情后云端页仍在。
- 普通菜单退出/关主窗口后各自指定的验证进程退出。CUA 在查询已退出 app 时可能重新选择/启动同 bundle 副本；未操作其文档，已停止本轮创建的验证进程和 fixture server。

证据为本目录 `.ax.txt`，由实际 CUA accessibility 状态保存。`getScreenshot` 用完整 app 路径和 bundle ID 均返回 `Screenshot unavailable`，因此本目录没有原生截图，不能用组件 PNG 冒充原生截图。一次 Esc 输入被工具的 user-changed guard 拒绝，未记作 native Esc 通过；Esc 由组件行为测试覆盖。

没有可供真实更新的 Release，因此下载完成原生通知、通知去重/焦点、真实安装与跨版本重启仍未实测。最终包的 HTTP/资源/首启/云端隔离由最终 packaged smoke 单独记录。普通关闭 veto 的新增提示和异步安装错误恢复由行为测试验证，本轮 CUA 副本不包含它们。
