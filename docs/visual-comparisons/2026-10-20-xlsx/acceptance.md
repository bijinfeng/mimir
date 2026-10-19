# XLSX 编辑器交互精修验收

日期：2026-10-20。基线：`dcb9a40`。产品为实际 `XlsxEditor`，原件固定于 demo/fixtures；主题通过 MimirProvider 与真实 editor theme bridge。

## 已实施

- 图表、图片、结构化表旧模式独立滚动字段区，动作与反馈固定在同级底部；六模式导航及既有形状/透视/管理结构保持。设备图片按钮补可见文字。
- 七处控制组件24个 Select 显式接收既有 busy/protected/locked；工作簿名称保留工作表保护豁免，只读缩放未额外禁用。
- 高级查找查询与范围/内容布局收紧，结果地址和值分层左对齐、列表有界滚动。菜单挂载会话拥有请求，重复Enter同步阻止；关闭、来源/文档/工作表/已发布版本及条件变化均使旧请求和结果失效。

## 实际浏览器证据

`comparison.html` 记录九组同原件/主题/尺寸截图：690栏图表/图片/表格，390×400短高三模式，以及浅色/深色/短高查找。原始图、尺寸、主题和SHA见 capture-manifest.json；几何和操作见 browser-observations.json。

- 短高旧图表动作位于577.75–601.75，超出panel底部373.36；修后331.36–355.36，三个模式固定动作可达。
- search原件240条记录搜索“项目”，两版均200条截断；修后地址/值清晰。浅深及390×400实测，短高无页面横向溢出，A200结果点击后当前操作范围为A200。零结果、无效regex alert和Escape回焦实际验证。
- 本地Node helper实际执行原有add_chart，画布出现原生图表且dirty/save/undo启用。保存IO手动等待→失败保留内容→重试成功→从10727字节重新解析后图表仍在。另add_table实际创建PolishReview，管理中显示A1:B6，提交时实际Select均禁用。
- 1100宽抽查既有排序/筛选/替换、填充、写入复制、剪贴板、形状库、透视、打印、命名范围、审阅/视图和原生验证提示。此组是打开/切换与内容抽查，不代表逐项执行所有写入。
- 隔离load-error点击重试恢复，load-pending实际出现等待状态。

## 来源与验证层级

研究包含32个surface、242静态控件调用点、63容器组、60动态label模板、30条件状态、20动态族。它们是独立类别的稳定ID映射，不能相加成GUI通过数或做笛卡尔乘积宣称完整状态覆盖。完整索引保留进入步骤/fixture/条件/源码采集SHA；源码映射、组件回归、浏览器观察分别标注。

WeKnora官网与公开v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24`已实查，适用于知识检索与预览安全边界；本次Office工具以Excel web、Google Sheets官方文档及固定GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`为主要参考。见任务research/references.md，没有第三方GUI逐像素复刻声明。

## 自动化与独立复核

- 实施定向6组106项通过；独立check4文件96项通过；Office类型、作用域lint/format和样式守卫通过。
- 回归覆盖真实原件查找参数、regex/空结果、首击输入提交、busy下实际Select无法展开、重复Enter、source/document/sheet/version回环、关闭重开迟到成功/失败、导航不改bytes/version/history/dirty和Agent发布版本失效。
- 独立审查无遗留问题，未改产品代码；现有规范已覆盖本次合同，无需为流水新增规范。
- 全仓 `pnpm check`：exit 0；Office233文件2749项、Renderer80文件591项全部通过，其余包与服务端/桌面/发布脚本检查均完成。完整输出见full-check.txt。

## 明确边界

真实原生XLSX加载、生成及重新解析；页面load/save是内存模拟。Node helper经127.0.0.1:5206接收固定fixture字节并执行真实产品宿主函数，隔离文档shim不访问数据库，不落永久文件。HTTP/ZIP smoke证据与GUI证据分开。静态归档默认不连接helper，需要helper=1显式选择；缺helper的宿主动作真实报错。

远程/上传图片、外部重算、真实系统剪贴板/下载、密码/保护写入、产品服务端保存持久化及所有动态字段组合未在本轮GUI逐项执行。保留既有相关测试，不扩大产品能力，不改vendor/引擎XML/Agent协议。高级查找当前find_cells同步计算，迟到请求合同由受控promise回归证明，不能称真实GUI观察到远程乱序。
