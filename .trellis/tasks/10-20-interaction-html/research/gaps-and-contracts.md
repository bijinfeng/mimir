# Research: HTML精修候选问题与不可改变的合同

- Query: 模块11现有组件的可疑布局/焦点/状态差距，以及纯视觉打磨边界
- Scope: internal
- Date: 2026-10-20（Asia/Shanghai）

## Findings

**以下均为源码推断，未在浏览器验证，不是已确认缺陷清单。** 主会话已转去优先处理新对话空白页，本模块先保留研究，后续恢复应先对照冻结基线和实际渲染再决定实施。

| 候选 | 来源与机制 | 最小验证 | 合适责任层 |
| --- | --- | --- | --- |
| 插入浮层太宽/窄列横溢出 | `HtmlInsertMenu.tsx:64` panelWidth=360；`editors.css:672` .op-panel min-width320、padding8，外层菜单即使viewport clamp内层仍可能撑开 | 420/390编辑列、320短高、展开图片/表格三态，量内外clientWidth/scrollWidth | 本地HtmlInsertMenu与.op-panel，不改共享壳尺寸机制 |
| 插入字段无可见标签 | `HtmlInsertMenu.tsx:66–88`直接ToolbarSelect/TextField，无ToolbarPropertyForm context；`EditorShell.tsx:107–120`只有context才能渲染label | 展开图片URL/表格，看行列字段有没有可见名称；确认一次主操作标题不重复 | 本地现有PropertyForm/分组复用 |
| CodeMirror浅深变量未桥接 | `vendor/.../cm-setup.ts:36–78`用--cm-*、--surface/--text/--accent-soft/--hover/--border；仓库office/src仅`editors.css:694–696`在图片dialog设置--surface和--text | 真组件浅深取源码bg/text/光标/行号/语法CSS vars；检查宿主是否另有全局变量，不能只凭rg判失效 | .mimir-html-cm局部桥接已有--me-*；vendor不改，不整站注入通用变量 |
| 分栏按viewport而非编辑列适配 | `editors.css:746`媒体max-width1100，宽窗口开Agent或Inspector后编辑列变窄仍保持左右分栏 | 浏览器1280或1440、编辑列690及420，检查每栏实际可用宽高与阅读/编辑可达 | 本地HTML workspace container（已有html-workspace容器） |
| 查找关闭无明确回焦 | `HtmlEditor.tsx:1419`onClose只setFindOpen(false)，`SourceEditor.tsx`有focus handle；共享FindBar关闭会卸载焦点输入 | Mod+F→查词→Escape/关闭，activeElement是否正文CodeMirror；外部焦点行为保持 | 本地关闭handler，不修改其他格式共享查找语义 |
| 规划footer三按钮挤宽 | `html-inspector.css:216`actions flex-direction:row，未wrap；`HtmlAgentPrompt.tsx:198–232`取消、重新拟定、确认，Inspector宽320/窄时100%-32 | 320/288内容区，长文档+短高，按钮完整且footer不被底部裁切 | 本地planning actions wrap/收缩，固定footer保留 |
| 状态与错误长文挤压 | `HtmlEditor.tsx:1458`真实previewTitle与标签作为ToolbarLabel、`HtmlWritingPreview.tsx:108`长错误和警告一层flex | 长title/class/error、420编辑列，短高生成停止/部分稿可达 | 本地状态/写作分组；不删真实状态、不把失败伪装完成 |
| 插入结果缺live反馈 | `HtmlInsertMenu.tsx:90`仅ToolbarNote；CSS/Inspector已有role=status（`HtmlCssControls.tsx:72`,`HtmlElementMenu.tsx:780`） | 成功/错误后的屏幕阅读反馈；错误保持原输入并可修正 | 本地role=status/alert，不能新增消息业务 |
| 演示bar长错误不换行 | `html-presentation.css:10`bar单行flex，`HtmlPresentation.tsx:48–59`全屏不支持/拒绝错误同行 | 390宽、320高全屏错误，退出按钮可达、iframe仍有高度 | 本地bar wrap/min-width/反馈 |
| vendor图片模态短高限制 | `vendor/.../image-dialogs.css:16–26`margin-top96且max-height100vh-32，二者叠加可能下溢；裁切手柄只有mousedown | 390×320实际viewport，图像loaded/error、footer是否可滚到 | 本轮原vendor仅观察记录，不改vendor或伪称已修 |

### 保存、编辑和安全合同

