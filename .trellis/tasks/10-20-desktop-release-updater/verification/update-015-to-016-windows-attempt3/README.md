# 官方 Windows 0.1.5 → 0.1.6，第三轮

Run [39426680220](https://github.com/bijinfeng/mimir/actions/runs/39426680220)，精确 harness SHA `d67c33125fa899e4c5595f038a88b442f7dd98f8`。这是原始 GitHub artifact，`success=false`，没有改写为通过。

真实官方缓存安装包验证、普通退出、保存保护、NSIS Next/Finish、向导正常退出和更新器自动拉起新 PID 已发生。随后脚本正常关闭并重开安装后的应用，固定调试端口绑定报 Windows 0x2740，CDP 超时；完整资料保留断言没有执行。原因及修复见 [端口诊断](../dynamic-cdp-port-diagnosis.md)。

`nsis-native-009.png` 是完成页，Run mimir 选项已勾；`010.png` 原向导已消失。截图/HTML/JSON/log 保留采集字节，包括 Windows CRLF、ANSI 和末尾空行。它们不参与源码格式化，不通过删除原始字节消除 diff 空白报告。人工截图带显式前台切换，不能证明原生通知或自动焦点行为。
