# v1 原型验收记录

本轮只做第二模块规划与HTML。产品代码未修改，未执行task.py start；具体版本待用户认可。

- 实际产品源码与隔离本地运行界面盘点；current-expanded.png / current-account.png记录现状。current-theme.png记录主题子层退出后的当前账户菜单，不代表子层展开截图。
- 独立HTML：12切片、97个可切预览状态，完整19组144项清单；所有状态双栏渲染且无桌面横向溢出。prototype-fixture-checks.json保留逐项结果。
- lint、isolated TypeScript、Vite独立内嵌构建exit 0；日志为prototype-*.log。构建为单文件离线审阅，有AntD打包体积提示与Vite弃用提示，不是失败。
- 深浅、1280×900、390×844、抽屉280px、级联44px触达与视口边界、重命名失败草稿/成功重试、12项当前旧会话、未知模式无登出、auto无丢弃及完整清单数量已核对，见prototype-qa.json。
- 首轮修正原型自己的窄屏分支、共享账户JSX重复Portal及级联宽度。最终390px下scrollWidth=390，子菜单right约365，已保存proposal-drawer-theme.png。无产品改动。
- 检查过的浏览器console error为空，browser-errors.json。上次基础模块冻结HTML未改。
- 这些是原型验证，不是产品网络、账号存储隔离、OS系统主题、编辑器保存或原生载体验收。未来实施后按implement.md再验证实际合同。

规划版本及SHA256见../prototype/version.json。用户认可前不得据此写产品代码。
