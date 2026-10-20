# 官方 macOS ARM64 手动升级验收

2026-10-20，最终执行完成于 11:14 UTC（19:14 Asia/Shanghai）。真实官方版本 **0.1.3 → 0.1.4**，Node 22.23.1，原生 darwin/arm64。`manual-update-smoke.mjs` 最终进程退出 0；`result.json` 为 `success=true`、`appStillRunning=false`，没有 cleanupError。

## 实际通过

- GitHub Actions `39402594994` attempt 2 整体 success；v0.1.4 为公开 stable/latest，15 个资产。验收开始、替换前和结束时均由匿名官方 API 确认 latest 精确为 v0.1.4。
- 基线应用取自官方 v0.1.3 ARM64 ZIP，真实启动并进入已鉴权本地工作区；在隔离 userData 创建文件夹、中文正文笔记和标签。
- 0.1.3 后台正确发现官方 0.1.4；manual、autoDownload=false，不自动打开更新详情。对真实可见且中心点命中成功的标题栏更新按钮发送鼠标点击，打开实际独立更新窗口。
- 详情显示“下载 macOS 版”，没有“下载更新”“重启并安装”“重试重启”或自动下载开关。`manual-new-version.html/.png` 为真实 packaged renderer 的 CDP 采集。
- 普通关闭走产品既有窗口关闭与宿主退出，真实主进程 code=0、signal=null；退出后 app.asar SHA-256 未变。没有 kill、app.exit、伪造保存回应或安装注入。
- 正常退出后，外部脚本仅手工替换 mkdtemp 内的专用 app 副本；同一 userData 重启后 currentVersion=0.1.4、仍为 manual、本地模式配置保留。同一 document ID 的完整记录与升级前完全一致，并实际导航文档确认中文/英文原正文可见。`manual-updated-document.html/.png` 已实际查看，文档、文件夹和保存状态可见。
- 升级后再次普通关闭正常退出，没有遗留应用进程。

## 下载与真实网络失败

官方基线 ZIP：568,698,711 字节，SHA-256 `9eefe5e6fc8bfa86ea9e001102d9ecf738ea83661879d6c04453c1133c2bfd9f`。

官方目标 ZIP：568,698,513 字节，SHA-256 `af4e18997e5e19e3aa4a8d49487f9b6417913d4c6269e53ba4cf9930cd9e2bad`。

首次尝试在 Node 连接 github.com 的 10 秒 connect timeout 失败，尚未启动应用；curl 浏览器下载 URL 同样连接失败。无环境代理、系统代理关闭。官方 API asset endpoint 可匿名返回 ZIP 字节（实际 Range 请求 206、application/octet-stream、ZIP magic 504b0304）。脚本改用匿名固定官方 API asset URL，并保留精确 tag、架构、browser URL、ID/API URL、大小与完整 SHA-256 校验。失败证据保存在 `attempt-1-browser-download-timeout/`。

第二次实际 UI 与普通退出均通过；目标下载因网络慢达到旧 15 分钟总上限，无强制终止，`appStillRunning=false`。完整中间证据保存在 `attempt-2-target-download-timeout/`。

外部辅助 `parallel-official-zip.py` 在另一独占临时缓存复制活动文件的稳定前缀 145,119,360 字节，用 6 个匿名官方 HTTPS Range 连接下载其余字节；每段严格检查 206、Content-Range、类型和长度，官方重定向仅允许 api.github.com / release-assets.githubusercontent.com。合并后完整大小与官方 SHA-256 一致；`parallel-download.json` 为实际结果。它没有更改活动下载文件、产品或官方资产。

第三次最终成功执行使用 `MANUAL_UPDATE_DOWNLOAD_CACHE` 指向上述独占缓存。每个完整 ZIP 在复用前再次通过 size/SHA-256；应用与 userData 仍在本次新建 mkdtemp 中。新版 helper 提供严格 Range 续传、60 分钟整体上限及 60 秒停滞上限。Node22 聚焦测试 7/7、oxlint、oxfmt、git diff --check 通过，覆盖错误响应/范围、损坏缓存、符号链接、停滞及总超时。

## 保留目录

- 成功运行 app/userData：`/var/folders/92/c09xsx4s6g34djybsfgz6byc0000gn/T/mimir-official-manual-update-sXAJjG`
- 已验下载缓存及分段：`/var/folders/92/c09xsx4s6g34djybsfgz6byc0000gn/T/mimir-official-manual-update-cxv2zs1i`
- 第一次无应用失败：`/var/folders/92/c09xsx4s6g34djybsfgz6byc0000gn/T/mimir-official-manual-update-gKnT6t`
- 第二次网络超时的副本/部分 ZIP：`/var/folders/92/c09xsx4s6g34djybsfgz6byc0000gn/T/mimir-official-manual-update-Vjrcex`

目录保留供主会话复核和后续清理；不访问 /Applications 或用户已有 mimir 安装/资料。

## 验证边界

这是**官方 ZIP 手工替换**，不能称为 macOS 自动安装通过。没有 Developer ID、公证或 Finder quarantine 验证，不能声称 Gatekeeper 放行。没有断言系统通知投递或系统焦点。下载按钮的真实可见状态和手动模式已经检查；没有点击它打开系统默认浏览器/下载目录。官方 ZIP 字节下载是独立验收传输。

真实截图发现发布说明会直接显示内部构建 marker 和 Markdown 标记，已向主会话报告，产品修复由主会话单独处理。截图和本次官方版本验收不因此被改写。Windows/Linux 自动安装结论由其独立真实 runner 验收决定，本文件只覆盖 macOS 手动路径。
