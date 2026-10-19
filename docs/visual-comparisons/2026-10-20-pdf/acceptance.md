# PDF 精修验收

2026-10-20；基线 `53285bbdeaa17475e04aae517f07c957776cb6b6`。按用户后续直接实施授权完成第15模块。产品改动仅为8组10个Inspector入口收起菜单、批注固定操作区、本地导航和内容共同滚动、各工具真实busy下的字段禁用；原件、页面坐标、保存基线、history和Agent合同未改。

## 真实前后

[对比页面](comparison.html)保存8组相同原件/主题/尺寸配对，共16张PNG，原始指纹见capture-manifest.json。390×400浅深、690×600深色和1100×760浅色，覆盖批注默认/选择、本地页面/水印/绘图、属性及涂黑入口。独立可操作[Demo](demo/dist/after/index.html?scene=annotations&helper=1)、[来源索引](interactions.html)和版本/许可证随档保存。740条为异类来源映射，不等于740次GUI验收。

短高实测：批注面板底373.36px，基线动作底408.28px（选择后440.28px）超出面板；当前动作在独立底栏内。基线本地导航占117px，只剩91.36px内容；当前导航随正文滚动，正文208.36px，可将低处字段滚入视野。390px文档scrollWidth/clientWidth均390，无全页横向溢出。几何原值见browser-layout-metrics.json，截图已按最终instrumentation2重采，旧仪表版本独立标记superseded。

## 实际操作

真实PdfEditor/PDF.js与隔离Node宿主执行现有原生服务；没有数据库写入。主会话按可见控件验证：

- 本地精确绘图添加140pt矩形，撤销移除、重做恢复；保存手动失败后绘图及dirty保留，重试成功ACK5540字节；从实际保存字节重开，选择原生矩形后宽仍140pt。
- 批注固定底栏添加便笺、修改内容、回复；删除确认取消后保留线程。保存等待中选择器/草稿禁用，关闭可用。ACK3221字节，重开并点击刷新批注后保留原3项和新增edited note/reply。
- 文档属性将主题改为PDF layout verification；应用、保存ACK6312字节、重开刷新后值仍在。
- 8组配对的菜单关闭、浅深/窄短高、固定动作和滚动视觉均已核对；补充截图见captures/supplement-*.png。

演示重开保留同一个React实例，批注列表需显式刷新；生产按文档ID key重建。独立核对before/after原生宿主确认矩形与批注字节均保留，字节体积下降不等于内容丢失；未将此演示生命周期现象误报为产品缺陷，也未改动冻结演示字节。

## 质量门

独立审查无阻断项，12文件135项PDF回归通过，含新增15项。10个入口的AST去掉新增close后与基线一致，字段busy、拒绝保稿、菜单Escape回焦和导航/关闭有实际挂载测试。Office typecheck、局部lint/format/diff检查通过。完整pnpm check退出0：lint、样式守卫、format、各包typecheck/test通过；Office2774、Renderer591、Chat88、Desktop50，Server1365及独立local/fnos/SQLite备份门通过，完整日志见full-check.txt。

## 边界

保存ACK仅页面内存，重开验证真实PDF字节，不能据此声称生产数据库持久化或Electron已验。隔离helper执行产品原生服务并拒绝外部图片/模型请求；没有验收真实设备权限、系统文件选择、打印、外部Agent/OCR下载或每个动态选项。现有原件/历史/保护回归通过，不代表所有PDF输入均通过。旧v1仪表资源因归档目录未命中dist忽略曾阻断lint，现已恢复全部原始SHA并放入dist/before；最终v2资源和截图未变。
