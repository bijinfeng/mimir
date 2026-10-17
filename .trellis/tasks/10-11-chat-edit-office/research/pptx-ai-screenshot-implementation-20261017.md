# PPTX AI 美化截图草稿实施与专项验证（2026-10-17）

## 状态与依据

本片已按 root 批准的 `pptx-ai-screenshot-plan-20261017.md` 实施并冻结生产；待 root 统一构建、真实浏览器宽/420/短高验收和独立 checker。没有配置模型，本报告不宣称真实模型美化成功；Desktop 由用户自验。未跑全 Office/Web build，未提交、暂存、归档、上传或删除测试件。

竞品固定证据沿方案：GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 的 `RibbonHomeTab.tsx:233–241` / `AiPanel.tsx` 美化真实 renderer screenshot；WeKnora 官网实际 HTTP200与公开源码 `3e22822c1d2397be730c458c7539d0eb8c113a24`（v0.8.3 快照，blob `67be74c5b086135585ec519b0caabd3df360f423`）只用于真实 capability/scope，不作 Office Ribbon 样式依据。本片没有新调研域或更换参考版本。

## 实际改动

- Office：`pptx-ai-snapshot.ts` 复用当前未保存 `renderSlide` 和既有 PNG rasterizer，宽1280、最高1920、2457600像素、5MiB、10秒上限。`PptxEditor` 冻结 session/source/页路径/序号/版本，等待期间取消、Escape、换页/改稿/换源拒绝迟到结果；成功仅发布草稿，不保存、不推进版本/dirty/history。`PptxAiControls` 保留原位紧凑准备/取消，其他字符串预设不变。
- renderer：`OfficeSourceEditor` → `FilePreview` → `DocumentPanel` 传截图草稿；文档 ID 再核对后打开问 AI。`DocChatSidebar` 将现有可执行 Agent 与只读 `draftAgent` 分开，后者允许无模型预览但不给执行权限；视觉由现有 `mediaKinds` 给出。
- chat：真实 complete attachment、96×64以内真实比例缩略图、页号与移除；带图 textarea2–5行，隐藏空态快捷 chips，配置缺失/校验失败提示紧凑可见。新草稿一次消费，用户可编辑文字且必须显式发送。`sourceIsCurrent` 仅运行时函数，不进消息、context、URL或数据库。
- 绑定：发送冻结整个原页，清空对象/文字子选区，在既有 `agentSelection` 加本地 marker。发送/click/Enter、排队真实派发和失败重试均核对原页、源寿命和版本；普通检索不得吞图。续轮只放过 Agent 自身版本推进，仍遵守原源寿命和既有轮次/版本协议。
- 队列：有界 registry 至多4份，保护排队及在途项；停止/失败/取回保留文字+PNG+目标，恢复失败保留队列。composer移除清当前绑定，已发图可在剩余有界记录内重试，卸载释放。网络边界发现排队实际 body 可能缺subscriber注入的路由字段，截图专属路径复用同一initialize补齐并最后核对；无图转发不变。
- 服务端：PPTX `mediaKinds:['image']` 只在视觉实际就绪时发布。真实 user PNG data输入预检在持久化/模型前执行，每轮1图/全历史4图、5MiB单张/20MiB总计和尺寸/像素门槛，不获取URL；视觉缺失或坏PNG有明确错误。普通RAG带图422拒绝。坏PNG共享解析器异常转换为截图专属文案，避免误导成接受六种来源。

## 最终专项结果

| 项目 | 结果 | 日志 |
| --- | --- | --- |
| Office4文件：helper / AI控件 / presets / 实际Editor | 24/24 | `/tmp/mimir-pptx-ai-office-final-test.log` |
| ChatPanel真实HTTP+registry2文件 | 39/39 | `/tmp/mimir-pptx-ai-chat-final-test.log` |
| Server截图输入+既有DOCX stream+普通chat stream3文件 | 18/18 | `/tmp/mimir-pptx-ai-server-final-test.log` |
| Office/chat/renderer/server tsc | 各exit0，server文案修改后再跑 | `/tmp/mimir-pptx-ai-{office,chat,renderer,server}-types.log`、server最终 `server-types-final.log` |
| 本片28文件目标oxlint/oxfmt/diff | exit0 | `/tmp/mimir-pptx-ai-{lint,format,diff}-final.log` |
| antd attachment/Composer/ChatPanel | 3文件0问题 | `/tmp/mimir-pptx-ai-antd-{attachment,composer,panel}.log` |
| 样式backtick守卫 | exit0 | `/tmp/mimir-pptx-ai-styles-final.log` |

Office证明未保存文字进入真实 renderer SVG，PNG容器/尺寸、迟到、abort、按钮/Escape取消、原源替换失效和no-save/no-dirty。组件 rasterizer 使用受控PNG，不把它算作真实浏览器canvas光栅证明。

ChatPanel直接使用真实assistant-ui/AG-UI与本机HTTP服务，覆盖实际PNG body、整页marker/版本、无模型看/改/移除且无RAG、click/Enter过期、相同ID/版本换源、停止与主动取回、正常第二轮队列真实路由/过期队列零第二请求并恢复草稿，以及同PNG重试/拒绝只搜索。测试HTTP503是故意失败路径。

Server先前将 `document-agent-core.test.ts` 与本片合跑时有2项失败，均为旧XLSX工具目录期望仅5项、当前已有新增工具；该不相关目录未修改。最后仅跑上述真实受影响3文件为18/18；不将其写成全server或全仓通过。此前PNG坏输入文案1失败已修并在最终18项重跑通过。全仓既有技能lint阻断仍由root总报告维护。

## 交 root 浏览器/独立检查

1. 未保存PPTX → 开始/AI → 美化本页，无模型仍见当前页实际PNG与可编辑文字；无模型请求、无dirty/保存变化。
2. 宽、420与短高：真实比例缩略图、页号、移除和配置入口完整可达；带图不堆空态快捷操作，输入区不挤出底部动作。
3. pending取消/Escape回可见入口、迟到不写草稿；成功聚焦输入框且不自动发送。
4. 换页/改稿/换源后发送明确拒绝且文字/PNG保留；移除恢复普通文字路径。可用模型环境再单独验真实视觉美化和续轮，不在本轮无模型验收中冒称完成。

## 已知边界

- 截图是当前静态页面，不带选择框/工具UI，也不承诺放映动画某一时刻。
- 图片只在当前侧栏内存保留，刷新后的历史仍只有文字；第5张历史图须新建对话。旧图若已被有界registry回收，重试明确要求重新准备。
- 源寿命函数不序列化；页面/版本绑定不依赖prompt中的人类文字。
- 独立checker/真实浏览器PNG和布局仍待root，不以组件/HTTP专项代替。
