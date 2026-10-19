# Desktop 模块16验收

实施：首启配置读取反馈；统一提交入口同步防重、空地址拦截、失败保址重试；等待状态独立行；短高/窄屏与关于页密度；侧栏开关键盘焦点。仅5个 desktop renderer 文件，main/preload/shared、安全和配置持久化未变。

证据：[八组真实前后](comparison.html)、[19类来源索引](interactions.html)、[浏览器观察](browser-observations.md)、[启动自检](native-smoke.txt)。19类来源不是19次GUI通过；28+28源码HTML与17+17资源均有精确指纹，93依赖包105原始许可证已校验。

独立检查无阻断项；Desktop7文件57项（Setup15、TitleBar5、main37）、typecheck、5文件lint/format/diff与Ant Design规范检查通过。server与desktop三段构建通过，Electron三种启动模式12断言通过。

完整 `pnpm check` 退出0：lint、style guard、format、所有包类型检查与递归测试通过。Office2774、Renderer591、Chat88、Desktop57、Server1365、本地10/fnOS4及备份/根宿主脚本通过。Storage既有2项跳过保留，未新增排除或放宽超时。日志 full-check.txt，结构化结果 quality-result.json。

原生边界：Mac锁屏，无法手工操作原生拖动、菜单、系统对话框和真实导航。启动自检是实际Electron，HTML组件测试是模拟桥；两者分开记录。未验边界不属于本轮修改内容，不扩张为全原生平台验收。业务及数据保存语义保持。
