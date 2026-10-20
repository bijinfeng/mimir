# 真实验收驱动修复

正式产品版本v0.1.3/v0.1.4资产保持不变，本轮仅修改外部验收脚本。

- 5c956f5：真实Linux“稍后”关闭详情可早于CDP释放鼠标应答。只对明确关闭动作的mouseReleased接收typed target-close，必须确认具体target消失；详情关闭后工作区仍响应，普通退出记录真实进程exit0且无signal。普通协议/renderer错误不允许被吞掉。原现场update-attempt1/linux，完整说明final-acceptance-review.md。
- 98aaf7d：本机github.com首次ZIP连接超时；改为固定官方匿名REST asset URL/octet-stream重定向，精确ID/URL、响应类型及完整大小/SHA256均验证。首次网络失败保存在mac-official-manual/attempt-1-browser-download-timeout。无凭据、无测试feed或产品hook。
- 两组同时修改后的Node22定向回归11/11通过，0失败/跳过；日志final-targeted-harness-tests.log。独立checker同时已验证lint、desktop types及脚本syntax/format。产品源码127d4b7完整GitHub CI39397745471已全部成功，未把只改验收脚本解释为需新产品版本。

新run39409876470从master5c956f5重新执行完整Windows/Linux官方0.1.3→0.1.4升级。旧run39408870875已知Linux关闭竞态失败，Windows虽已通过下载、普通退出、真实guard与保存HTTP，仍未确认向导/自动拉起；为释放concurrency由主会话明确取消，保留partial不计通过。

曾误用pnpm test触发全workspace而非仅根Node脚本，在开始真实应用验收时中止该不必要重复运行；此轮不计为完整全仓通过或失败。完整生产质量门仍引用上述已完成GitHub CI，本轮新增脚本用11项定向回归验证。

## 后续实网下载与诊断

- mac ZIP 下载支持精确 Range 续传和只读复用已完整校验的临时缓存；完整大小/SHA256、严格206/Content-Range、官方匿名API及符号链接拒绝契约不变。总时间一小时、无数据一分钟中止；不因超时把部分文件算作成功。Node22两组脚本16/16及独立审查通过，见native-and-manual-review.md。
- Windows NSIS等待期间每30秒归档原生进程/窗口/按钮与桌面PNG，仅增加诊断，不改变安装参数、按钮选择或通过条件。PowerShell7.5.4 ParseFile静态解析通过，运行时仍待新基线升级。
- 98aaf7d的CI39410163587在server的xlsx-range-disjoint 20000 stored-cell断言触及原有5000ms上限失败，其余1365项server测试通过；该run不计全仓通过。不修改断言或放宽时间，以新修复版完整CI确认。
