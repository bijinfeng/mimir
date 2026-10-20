# 官方5→6第二轮原始失败证据

Run [39423359375](https://github.com/bijinfeng/mimir/actions/runs/39423359375)，精确外部脚本提交4ed2f7756e0cc3785f5c6b583167bcd07ea683e1，临时验证引用；该提交随后已包含于master8709f76。两个结果均为success=false，不能计为升级完成。

两端截图采集和第二次真实保存通过。Linux工作区关闭后宿主关闭失败，安全门未放行安装；Windows已关闭旧进程并启动官方NSIS向导，外部UIA驱动未识别可见Next按钮、actions=0，导致等待替换超时。详细时间线见上一级github-validation.md。

这些文件从Actions artifact原样下载，HTML、应用log及Windows原生JSON保留原始换行、CRLF、ANSI和尾部空白。git diff --check会对Windows JSON的CR报告尾部空白；这属于原始采集字节，不格式化为另一次采集。上一级汇总workflow日志仅去ANSI和行尾空白。root已实际查看Windows nsis-native-001.png与Linux retry-after-save.png、save-and-restart-awaiting-http.png；系统通知和产品自动焦点行为不在这些显式前台预览截图的证明范围。
