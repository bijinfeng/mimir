# 认可后实施计划

2026-10-18 用户认可基础组件 v1「没问题了，继续吧」，已启动本子任务并按以下边界实施。实际改动与检查见 implementation-evidence.md / check-evidence.md；全仓门与实际页面结论见 verification/implementation-v1.md。

1. 对照认可稿逐条记录“新增/修改/保留”；重新阅读renderer forms/theme与受影响业务组件规范。
2. 优先局部改KnowledgeBaseCreateModal校验/提交保护、SettingControl即时保存失败恢复和显式保存就地结果、复用的错误空态恢复；menus在真实宿主接回焦，保留真实菜单项。不得机械搬运原型的模拟业务逻辑。
3. 数字、选择、按钮等已有正确行为只核验或少量统一，不新增平行设计系统，不改已有保存合同，不全局重写AntD样式。
4. UnsavedGuard与UploadPanel仅按认可的呈现差异实施。Office无法代存、真实上传失败的能力边界分别保留，若要改变需新方案批准。
5. 添加必要行为测试（草稿保留/失败恢复/提交防重/焦点），运行renderer规范Quality Check及受影响包检查；在实际产品验证浅深/窄屏/键盘/正常及异常路径。
6. 自检差异仅在认可范围，更新规范与证据，完成验收后按AGENTS.md限定提交；不混入10-17字段精修及Office会话内容，不推送。
