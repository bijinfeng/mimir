# 初步盘点与缺口

基线ad72328。已挂载真实根路由与登录路由，用可控IO检查等待与恢复；已保存真实登录1440/1100/880/600/390和短窗口。冻结以下最小范围。

- login.tsx：初始化loading、setup-state失败/重试、已有账号/预填登录、首次创建、localMode；IdentifierField、PasswordField、LoginForm、SignUpForm；字段校验、显隐、Enter、pending、持久错误提示、成功失效缓存/redirect。Desktop标题栏与更换方式走Platform。
- __root.tsx：session守卫；无session重定向登录，已有session离开login；网络/HTTP全局错误Result；invalidate再reset恢复；Desktop桥fallback。
- LoadError：正常/compact，查询失败的可执行重试，多页面消费者。本轮先检查长内容和窄容器，不修改共享表面除非看到问题。

## 已证实的缺口与修改归属

- 根错误页：实际显示docker compose ps运维命令，整块贴近页面顶部；重试请求守卫计数1→2后按钮仍显示普通“重试”，无等待反馈。修改__root.tsx：以普通恢复指引区分网络/HTTP故障，沿现有Result与主题令牌整理完整可滚动恢复页；重试真实pending、去重、保留invalidate后reset顺序。
- 初始化错误：实际显示Failed to fetch；重试后进入现有Skeleton，等待和完成路径已存在。只调整login.tsx初始化错误分支为中文恢复提示，不改变认证失败详情/401映射、表单与业务语义。
- 登录pending：实际两次Enter后登录请求计数仍1，已有按钮阻止重复隐式提交；不添加未经证实的额外表单锁，也不修改登录与注册契约。
- 登录短窗口1100×420与窄屏390×700正常可滚动；品牌、字体、布局保留，不为差异强改。LoadError现有文本在测试字符串下自动换行，本轮不改共享组件。
- 新测试限定真实路由恢复、pending、失败重试和Desktop桥，不写样式镜像断言。主会话负责gallery/真实渲染存档；实现worker只拥有__root.tsx、login.tsx及必要路由测试，不动其他模块。
