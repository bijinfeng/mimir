# HTML rich brief 独立复核

2026-10-17。冻结切片范围来自 root；本轮只改 HTML pin/redo 与其回归，没有新增视觉打磨、模型配置、上传、删除或构建。实际浏览器由 root 验收。

## 来源与边界

- 主参考 GenOffice 固定 `480548fd55f1be3593ee0d8e316a734751d58309`，本轮 `git rev-parse HEAD` 及 `apps/html/src/renderer/document/brief.ts` 直接复读：丰富 style/sections、alternatives 与 user_edited 仅确认期保留、portable meta、原生 pin 首选 charset 后插入。
- 核对既有 WeKnora 官网 HTTP200 文件 `/tmp/mimir-pptx-chart-weknora-site.html`，实际 title/description 标明 v0.8.3；公开源固定 `3e22822c1d2397be730c458c7539d0eb8c113a24` 的 `/tmp/mimir-pptx-chart-weknora-definitions.go`：35–49 sandbox 能力门控、69–78 wiki 工具。本轮适用于权限边界，不存在同类 HTML brief 确认/源内持久化 UI，故不用作 Office 工具栏主参考。

## 独立发现与修复

1. 有效 schema 的20章节及完整设计字段可以超过60000字符，pin未拒绝，但读取端任意60k门槛返回null。新回归先实际失败（`/tmp/mimir-html-rich-brief-check-repro.log`）；读取限制与已有200000页面写入上限对齐，仍验证schema，pin/read/幂等通过。
2. redo把原始notes放前面后截2000字；原notes满长度时最新要求被完全丢弃。最新重拟定要求置前，原说明后补，仍限制2000。新增真正延迟的两次确认：第一次确认前不重拟定，redo后第二次确认前不改画布；第二次等待时停止/手工编辑拒绝迟到结果，正常确认仅一次版本推进并可整轮回退。
3. 初次pin放在head开始，会把原charset声明推过HTML首1024字节编码探测窗口。改用真实head中charset/http-equiv Content-Type元节点的源位置作为优先插入点，无编码声明时沿原有head/html/doctype/BOM回退。两种编码声明（显式head与隐式head）回归验证原声明源偏移不变、长brief在其后、可重读及幂等。
4. 加强备选方向组件回归：原style具有背景色/字体/阴影/布局/docx_friendly，选择省略这些字段的另一方向后必须完整替换style，不能继承旧参数；已有user_edited与本次style修改一起传回。

## 审查结论

- 共享schema、document-agent写入seam、服务端规划/写作prompt保留丰富字段；palette限六位RGB。
- pin只按实际head节点源位置写meta；注释/script/body同名内容不误改，不序列化整页；去重、BOM、无head、超限拒绝覆盖。
- new/redesign生成及pin在一次提交；extract/restyle只固定meta并明确正文未改，restyle返回后续CSS要求；不是把pin声称完成重设计。
- stop、切文档、旧句柄、规划/确认/生成期间版本变化有守卫；HtmlEditor按request.id挂载并清理本次abort监听，已过期abort不关闭新请求。
- 沿现有320px Inspector/固定footer/源码与预览保持挂载；未再做可选视觉变更。root已有宽/420真实组件验收，无真实模型调用，本复核不扩大证据。

## 修改文件

- `packages/office/src/agent/html-brief.ts`
- `packages/office/src/agent/html-brief.test.ts`
- `packages/office/src/agent/html-agent.ts`
- `packages/office/src/agent/html-agent.test.ts`
- `packages/office/src/editors/HtmlAgentPrompt.test.tsx`

## 门禁

- Office四文件 **65/65**：`html-brief.test.ts`、`html-agent.test.ts`、`HtmlAgentPrompt.test.tsx`、`HtmlEditor.test.tsx`；`/tmp/mimir-html-rich-brief-check-office.log`。
- Server writing **6/6**，`/tmp/mimir-html-rich-brief-check-server.log`。
- 11个TS文件oxlint无警告、12文件oxfmt通过、目标git diff --check通过；日志 `/tmp/mimir-html-rich-brief-check-{lint,format}.log`。
- Office tsc通过，`/tmp/mimir-html-rich-brief-check-types.log`（exit0）。

## 保留边界

没有模型配置，真实规划/写作调用未验；Desktop由用户验收。全仓check既有480项技能脚本lint阻断由root记录，本轮不冒称解除。未提交/暂存/归档。
