# 实施计划：PPTX Agent 与手动编辑

### 2026-10-16 Ribbon 本地工具切片

1. 追踪96回调到App/actions与Mimir具体菜单/Inspector，区分已接未实测、真实缺口、宿主产品入口差异；细分子菜单参数，保留未齐项。
2. 新增浏览器录屏生命周期helper和PPTX录屏Inspector，复用原生媒体上传/封面/播放；验证取消、系统停止共享、32MiB/10分钟、迟到授权、失败不写画布。
3. 图表编辑迁移Inspector；补网格、10个固定样式、配色、轴标题/柱距/孔径/点颜色、系列增删与单独行列互换；组件→原生执行→两次保存独立XML读回。
4. Office/server类型、定向lint/格式/测试；server无DB配置，DB集成须协调。真实浏览器和桌面交父会话，不以模拟录制替代实际系统采集验收。

1. [ ] 建立 17 工具、71 操作（模型可调用 61）及上游手动命令的逐项矩阵，分别标注浏览器纯执行/宿主二进制执行、上游禁用项和验证夹具。
2. [ ] 引入可重复同步的上游 `pptx-ops` 执行与必要保存闭包，扩展会话和版本；保留现有文字/整段字形路径的多 run 保真。
3. [ ] 按文字/元素、插入、表格、幻灯片/deck 的顺序接入 Agent 工具和手动命令；媒体、图表、生成与外部服务使用受控宿主能力。
4. [ ] 每类操作在 SVG 画布可见、手动与 Agent 可交替修改；保存两次并用独立 OOXML 检查未修改部件与关系/媒体正确。
5. [ ] 覆盖停止、切页/切文档、过期元素 ID、批量部分失败、撤销及危险删除确认；跑 `pnpm --filter @mimir/office test`、`pnpm check`、浏览器/桌面实测。

风险：将 Node-only 上游代码误打进浏览器、元素重排后 ID 失效、未知动画/图表数据被重写；不能靠 SVG 看起来正确替代 OOXML 检查。

## 2026-10-16 本地工具交付记录

- 96回调全部追到固定App wiring/actions，逐项入口、子参数和真缺口记于research/ribbon-local-audit.md；本子任务仍未完成，不归档。
- 图表三分类Inspector、可见label、底部主操作、当前variant恢复、配色/数据参数及录屏已实现；UI截图父会话接续，独立checker接管图表当前方案显示复查。
- Office/server tsc通过；实施阶段图表6+录屏6、PptxEditor67、原生素材upload6通过；upload使用noDB配置，不争用DB。独立checker追加8例图表验证，最终结果见审计文末。图表native XML、theme未改和双保存、真实WebM原生关系/字节均读回。
- 尚需真实系统录屏/权限chooser、浏览器/桌面视觉交互与所有剩余Ribbon子项；不能以mock录屏或基础ops可调用宣称完备。


## 2026-10-16 表格设计切片

抽离PptxTableControls，最小Editor接线与专属CSS；组件真实执行→两次保存→独立XML，覆盖八样式、RTL、目标格底纹和边框、草稿/布局回归，父会话负责浏览器验收。


表格实施已完成：新增PptxTableControls及12例原生双保存测试，最小Editor迁入口、durable键保当前类别；PptxEditor67例与Office tsc/lint/格式通过。行列并排、压缩重复padding、样式8预览和6flags两列，父会话实际浏览器验收中。

表格最终聚焦回归5文件121/121（表格12、Editor67、extended22、chart14、record6）；4文件lint、5文件格式与diff通过。最后一次Office tsc仅被并行形状新文件pptx-shape-presets.ts:185的Fill.color未收窄阻塞，已告父会话交该文件owner处理；表格完成前tsc通过。
