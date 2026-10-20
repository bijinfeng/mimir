# 官方 0.1.7 → 0.1.8 第二轮

[Run39441421036](https://github.com/bijinfeng/mimir/actions/runs/39441421036) completed/success；精确外部harness提交442cd13a4b75fdc207cf9f7c7e8025e490ddd0da。正式基线tag固定3f35e8a，目标tag固定e3a950f，二者各五目标15资产；没有改tag或覆盖资产。

| 真实路径 | Linux AppImage | Windows NSIS |
| --- | --- | --- |
| 官方目标字节核对 | 完整替换AppImage SHA匹配 | 实际updater缓存安装包SHA匹配 |
| 完成后无自动详情、普通退出不安装 | 通过 | 通过 |
| 挂起真实PATCH触发保护、继续编辑取消 | 通过 | 通过 |
| 第二次真实保存200后才quitAndInstall | 通过，21ms/6ms | 通过，22ms/9ms |
| 自动新PID先于后续显式重开 | 4533/4537/4538/4540 | 3476/8892/9184 |
| 原生窗口就绪/一次普通关闭/零进程 | 8次空枚举后映射4533/0x00400003，48.854请求、49.011退出 | 精确9184/590288，51.842请求、54.024退出 |
| 完整版本/资料/模式断言 | 0.1.8、全文/title/tags/folder/local | 0.1.8、全文/title/tags/folder/local |
| 三次显式启动的正常退出 | 全部exit0/null signal | 全部exit0/null signal |

Windows官方缓存安装包实际NSIS完成Next及Finish，Run勾选，原窗口消失，wizardExitCode0。没有静默安装、代启动升级目标或强杀应用。两端cleanup均0次close请求；显式upgraded启动分别为14:42:49.115Z、14:49:54.039Z，均晚于实际自动新PID和正常关闭退出。启动端口各自互异，记录在launches.json。

原始artifact ZIP与GitHub API SHA256匹配，解压全部19个Linux/44个Windows文件逐entry核对；github-run.json、github-artifacts.json、downloaded-file-manifest.json和verification-summary.json可追溯。两job完整日志及原始CRLF/ANSI/末尾空行保留，不用于源码格式检查。

作者目视两端5张产品PNG和Windows NSIS001/010/011；主会话另目视Linux完整文档/保存等待、Windows完整文档/保存保护/NSIS010完成页，内容和两次编辑完整可读。CDP截图显式前台只证明可见内容，不证明通知投递或自动焦点行为。

第一轮Windows成功/Linux失败保留attempt1，本轮真实8次空枚举不倒推第一轮缺失记录。mac无正式签名继续manual；fnOS设备安装升级与原生通知投递/焦点未实测，不归入本轮通过结论。完整CI另见github-native-close-ci.json/.log。
