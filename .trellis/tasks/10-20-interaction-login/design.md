# 设计与边界

登录为已有品牌侧栏+表单双栏，窄屏单栏；全局故障来自根路由errorComponent。沿现有MimirProvider、Ant Design与语义令牌，不更换视觉世界，不新建全局主题。

先读取真实页面和全部路由分支，再在inventory.md记实际缺口与最窄修改位置。根错误恢复保持router.invalidate后reset的合同，桌面更换方式仍只调用Platform桥。网络和HTTP错误保留各自区别，但普通用户界面不承担运维命令或原始开发错误输出。

模拟演示直接挂载真实路由组件与根守卫，只替换api.auth输入输出及原生桥；不复制表单和恢复UI。使用可控promise验证等待/失败/重试，不靠固定延时。真实登录测试使用localhost的独立cookie域，保留127.0.0.1已登录会话。

不改server/shared/desktop安全或协议；涉及新业务需求另定范围。回滚按本模块提交。
