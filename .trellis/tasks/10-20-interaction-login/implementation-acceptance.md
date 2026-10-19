# 实施验收

完成范围、真实/模拟边界、截图与完整质量门统一见docs/visual-comparisons/2026-10-20-login/acceptance.md。父模块地图已更新至模块9完成，模块10–16继续。

实现worker与独立checker均确认认证/注册API、守卫与成功跳转不变。新增5项控制Promise和真实RouterProvider回归覆盖重复触发、pending、连续失败与恢复、Desktop桥和初始化读取重试。全仓pnpm check退出0。

存档复核曾发现多标签页尺寸作用错误及clip截图的绘制异常，已重新捕获原始PNG并逐项核对真实视口、图片尺寸、38组配对、全部83图加载和contact sheet视觉。六张真实登录基线无配对，另有真实登录成功，不以补充证据伪装视觉差异。

本地静态Demo来自真实源码，只模拟IO；不会创建真实账号或修改凭据。测试凭据只使用admin@example.com/12345678/admin。Electron窗口与真实首次创建未验，localhost测试登出失败保留且未扩展修复范围，用户127.0.0.1会话保留。
