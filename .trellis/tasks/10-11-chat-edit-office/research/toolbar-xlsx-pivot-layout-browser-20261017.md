# 已有简单透视布局：生产浏览器及原生验收

2026-10-17，root。稳定生产预览 localhost:5180，统一账号 admin@example.com。构建 `/tmp/mimir-toolbar-ocr-forms-preflight-web2-20261017.log` exit0。实施/独立检查分别见 xlsx-pivot-layout-{implementation,independent-check}-20261017.md。

## 真实操作与原生结果

支持样本 `j3Uv7JN14w6XKVnp`，原件 `/tmp/mimir-xlsx-pivot-layout-browser-original-20261017.xlsx` 9573B。来源“源 数据'2026 中文季度销售明细与部门汇总” A1:F6，输出“汇总”，原透视“原有销售透视布局验收”。插入→图表、形状与结构化表→透视→选择原件→编辑布局。

行字段 区域→部门 改为 部门→区域，金额由平均值改为求和，成本保留求和。应用一次后真实网格总计150/53，输出A1:D10缩为A1:D9，原A10:D10旧结果清除。保存后实际读取库原件：

| 状态 | 文件 | 大小 |
| --- | --- | --- |
| 首次保存 | `/tmp/mimir-xlsx-pivot-layout-browser-applied-20261017.xlsx` | 9415B |
| 保存后Undo并保存 | `/tmp/mimir-xlsx-pivot-layout-browser-undo-20261017.xlsx` | 9573B |
| Redo并保存 | `/tmp/mimir-xlsx-pivot-layout-browser-redo-20261017.xlsx` | 9415B |

18个非目录ZIP entry：Undo与原件全部精确一致，Redo与首次保存全部精确一致。应用仅改变4个部件：sheet2、pivotTable1、pivotCacheDefinition1、pivotCacheRecords1。pivot全部根属性（名称/cacheId等）精确保留，rowFields原0/1→1/0，values为sum/sum（OOXML默认sum省略subtotal合法）；location A1:D9。cache refreshOnLoad=1、records count=0/无记录，原生身份/关系不换，源表/其它表/custom部件精确。Z1“汇总说明保留”单元格原XML精确，A10:D10不再有值/公式。重载页面后实际网格仍为Sum of 金额和总计150/53。

首个比对脚本错误地要求显式subtotal="sum"曾失败；读取原生省略属性默认值后修正验证，非生产问题。默认聚合语义已据原生读回确认。

只读未知扩展样本 `rWQGhSnajnAu6pGI`：选取原件后“编辑布局”禁用，明确显示“含未知原生属性或扩展，暂不能编辑布局”，保留原字段布局与读/刷新入口；未尝试写入。

## 样式交互

实际420×500预验收：scrollWidth420，取消x121–192.09、应用x200.09–400同一行，y429.36–453.36；长来源名换行，当前汇总值正确，不挤出单一primary。截图 `xlsx-pivot-layout-edit-420.jpg`。Select Escape先关闭选项，第二次取消草稿回“编辑布局”，第三次关Inspector回“图表、形状与结构化表”。

稳定构建1280×720保存结果：Inspector x960、width320、top163、bottom693.36，截图 `xlsx-pivot-layout-saved-1280.jpg`。截图均位于 `/Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51`。

开发5173曾在应用后、保存前遭共享配置热更新整页重置，未保存到库；该时点不称保存/历史通过，也未认定为产品缺陷。以上稳定生产真实操作补齐了该证据。

## 边界

只支持现有严格简单General/default透视；未知格式、共享/外部/关联歧义仍拒绝。refreshOnLoad/清缓存不等于已在Excel实机刷新分组成功。既有新增透视关系模型不新增不存在的worksheet pivotParts。真实模型未配置，Desktop用户自验；没有暂存、提交、归档或删除测试件。此切片通过不表示六格式所有工具已齐。
