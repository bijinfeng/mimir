# v6 浏览器代表路径验证

2026-10-19，Codex in-app browser，两个新v6标签；只验本地HTML/真实TanStack内存连接，不接供应商、上传服务或Office原件。

第一批交互抽验：

- 对比页CHAT-012.chat的模型菜单按个人/团队两个演示供应商分组；同名模型A分属独立实例，右侧勾选。
- 选择模型B后菜单只见关闭/高，原A的中等级回到B默认关闭；选高后切回A仍保留高。模型变化不提交消息。
- UI-014详情中，团队模型A明确不支持，模型C能力未知；两者按钮禁用且可访问名称不同，未伪造等级。
- 模型F的“模型默认”是继承选项；实际本地发送回执只有providerId/modelId，不包含reasoningEffort，不把默认伪造成auto。
- 两个标签控制台error日志均为空。

独立源码复核发现的宿主排队/重试快照缺口、旧proposed说明等统一修复后，进行一次最终截图与确认；见下方及independent-v6-review.md。403路由为保留覆盖映射，不是执行403次GUI。

原生IME、读屏、系统picker/剪贴板、真实手机窗口、Electron、模型参数HTTP适配和服务权限不在本轮验证声明中。390px仅原型嵌入宽度模拟。

## 最终确认

- 最终构建后重新加载，两份菜单可操作。Escape关闭模型菜单后焦点回到“当前模型：模型 A”。控制台仍无error。
- 保存并打开检查四张截图：model-menu.png、reasoning-levels.png、dark-menu.png、narrow-menu.png；供应商标题、右侧勾选、等级列表及发送入口可达，窄栏未见控件越界。
- 两份HTML标签保留供用户审阅；浏览器恢复浅色、可用宽度。
- 独立复核覆盖修正后的宿主发送/排队/恢复/重试与九模型能力矩阵，详见research/independent-v6-review.md。源码与截图抽验均不等同全量交互和真实业务已验收。
- 最终哈希与checks.json/version.json一致，冻结后未重建。
