# 最小变更设计

## 已确认基线

冻结HEAD 53285bbdeaa17475e04aae517f07c957776cb6b6。真实PdfEditor/PDF.js固定原件，主会话真实390×400测得批注Inspector下沿373.36px，动作下沿408.28px，无法直接看到；local导航常驻117px，滚动body只有91.36px。页面分类的文档工具折叠菜单打开Inspector后仍覆盖标题；研究核对同样缺口存在于8组10个入口（local-ocr、redaction-copy、page-images、canvas-drawing、document-tools、insert-text的3个入口、text-blocks、images）。表单/批注/签名已关闭菜单，沿同一模式修齐。

## 归属和合同

修改限定PdfEditor批注分支及这10个Inspector打开入口、PdfLocalPanel与其局部CSS及必要回归。批注操作成为滚动body同级固定footer；长导航与表单共用滚动区；各字段消费本工具现有busy，Select显式disabled，导航/关闭/取消仍可用。折叠组用既有collapsedContent(close)传给各自trigger，先close再执行原有状态操作，不合并重写10个分支。不把多任务页面工具强制变成单一提交，也不改成熟表单/图片/OCR/签名行为。

现有Inspector回焦、请求身份与取消链保持；不绕过原件、坐标、保护、版本、dirty/history或保存guard。原生宿主隔离fixture供验收，保存ACK仅内存模拟，不能声称数据库持久化或外部模型已验。

## 验证设计

同原件/主题/视口冻结before/after构建，真实画布，短高批注动作、导航/表单可达、键盘/Escape与窄栏无溢出；实际宿主代表编辑与保存重开。deferred回归保证真实写字段锁/解锁且取消不受阻。既有PDF布局和并发字节保存回归一并跑；独立检查与全仓门后限定提交。
