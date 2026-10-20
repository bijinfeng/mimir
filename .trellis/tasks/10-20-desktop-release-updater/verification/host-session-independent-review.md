# 宿主 Session 关闭独立审查

2026-10-20。本轮只读审查冻结的 host-shutdown.ts/.test.ts、index.ts、native-updater.ts/.test.ts 与既有关闭规范、host-close-native-before/after/probe 证据；只写本报告，不修改实现/其他代理文件、不提交/远端操作。未重复作者真实原生探针。

## 结论：修订版通过独立审查

新方案先从仍有效的 workspace.webContents 捕获 Session，等保存保护和窗口 beforeunload/真实关闭完成后释放 Session 连接，再等待宿主关闭；这一顺序针对 Chromium 池化/预连接不随窗口销毁的问题，不会提前断开未保存工作区，也不访问已销毁 BrowserWindow getter。

HostShutdown.close(beforeClose) 在调用连接释放回调前启动原有 15 秒计时，index.ts 原样传递回调。连接释放和宿主关闭共用一次预算，不增加第二段等待。首次关闭 Promise 仍缓存并去重；释放失败、宿主失败或超时均拒绝；超时后迟到的释放不会调用宿主关闭，迟到的宿主成功也不能改变失败结果。未发现剩余阻塞问题。

## 保留的初审发现及修复

初版把 drain await 放在 options.closeHost 之前，既有 HostShutdown 的计时尚未启动，原生 drain Promise 不结算时可能无限停留准备状态。独立审查已报告，作者将 drain 移入同一个关闭预算后重新冻结。本报告的通过结论只适用于修订版；初版 44 项测试通过不抵消当时的无上界缺陷。

## 独立验证

- Node 22.23.1 下运行 `pnpm --filter @mimir/desktop exec vitest run src/main/host-shutdown.test.ts src/main/native-updater.test.ts src/main/updater.test.ts src/main/workspace-close.test.ts`：4 文件、46 项通过。
- 对冻结的上述 5 文件运行 oxlint 与 oxfmt --check：均 exit 0。本轮未独立重跑全仓质量门或类型检查。
- 回归实际使用 HostShutdown，覆盖保存窗口关闭后才释放连接、释放未完成不进入宿主/安装器、释放拒绝保留 cause 并进入 recoveryRequired、15 秒无响应阻止安装及迟到释放不触发宿主关闭、窗口 veto 不释放连接。新累计预算测试在释放消耗 40ms 后启动宿主，仍于总共 100ms 超时，随后宿主成功也保持拒绝。
- mock BrowserWindow 在 destroyed 后读取 webContents 会抛错，确保 Session 的捕获时机不是依靠宽松模拟通过。既有保存握手、关闭 veto、失败/超时阻止安装及普通退出门保留；云端页面仍无 preload/更新桥，Session 能力仅主进程持有。

## 原生证据与验收边界

- 作者原生 before 日志为 Electron 44.7.0/Node 24.21.0，preconnect 后 HTTP_CONNECTIONS=3，既有 HostShutdown 超时导致阻止更新；after 为 HTTP_CONNECTIONS=1，HTTP_CLOSE_CALLBACK 完成，NATIVE_HOST_CLOSE_RESOLVED。该证据证明特定连接条件下宿主关闭恢复，不证明完整实际升级已通过。
- probe 通过真实 createNativeUpdater prepareInstall 路径调用实际宿主关闭，使用新临时 userData、隐藏 BrowserWindow 和真实 healthz/preconnect；传入 `closeHost:(beforeClose)=>shutdown.close(beforeClose)`。surface=setup 用于隔离关闭问题，不冒充本地编辑保存握手验证，亦不调用安装器。
- 此审查不涵盖正在由其他代理修复的 server DB close 模块缓存问题。HTTP 关闭/prepareInstall probe 成功不能作为 SQLite 底层连接实际关闭的证明。数据库修复、真实 Windows/Linux 官方版本升级及资料保留仍须各自完成验收。
