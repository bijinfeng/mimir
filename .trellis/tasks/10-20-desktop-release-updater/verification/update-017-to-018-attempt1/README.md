# 官方 0.1.7 → 0.1.8 第一轮

Run [39437731315](https://github.com/bijinfeng/mimir/actions/runs/39437731315)，精确 harness head e3a950fdd5a42bf02e83ab1fb40a6832c35f38c9。Windows success，Linux failure；两端原始 artifact 原样保留，不合并成全平台成功。JSON 的 CRLF、ANSI 和末尾空行属于原始采集证据，不用于源码格式检查。

Windows result.success=true：官方缓存包摘要、普通退出未安装、真实挂起保存保护/取消、第二次保存并重启、NSIS Next/Finish 与 wizardExitCode0、自动新 PID 早于显式重开、最终版本0.1.8和完整文档/title/tags/folder/local mode均通过；三个显式进程exit0。三个启动端口互异50595/56570/53851。主会话目视 save-guard.png 对话框完整可读；nsis-native-010.png 真实完成页和Finish；upgraded-document.png 有完整标题及两次编辑正文。

Linux result.success=false：安装包已被正确SHA目标替换，旧组exit0，更新器自动拉起新PID3733/3737/3738/3740；之后外部关闭脚本没有窗口就绪等待且无首次动作证据，90秒内仍有真实mimir进程。资料核验未运行。最后native-windows.txt显示3733工作区，不能倒推首次窗口已映射、不能排除veto、不能归因为未被pgrep计入的wrapper3719。后续外部harness修复/复验必须保留本轮失败。

CDP截图显式前台不代表系统自动焦点行为。系统通知投递/焦点、fnOS设备安装升级未实测；mac无正式签名仍manual。
