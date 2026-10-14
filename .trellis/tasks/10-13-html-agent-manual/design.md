# 设计：HTML Agent 与手动编辑

继续由当前 CodeMirror 源码与 `EditedDoc.version` 持有真相，复用已 vendor 的 parse-map、patch 和上游 `HtmlOp` 13 种操作。`get_outline`/`read_source` 读取当前未保存源码；`apply_ops` 对同一版本编译所有补丁，任何参数、SID、重叠或找不到目标的错误均阻止整批写入。手动元素面板与 Agent 都调用同一应用函数；源码编辑或预览点选后的 SID 只在当前解析版本有效。`plan_page` 与 `write_document` 复用模型设置和受控草稿路径，工具结果只按真实画布更新报告。

预览继续使用沙箱 `srcdoc` 与注入式映射，注入属性只在预览副本中；保存仍由原件 envelope 恢复 BOM、编码和换行风格。手动命令按上游逐项矩阵补齐，不照搬 Electron 自定义协议。
