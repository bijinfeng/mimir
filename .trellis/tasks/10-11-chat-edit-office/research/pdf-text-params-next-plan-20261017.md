# PDF 标注与插字参数补全：固定源码复核与下一实施方案

2026-10-17，root。当前只读源码证据，不冒称已实施/验收。用户明确所有工具补齐；本片用于防止只按工具名计数遗漏真实参数。

## 固定来源与现状

主参考 `/tmp/mimir-genoffice-html-git` HEAD实际读回 `480548fd55f1be3593ee0d8e316a734751d58309`。

- 上游 `apps/pdf/src/renderer/ai/tools.ts:267–290,1258–1288`：markup_text对真实文字片段默认首处、all=true全部，color=#RRGGBB，支持三型标注。当前 `pdf-agent-catalog.ts:109`没有all/color；`office/src/agent/pdf-content-agent.ts:228–254`仍要求唯一完整run，拒all/color。
- 上游 `tools.ts:498–546`：insert_text只要求page/text，anchor_text+placement或x/y，默认页面顶部居中；max_width换行、align、font、bold、italic。`:595–613` edit_inserted_text有align。当前 `office/src/agent/pdf-agent.ts:309`要求x/y，只传text/fontSize/color；PdfAgentTextInsert/PdfPendingTextInsert无font/align/lineLeading/offsets。`PdfEditor.tsx:1318`重放也只保留这些字段。当前catalog同样缺这些参数。
- 本仓vendor `apps/pdf/src/shared/ipc.ts:305–323`原生TextInsertInput已有font/bold/italic/lineLeading/lineXOffsets/align/rotate，可以沿现有host真实写入，不应只改catalog。
- add_form_mark已在pdf-local-catalog:111与pdf-local-agent:38真实执行，不因pdf-agent-catalog未直接写name而误报缺失。
- 固定上游45个直接声明顶层工具与当前三catalog（包括tool(...)和动态note工具）比对，确定缺名只有image_search/generate_image，另有上述参数缺口。不能把“缺名只有2”当作完整工具证明。
- 固定上游App.tsx:1588明确不核验certificate signatures；数字证书不属于已证明的GenOffice工具缺口。仍须如实说明本地视觉签名不等于证书，不能据泛Office愿望扩出无界必须项。

WeKnora按AGENTS核对现有固定证据：v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24`，官网HTTP200与definitions.go内容/hash见xlsx-pivot-next-plan-20261017.md §3；已读缓存definitions中知识读取、wiki/sandbox真实backend门控。适用于真实能力注册/拒绝原因，不提供PDF文字几何、写回或Office工具栏，不作为视觉模板。

## 标注实施方向

让模型传text/page/type/all/color语义，由当前工作bytes服务端定位；不让模型或浏览器猜目标quads。保留旧verified target手动路径兼容，新增严格文本标注请求分支（相同apply-markup端点或annotations具名op，实施时选最小接缝）。从同一次PDFium原文字形取得字符source map和实际box，确定部分/多处/跨run跨行命中与原生用户坐标；可复用已有pdf-block-writer的codepoint/generated字符处理，不使用字符串长度比乘run矩形作为精确标注依据。以源字节hash绑定，全部命中校验后在同一pdf-lib对象图追加一次序列化，all不是多个公开请求的半提交。

需要准确规范化匹配和UTF-16/source codepoint映射、NFKC扩长/emoji与空白/跨行，真实glyph箱和旋转/CropBox不能混坐标；多行一个命中可多quad，默认仅首处且命中计数返回真实。无命中、无可靠字形、超预算/坏色/坏type/全项失败零bytes/version/history；保留现有文档结构守卫，不以注释改动理由全局放开writer。原件正文对象、流/字体/图片、普通外来批注不改，独立PDF.js读回三型QuadPoints/C/真实AP与数量。

手动沿既有原文/标注Inspector提供当前选中文字/文字输入、三类型、颜色与“全部匹配”，显式唯一主“添加标注”，显示实际命中数；不是全宽表单。320px body内滚、fixed footer、420×500/Escape/失败保留草稿。真正一次host→一次version/history/dirty；pending页面/插字仍按当前明确保存合同，不得静默丢掉。

## 插字实施方向

保留输入逻辑text与实际wrapped text、font/bold/italic、align、maxWidth、lineLeading/offsets为pending模型的一部分，capture/restore/保存期间重放/编辑/删除/batch幸存T路径完整传递，不能只在初次插入生效。文本布局复用Server已有字体选择/真实字宽与CJK覆盖，调用同一native writer实际写字；不在浏览器以CSS测量宣称与PDF字形一致。

锚点必须从当前bytes/显示方向文字几何定位唯一真实片段，placement按上游right/below/above；x/y二者齐全且不与anchor混用；无坐标按原页尺寸算顶部居中。max_width/字号/坐标预算与页内边界明确校验。默认原有显式xy保持一致；manual origin仍可内部专用，不暴露模型随意传user coords。

新旧PendingTextInsert及history/state恢复兼容；旧只有text/size/color的对象读取默认left/auto-font。edit_inserted_text支持align并按逻辑原文重排，省略所有属性no-op不升版本；停止/切页/换源/版本迟到不应用。统一手动插字Inspector可设置字体、字号、bold/italic/align/换行宽度/颜色与当前坐标，点纸面定位的高频路径保留；拖动/尺寸手势另须真实完成，不能认为数值框等于手势。

## 文件边界与验收

预期shared/src/pdf-agent.ts（若新增strict schema）、Office agent/pdf-content-agent.ts和pdf-agent.ts/Pending模型、PdfEditor最小接缝+局部控件，server pdf-agent-catalog/host或新增native adapter、既有route/renderer API类型透传。不碰并行DOCX/XLSX；和外部图片桥owner协调PdfEditor/catalog/conversations/shared PDF ownership，禁止并写。

需要实际native正向部分/重复all/跨行/三型颜色、四Rotate与offsetCrop、源对象流精确保留、无命中/异常原子拒绝；完整HTTP401/404/错误schema/当前工作bytes；真实Editor一次发布/save/UndoRedo、迟到/取消/错误草稿；字体/粗斜体/对齐/max_width及中文两次保存与pending重放，独立PDF.js读回字形/位置。root统一1280与420×500浏览器、真实保存重开/native/history。只target测试/type/static，root统一重型门禁，无模型/Desktop自验，不暂存提交归档删件。

本计划不能替代最终完整工具逐项参数审查；其他格式的兼容与手动剩余项继续保持在总清单。
