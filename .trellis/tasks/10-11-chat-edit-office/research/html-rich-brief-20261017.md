# HTML 持久页面规划：实施边界与来源

2026-10-17。主参考GenOffice固定`480548fd55f1be3593ee0d8e316a734751d58309`：`apps/html/src/renderer/document/brief.ts`定义core_hook、style(palette/typography/tokens/layout/density/docx_friendly)、最多两备选方向、sections(type/brief/layout/image_queries)、meta、user_edited；briefMetaTag不持久化alternatives/user_edited，pin写meta name=genoffice:brief。`ai/tools.ts:813–886`确认支持redo/cancel/confirmed；new/redesign生成后pin，restyle/extract仅pin并回传后续CSS调整要求，不能把pin称完成重设计。

WeKnora核对本轮既有HTTP200站点文件`/tmp/mimir-group-flip-weknora-site.html`与v0.8.3 commit`3e22822c1d2397be730c458c7539d0eb8c113a24`公开`internal/agent/tools/definitions.go`本地证据；14–21知识检索、35–49sandbox以及69–75wiki门控用于范围权限，本身没有HTML设计提纲/页面writer与源内pin，不作为Office/HTML工具栏模板。

当前Mimir只有title/tone/audience/sections(purpose)，restyle/extract直接changed:false。最小真实补齐位于共享brief schema、Agent确认状态机、Prompt表单、服务端规划/写作prompt和源内meta补丁，不是工具栏再加空按钮。root拥有相关HTML文件及shared document-agent.ts的HTML段，不与PDF schema/PPTX shell所有者重叠。

保持旧brief入参兼容；补丰富设计字段与样例方向卡、明确用户更改字段、重新拟定说明；redo继续按冻结版本再次规划并确认，不改源码。确认后new/redesign在单次生成写入内pin，restyle/extract只精确修改head meta，body/script/style其它源码保持。读取上下文包含已固定brief；用户后续显式改CSS才算restyle生效。原件内alts/用户编辑追踪不持久化，反馈给writer保留；解析meta用真实HTML节点源位置，避免注释/script里的同名字符串误替换。源变化/停止/关闭均不得写迟到结果。

320px原有Inspector：概要+至多三个方向选择，配色/字体/结构细节折叠；内部滚动、固定确认/重拟定、标签/当前值、Escape焦点返回，真实420验收。只使用配置模型接缝，没有新供应商或自动保存。目标回归：rich schema/unsafe color、真实head pin位置与escape幂等、cancel/redo/stale、未改源码、new与extract/restyle单history/save重开；无真实模型不声明调用。