- `HtmlEditor.tsx:136–152`：打开拆BOM/CRLF/LF/尾换行，编辑正文统一LF，保存/导出以Envelope序列化，不能拿srcdoc或instrumented页面当源文件。
- `HtmlEditor.tsx:950–960`：保存抓取开始版本；IO结束后如果版本前进不能清dirty。`use-source.ts:124+`状态必须来自真实写入，不做假成功。
- `HtmlEditor.tsx:1474–1549`：SourceEditor和iframe始终挂载，用hidden切换。卸载会丢CodeMirror历史/未保存文本。
- `HtmlAgentHandle` (`agent/html-agent.ts:297–338`)：expectedVersion校验、compileOps/applyPatches、每批原子，不绕到直接DOM写原件。手动预览和Agent共用handle。
- `HtmlEditor.tsx:458–471`与`HtmlCssControls.tsx:27–38`：临时CSS只换previewHtml，不能改变源码、版本或dirty；取消/关闭/切分类/过期需撤掉临时样式。
- `HtmlEditor.tsx:562–582`：接受预览消息必须检查event.source是当前iframe以及data.version匹配handle。opaque origin不能靠origin==宿主替代source检验。
- `HtmlEditor.tsx:1542–1555`、`HtmlPresentation.tsx:64–69`、`html-output.ts:2–5`：sandbox保留allow-scripts/forms/popups/modals但不增加allow-same-origin；referrer no-referrer。应用主题不改作者页面白底/原样式。
- `HtmlEditor.tsx:962–1028`：图片读前后检查handle/version/sid/src，CORS credentials omit，导入5MB和处理后约7MB data长度守卫；不能删守卫只为演示成功。
- `HtmlElementMenu.tsx:178–190,297–308`：Inspector以baseline版本提交；外部编辑时禁用+刷新，不可自动刷新吞掉用户草稿。void元素只禁不适用操作，保留可发现性。
- `HtmlEditor.tsx:783–877`和`HtmlAgentPrompt.tsx:48–54`：每个问题resolve/abort只属于当前请求，换文档/停止/替代时终止旧请求，不重开；问题单选旧响应形状、多选selections顺序兼容。
- `HtmlAgentPrompt.tsx:173–194`：提纲normalize、必需主张+章节、user_edited、确认/redo/cancel语义不变，章节稳定key。
- `HtmlWritingPreview.tsx:20–97`：独立AbortController、200000字符上限、临时输出不污染原文；只有完整或用户明确保留部分才进入handle，外部signal取消/过期草稿不能覆盖当前文档。
- `HtmlPresentation.tsx:8–40`：演示焦点保存/退出恢复、Escape、Tab边界，注意iframe内键盘与外部窗口必须实际验证。不能把HTML作者内容当主题chrome。
- `HtmlEditor.tsx:307+`宿主onDirtyChange/onSaveRequest与离开守卫保持；本地fixture不能冒充真实导航保存/原生写盘验证。

### 现有回归定位（只读，未执行测试）

- `HtmlEditor.test.tsx:126,164,199`：停止questions/brief、迟到旧会话与换文档。
- 同文件`:391,513,672,734,811,860,918`：BOM/CRLF/预览映射、插入与重开、格式/复制、清style、保存中再编辑、直接预览编辑、移动/旋转。
- `HtmlEditor.complete-tools.test.tsx:191,222,279,350`：CSS临时态、输出隔离、流式生成、过期/取消草稿。
- 同文件`:380,416,449,485,521,544`：Inspector键盘回焦、单位保真、下拉Esc、过期草稿恢复、CSS撤销、void禁用。
- `HtmlEditor.picture.test.tsx:31`：PNG写入和过期像素拒绝。
- `HtmlAgentPrompt.test.tsx:43,75,119,177`：多选顺序/空选、单选兼容、提纲字段/外部焦点、替代方向/redo。

## Caveats / Not Found

- 未运行测试/集成门；上述定位只证明存在回归材料，非本轮通过记录。
- 未通过浏览器检查当前HTML页面、未作产品代码变更。
- 未发现Mimir独立“预览交互/浏览模式”toggle；现iframe由instrumentForPreview注入inspect脚本，演示则原HTML不注入。不要从GenOffice Ribbon外观凭空移植入口。
- vendor inspector发出askAi keyCommand但宿主未处理，不在精修范围新增接线。裁切鼠标手柄无全键盘等价路径、短高可能裁切等现有vendor边界必须明确保留。
