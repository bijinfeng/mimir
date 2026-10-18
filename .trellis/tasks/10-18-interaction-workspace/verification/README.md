# v1 原型验收记录

本轮只做第二模块规划与HTML。产品代码未修改，未执行task.py start；具体版本待用户认可。

- 实际产品源码与隔离本地运行界面盘点；current-expanded.png / current-account.png记录现状。current-theme.png记录主题子层退出后的当前账户菜单，不代表子层展开截图。
- 独立HTML：12切片、97个可切预览状态，完整19组144项清单；所有状态双栏渲染且无桌面横向溢出。prototype-fixture-checks.json保留逐项结果。
- lint、isolated TypeScript、Vite独立内嵌构建exit 0；日志为prototype-*.log。构建为单文件离线审阅，有AntD打包体积提示与Vite弃用提示，不是失败。
- 深浅、1280×900、390×844、抽屉280px、级联44px触达与视口边界、重命名失败草稿/成功重试、12项当前旧会话、未知模式无登出、auto无丢弃及完整清单数量已核对，见prototype-qa.json。
- 首轮修正原型自己的窄屏分支、共享账户JSX重复Portal及级联宽度。最终390px下scrollWidth=390，子菜单right约365，已保存proposal-drawer-theme.png。无产品改动。
- 检查过的浏览器console error为空，browser-errors.json。上次基础模块冻结HTML未改。
- 这些是原型验证，不是产品网络、账号存储隔离、OS系统主题、编辑器保存或原生载体验收。未来实施后按implement.md再验证实际合同。

v1冻结版本及SHA256见../prototype/versions/v1.json。用户认可前不得据此写产品代码。


# v2 修订验收记录

仅HTML与规划修订。v2待具体认可，任务保持planning，未修改产品代码。

- 用户反馈：移除图标选择，创建/编辑复用名称与描述弹窗；编辑可仅修改描述、清空描述或同时修改。API缺口与后续边界测试已补入design/implement及research/workspace-v2-amendment.md。
- `oxlint --no-ignore --deny-warnings`（main.tsx/build.mjs）、isolated tsc、独立Vite构建全部exit 0。构建仍只有既有bundle体积/inlineDynamicImports弃用提示。
- 12切片102个状态双栏均渲染，1280×900无水平溢出；v2-fixture-checks.json保存结果。完整清单150项。
- 描述单独修改与清空可保存；名称/描述均未变直接关闭；模拟失败保留两个草稿，再次保存成功。行菜单改为编辑，真实弹窗预填；改名保持“/ 调研 / 访谈”后缀；随后创建表单两个字段均空。
- 当前侧创建13个图标作为真实Before；提案创建与编辑均无选择。当前侧仅重命名不伪造已有描述编辑能力。
- 390×844真实弹窗深浅检查；最终深色scrollWidth=390、body height=scrollHeight=207，无横向溢出和计数遮挡。桌面真实弹窗名称自动聚焦；Escape/取消可退出。最终截图v2-edit-desktop.png（浅色）/v2-edit-desktop-dark.png及v2-edit-mobile-dark.png；v2-edit-mobile.png、v2-create-desktop.png为首轮操作证据。
- 浏览器错误为空（v2-browser-errors.json）；v2-prototype-qa.json保存路径与限制。原型单选框check辅助动作未激活，改用标签点击并读取checked验证；未据此修改产品。
- 原型中的异步请求均为本地模拟；真实保存、权限/历史长描述、改名与描述的部分失败恢复、账号/宿主仍待实现后验证，不以HTML代替。

当前v2哈希及审批边界见../prototype/version.json。v1快照与基础模块冻结HTML均未改动。
