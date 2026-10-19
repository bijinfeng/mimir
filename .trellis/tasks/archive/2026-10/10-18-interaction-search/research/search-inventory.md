# Research: 搜索与命令面板全链路盘点

- Query: 第三模块所有入口、状态、命令宿主交接、失败恢复和视觉打磨边界
- Scope: mixed；产品源码只读，独立HTML规划输入
- Date: 2026-10-18

## Findings

全局面板的唯一实现是 `packages/renderer/src/components/CommandPalette.tsx`，由共享 `routes/_app.tsx` 持有；Web与Desktop共用renderer。共16组、152个稳定覆盖项（不是152页或全笛卡尔积），机器清单为 `search-scenes.json`。每项应映射至HTML具体fixture，多个覆盖项可以由同一可操作fixture证明；宿主交接和真实网络/焦点/渲染定位不能由原型代验。

### Files found

| 文件 | 用途 |
|---|---|
| `packages/renderer/src/components/CommandPalette.tsx` | 输入、搜索、最近项、命令匹配、键盘、按钮与Modal |
| `packages/renderer/src/routes/_app.tsx` | Cmd/Ctrl+K、每项动作、路由、Citation、AskDraft、新建异步 |
| `packages/renderer/src/components/NavSidebar.tsx` | 展开/rail/窄Drawer搜索入口及先关闭Drawer |
| `packages/renderer/src/lib/recent-documents.ts` | 每账号12ID、授权读取与失败计数 |
| `packages/renderer/src/lib/query.ts` | 默认30秒stale、4xx不重试、网络/5xx最多再试2次 |
| `packages/renderer/src/lib/api.ts` | 搜索调用未消费AbortSignal；错误外壳转换ApiRequestError |
| `packages/shared/src/search.ts` | q1–500、SearchHit与snippet原文偏移 |
| `packages/renderer/src/components/DocumentPanel.tsx` | rename/move/find后续弹窗、片段渲染定位 |
| `packages/renderer/src/components/UnsavedGuard.tsx` + `lib/unsaved.tsx` | manual三选/auto双选、保存失败留原位 |
| `packages/renderer/src/routes/_app.chat.tsx` + `packages/chat/src/ChatPanel.tsx` | AI草稿落入新对话输入框，只预填 |
| `packages/renderer/src/components/document/OfficeSourceEditor.tsx:97-100` | Office保存不能由guard代存的既有边界 |

### Source-backed groups / all state IDs

#### search.entry · 入口与打开关闭

- Sources: `packages/renderer/src/routes/_app.tsx:276-285`；`packages/renderer/src/routes/_app.tsx:319`；`packages/renderer/src/components/CommandPalette.tsx:300-347`；`packages/renderer/src/components/NavSidebar.tsx:132-135`
- 当前：open=false不渲染；输入初空；effect卸载只检查isConnected回焦；全局快捷键无repeat/IME检查。
- 拟打磨：保留平台快捷键和重置；回焦需可见的稳定搜索入口兜底；交接弹窗不抢回焦。
- 边界：`in_scope`；Esc/遮罩取消回原有效触发器；执行动作由宿主接管焦点

| 稳定ID | 覆盖项 |
|---|---|
| `search.entry.button` | 展开侧栏搜索按钮 |
| `search.entry.rail` | 折叠功能栏搜索 |
| `search.entry.drawer` | 窄屏抽屉搜索后关闭抽屉 |
| `search.entry.ctrl-k` | Ctrl+K打开/再次切换关闭 |
| `search.entry.cmd-k` | Cmd+K打开/再次切换关闭 |
| `search.entry.editor` | 编辑器中唤起且不触发浏览器默认 |
| `search.entry.reset` | 关闭重开清空输入/首项选中 |
| `search.entry.escape` | Esc关闭 |
| `search.entry.mask` | 遮罩关闭 |
| `search.entry.focus-live` | 回到存活触发器 |
| `search.entry.focus-missing` | 触发器卸载或隐藏的回焦兜底 |

#### search.recents · 空输入最近笔记

- Sources: `packages/renderer/src/components/CommandPalette.tsx:321`；`packages/renderer/src/components/CommandPalette.tsx:437-447`；`packages/renderer/src/lib/recent-documents.ts:6-75`
- 当前：hook已提供失败计数/错误并过滤权限项，Palette只取data数组，忽略loading/error/retryableFailureCount，所以静默退化为操作列表。Palette未slice6，最多12个ID中的note均显示。
- 拟打磨：展开独立最近反馈区，真空/读取/部分失败/全失败分开；只展示授权返回项；重试期间不伪称已恢复。
- 边界：`in_scope`；Esc/遮罩取消回原有效触发器；执行动作由宿主接管焦点

| 稳定ID | 覆盖项 |
|---|---|
| `search.recents.loading` | 有ID初次读取 |
| `search.recents.empty` | 无历史或仅非笔记 |
| `search.recents.ready` | 最多12条历史中的note按序 |
| `search.recents.partial` | 部分网络/5xx失败且有可见note |
| `search.recents.failed` | 全部暂时读取失败 |
| `search.recents.retry` | 原位重试/忙碌 |
| `search.recents.filtered` | 403/404不显示标题 |
| `search.recents.unauthorized` | 401归查询错误不伪装为空 |
| `search.recents.storage` | 损坏/禁用存储降级 |
| `search.recents.revision` | 跨标签storage或本次记录更新 |
| `search.recents.user-unknown` | 用户ID未知不触发最近读取 |

#### search.input · 查询输入与中文输入法

- Sources: `packages/renderer/src/components/CommandPalette.tsx:349-360`；`packages/renderer/src/components/CommandPalette.tsx:483-513`；`packages/shared/src/search.ts:15-21`
- 当前：阈值用JS字符串length；无debounce/maxLength/composition处理；API q最大500而Input无上限。
- 拟打磨：保持2字符门槛，组合期不导航/执行/检索未确认词；约束到已存在500上限并清楚反馈；不引入筛选或新快捷键。
- 边界：`in_scope`；Esc/遮罩取消回原有效触发器；执行动作由宿主接管焦点

| 稳定ID | 覆盖项 |
|---|---|
| `search.input.blank` | 纯空格等同空查询 |
| `search.input.single` | trim后长度1不请求文档但匹配命令 |
| `search.input.two` | trim后长度>=2开始检索 |
| `search.input.case` | 命令名称/副标题大小写不敏感子串匹配 |
| `search.input.clear` | 清空恢复最近与操作 |
| `search.input.compose` | 中文组合输入不误选/发送 |
| `search.input.compose-enter` | 选字Enter不得执行命令 |
| `search.input.compose-arrows` | 候选箭头不得移选行 |
| `search.input.long` | 超长查询与500字API上限 |
| `search.input.paste` | 粘贴长文本保持输入可编辑 |

#### search.query · 检索请求与恢复

- Sources: `packages/renderer/src/components/CommandPalette.tsx:355-360`；`packages/renderer/src/components/CommandPalette.tsx:608-633`；`packages/renderer/src/lib/query.ts:11-23`；`packages/renderer/src/lib/api.ts:1055-1059`
- 当前：queryKey按trim词隔离、无placeholderData；缓存仅同词复用；未消费AbortSignal。状态在AI行，pending Enter已拦；鼠标按钮仍能执行；后台错误仍可能留缓存hits。
- 拟打磨：独立可读检索状态、同一词重试；旧查询绝不作当前词结果；刷新中保留已确认上下文但不隐瞒错误；不要宣称现有查询隔离有覆盖bug。
- 边界：`in_scope`；Esc/遮罩取消回原有效触发器；执行动作由宿主接管焦点

| 稳定ID | 覆盖项 |
|---|---|
| `search.query.loading` | 首次请求且无命中 |
| `search.query.pending-command` | 请求期间临时命令排首不因Enter执行 |
| `search.query.cached` | 30秒缓存同词返回 |
| `search.query.refresh` | 同词缓存后台刷新 |
| `search.query.empty` | 检索成功无命中 |
| `search.query.error` | 网络/5xx最终失败 |
| `search.query.retry` | 重试保持原查询 |
| `search.query.retry-pending` | 重试按钮忙碌防重复 |
| `search.query.error-cached` | 缓存存在但本次读取失败 |
| `search.query.query-race` | 快速改变查询旧结果不得覆盖新词 |
| `search.query.closed-late` | 关闭后迟到结果不打开面板 |
| `search.query.query-clear` | 请求中清空不显示旧命中 |

#### search.hits · 文档命中与文本信息

- Sources: `packages/renderer/src/components/CommandPalette.tsx:430-460`；`packages/renderer/src/components/CommandPalette.tsx:535-549`；`packages/renderer/src/components/CommandPalette.tsx:181-201`；`packages/shared/src/search.ts:33-84`
- 当前：最多6 hits，各chunk独立；同doc标题附·命中N；path/url/mime/size未消费；标题与片段单行ellipsis无Tooltip；found显示documents.length处。
- 拟打磨：中性选中+可见焦点；正文片段更易扫读(可两行)且长内容可达；保留每chunk独立导航与排序，不合并去掉定位，不造来源/时间/得分。
- 边界：`in_scope`；Esc/遮罩取消回原有效触发器；执行动作由宿主接管焦点

| 稳定ID | 覆盖项 |
|---|---|
| `search.hits.one` | 单命中标题+片段 |
| `search.hits.multi-document` | 多文档按服务器返回顺序 |
| `search.hits.multi-chunk` | 同文档多片段分行保留命中序号 |
| `search.hits.long-title` | 超长标题可获全文 |
| `search.hits.long-snippet` | 超长片段可获全文 |
| `search.hits.path-null` | 根路径/null来源保持真实 |
| `search.hits.file` | 文件/网页命中也能打开 |
| `search.hits.six` | limit6代表命中处而非文档数 |
| `search.hits.count` | 显示实际命中处而非虚构总量 |
| `search.hits.punctuation` | 尖括号与特殊字符按纯文本显示 |

#### search.selection · 选择与键盘可达

- Sources: `packages/renderer/src/components/CommandPalette.tsx:465-468`；`packages/renderer/src/components/CommandPalette.tsx:495-519`；`packages/renderer/src/components/CommandPalette.tsx:637-692`
- 当前：输入拥有方向键；行是真button可Tab；srOnly报告当前选择；无combobox/listbox aria链；只按数字index选中，数据变化不重置/钳制；scroll effect只依赖index。鼠标row.run不主动close，但当前宿主每项均负责close。
- 拟打磨：用稳定key处理数据变化并明确恢复首项；键盘与鼠标执行同一防重/忙碌逻辑；保留真实button语义，不混入伪listbox交互。
- 边界：`in_scope`；Esc/遮罩取消回原有效触发器；执行动作由宿主接管焦点

| 稳定ID | 覆盖项 |
|---|---|
| `search.selection.first` | 默认最近/结果首项 |
| `search.selection.documents-first` | 有结果时结果先于匹配命令 |
| `search.selection.commands-only` | 无结果时命令为首 |
| `search.selection.down` | ArrowDown到末项不循环 |
| `search.selection.up` | ArrowUp到首项不循环 |
| `search.selection.scroll` | 选择滚入列表视口 |
| `search.selection.hover` | 鼠标进入更新activeIndex |
| `search.selection.click` | 鼠标执行对应行 |
| `search.selection.tab` | Tab到按钮Enter/Space执行 |
| `search.selection.list-growth` | 异步插入结果时语义选择稳定 |
| `search.selection.list-shrink` | 列表缩短activeIndex不失效 |
| `search.selection.announce` | 读屏报告当前选项和请求状态 |

#### search.new-note · 新建笔记异步动作

- Sources: `packages/renderer/src/components/CommandPalette.tsx:370-378`；`packages/renderer/src/routes/_app.tsx:371-385`；`packages/renderer/src/routes/_app.tsx:199`；`packages/renderer/src/components/DocumentPanel.tsx:785-799`；`packages/office/src/editors/MarkdownEditor.tsx:777-781`
- 当前：run void onNewNote；宿主先关palette再create；无runGuarded/单飞；成功toast+setNewNoteFocusId+openDocument(all)，失败仅toast；可重开重复发。
- 拟打磨：先经过现有guard、再显示单飞创建中；失败保留可操作上下文；成功再导航。POST无幂等键，超时重试不能保证绝不生成副本，不伪造撤销。
- 边界：`in_scope`；Esc/遮罩取消回原有效触发器；执行动作由宿主接管焦点

| 稳定ID | 覆盖项 |
|---|---|
| `search.new-note.ready` | 全局新建笔记可匹配 |
| `search.new-note.dirty` | 先确认未保存再创建 |
| `search.new-note.pending` | 请求中不重复新建 |
| `search.new-note.success` | 真实成功才导航根目录并聚焦笔记正文 |
| `search.new-note.failed` | 失败留原上下文与重试 |
| `search.new-note.cancel-guard` | 取消离开不创建 |
| `search.new-note.repeat` | 连续Enter/点击只发一次 |
| `search.new-note.response-lost` | 网络结果不确定不承诺幂等创建 |

#### search.capture · 收集入口交接

- Sources: `packages/renderer/src/components/CommandPalette.tsx:379-385`；`packages/renderer/src/routes/_app.tsx:137-162`；`packages/renderer/src/routes/_app.tsx:344-347`
- 当前：宿主先setPaletteOpen(false)再openCapture，capture记录当时activeElement可能是即将卸载的palette行，取消有稳定收集入口fallback。
- 拟打磨：仅打磨交接焦点/层级；收集内容流程归模块4；不在此设计新增上传/取消能力。
- 边界：`handoff_only`；Esc/遮罩取消回原有效触发器；执行动作由宿主接管焦点

| 稳定ID | 覆盖项 |
|---|---|
| `search.capture.ready` | 匹配收集链接或文件 |
| `search.capture.handoff` | 关闭面板交接真实收集弹窗 |
| `search.capture.focus` | 焦点进入新弹窗不跳回背景 |
| `search.capture.cancel` | 收集取消回稳定入口 |
| `search.capture.dirty` | 打开收集无需离开现文档 |

#### search.context · 当前文档能力和上下文

- Sources: `packages/renderer/src/components/CommandPalette.tsx:322-326`；`packages/renderer/src/components/CommandPalette.tsx:387-426`；`packages/renderer/src/routes/_app.tsx:353`
- 当前：只在docs页传ID；kind未知时仍显示移动+返回，note两项随query出现；currentDocQuery错误无就地提示。
- 拟打磨：保留能力条件，读取失败可说明重试；绑定正确文档，避免弹窗保存到切换后的ID；不扩展Office查找。
- 边界：`in_scope`；Esc/遮罩取消回原有效触发器；执行动作由宿主接管焦点

| 稳定ID | 覆盖项 |
|---|---|
| `search.context.none` | 库列表/设置/对话无当前文档命令 |
| `search.context.note` | note显示改名/移动/搜索/返回库 |
| `search.context.file` | file及只读资料仅移动/返回库 |
| `search.context.loading` | 文档类型未知不猜note专属命令 |
| `search.context.error` | 当前文档读取失败不伪造note命令 |
| `search.context.cached` | 同document query缓存共用 |
| `search.context.switch` | 命令绑定唤起时当前文档 |

#### search.rename · 当前笔记重命名宿主衔接

- Sources: `packages/renderer/src/routes/_app.tsx:358-361`；`packages/renderer/src/components/DocumentPanel.tsx:103-116`；`packages/renderer/src/components/DocumentPanel.tsx:294-302`；`packages/renderer/src/components/DocumentPanel.tsx:675-681`；`packages/renderer/src/components/DocumentPanel.tsx:913-948`
- 当前：宿主CustomEvent同步打开；Modal未绑定confirmLoading/pending退出，mutation失败toast，await拒绝可能逃逸；Input无onPressEnter；closeCommand对存活行ref或更多按钮fallback，存活不等于可见。
- 拟打磨：只完善命令链路必要pending/inline-error/focus，不重做全文档头部；保护文档身份和草稿。若dirty元数据与autosave竞态，须在实施前明确host合同。
- 边界：`handoff_and_safety`；Esc/遮罩取消回原有效触发器；执行动作由宿主接管焦点

| 稳定ID | 覆盖项 |
|---|---|
| `search.rename.handoff` | 事件交接到重命名弹窗 |
| `search.rename.prefill` | 预填标题最长200 |
| `search.rename.empty` | 空白不能提交 |
| `search.rename.unchanged` | 未变直接关闭 |
| `search.rename.pending` | 异步改名锁重复和退出 |
| `search.rename.error` | 失败保留标题草稿 |
| `search.rename.success` | 更新缓存/列表和标题 |
| `search.rename.ime` | 组合Enter不提交 |
| `search.rename.cancel-focus` | 取消回有效文档操作入口 |

#### search.move · 当前文档移动宿主衔接

- Sources: `packages/renderer/src/components/DocumentPanel.tsx:321-363`；`packages/renderer/src/components/DocumentPanel.tsx:913-973`
- 当前：Select由flattenFolders生成，空query等同只有根选项；folder加载/错误未区分；move有try/catch返回boolean与8秒撤销toast，无pending单飞；更名/移动与编辑保存竞态需实测。
- 拟打磨：只演示并改进命令交接必要读取/保存反馈；保留已有撤销并说明真实失败，不扩展目录管理。
- 边界：`handoff_and_safety`；Esc/遮罩取消回原有效触发器；执行动作由宿主接管焦点

| 稳定ID | 覆盖项 |
|---|---|
| `search.move.prefill` | 预填当前目录/根 |
| `search.move.folder-loading` | 目录首次加载 |
| `search.move.folder-error` | 目录读取失败可重试 |
| `search.move.nested` | 长层级目录选项可达 |
| `search.move.unchanged` | 同目录直接关闭 |
| `search.move.pending` | 移动中防重复/防关闭 |
| `search.move.error` | 失败保留所选目录 |
| `search.move.success` | 真实成功更新并提供既有撤销 |
| `search.move.undo` | 既有撤销成功/失败不伪造事务 |
| `search.move.cancel` | 取消不改目录 |

#### search.find · 当前笔记查找宿主衔接

- Sources: `packages/renderer/src/components/DocumentPanel.tsx:684-703`；`packages/renderer/src/components/DocumentPanel.tsx:935-955`；`packages/renderer/src/components/DocumentPanel.tsx:1076-1149`
- 当前：OK仅按非空禁用，find实际query.length<2直接return；onPressEnter无IME拦截；未匹配message.info；找到close。
- 拟打磨：门槛前后一致，未命中原处说明，保留Enter与文本；不新增上一处/下一处/替换/计数引擎。
- 边界：`handoff_and_safety`；Esc/遮罩取消回原有效触发器；执行动作由宿主接管焦点

| 稳定ID | 覆盖项 |
|---|---|
| `search.find.blank` | 空输入禁用 |
| `search.find.one` | 1字符当前静默无效 |
| `search.find.two` | 至少2字符可查 |
| `search.find.found` | 找到首个可定位匹配并滚入视口 |
| `search.find.not-found` | 未匹配仍留弹窗草稿 |
| `search.find.ime` | Enter选字不查找 |
| `search.find.close` | Esc/取消回文档动作 |
| `search.find.case` | 大小写及归一化与现实现一致 |

#### search.open-hit · 打开命中/最近/返回库

- Sources: `packages/renderer/src/routes/_app.tsx:238-267`；`packages/renderer/src/routes/_app.tsx:348-365`；`packages/renderer/src/components/DocumentPanel.tsx:549-608`；`packages/renderer/src/components/DocumentPanel.test.ts:4-28`
- 当前：搜索保存snippet/start/end/matchedBy；host runGuarded后导航；Citation匹配优先真正文，失败只打开；无网络文档重试UI属下模块。
- 拟打磨：保留真实定位算法和每命中差异；HTML明确模拟滚动不能替代产品渲染定位；取消guard恢复可用搜索上下文。
- 边界：`handoff_and_regression`；Esc/遮罩取消回原有效触发器；执行动作由宿主接管焦点

| 稳定ID | 覆盖项 |
|---|---|
| `search.open-hit.recent` | 最近note按folder scope打开 |
| `search.open-hit.hit` | 检索命中按scope all打开并带完整Citation |
| `search.open-hit.same-document` | 同文档第二命中重置旧高亮再定位 |
| `search.open-hit.repeated-text` | 重复原句按sourceStart辨别正确出现处 |
| `search.open-hit.late-content` | 正文异步加载重试最多20×150ms |
| `search.open-hit.missing` | 文档变化找不到只打开不乱高亮 |
| `search.open-hit.no-highlight-api` | 无CustomHighlight仍滚动定位 |
| `search.open-hit.back` | 返回知识库保留当前scope清id |
| `search.open-hit.load-error` | 打开文档读取失败归文档模块 |
| `search.open-hit.cancel-guard` | 取消离开不改变route/citation |

#### search.ai · 显式AI动作

- Sources: `packages/renderer/src/components/CommandPalette.tsx:469-474`；`packages/renderer/src/components/CommandPalette.tsx:608-633`；`packages/renderer/src/routes/_app.tsx:366-370`；`packages/chat/src/ChatPanel.tsx:178-194`
- 当前：提问在input之外的Button；输入Enter不默认ask；host设置AskDraft并跳/chat，ChatPanel.setText而非send；host此分支目前缺runGuarded。
- 拟打磨：保留独立按钮，可改更清楚“向AI提问”但不得声称立即请求；guard之后才赋草稿和导航；AI实际消息生成归模块7。
- 边界：`in_scope`；Esc/遮罩取消回原有效触发器；执行动作由宿主接管焦点

| 稳定ID | 覆盖项 |
|---|---|
| `search.ai.blank` | 空白无提问动作 |
| `search.ai.one` | 1字符也可显式提问 |
| `search.ai.searching` | 检索中显式提问可选 |
| `search.ai.empty` | 无匹配时不默认发送 |
| `search.ai.error` | 检索失败仍可显式选择AI |
| `search.ai.keyboard` | Tab到提问Enter/Space明确触发 |
| `search.ai.prefill` | 进入新对话只预填问题不自动发送 |
| `search.ai.scope` | 保留当前scope而非捏造当前文档附件 |
| `search.ai.dirty` | 离开dirty内容先guard |
| `search.ai.cancel` | 取消guard不写入对话草稿 |

#### search.guard · 未保存离开联动

- Sources: `packages/renderer/src/components/UnsavedGuard.tsx:37-89`；`packages/renderer/src/lib/unsaved.tsx:75-130`；`packages/renderer/src/routes/_app.tsx:348-385`；`packages/renderer/src/components/document/OfficeSourceEditor.tsx:97`
- 当前：最近/命中/返回已有guard；new-note与AI没有；UnsavedGuard自身禁止mask/Esc，manual三选/auto双选，失败留原位；Office saveFromHere提示工具条而返回false。
- 拟打磨：仅补齐会离开内容的两个缺口并正确焦点交接；不改变共享guard选项/Office保存算法；HTML分别演示成功和不可代存。
- 边界：`handoff_and_safety`；Esc/遮罩取消回原有效触发器；执行动作由宿主接管焦点

| 稳定ID | 覆盖项 |
|---|---|
| `search.guard.clean` | 干净直接动作 |
| `search.guard.manual` | 手动保存三选 |
| `search.guard.auto` | 自动保存仅继续/保存并离开无丢弃 |
| `search.guard.saving` | 保存中锁定全部退出 |
| `search.guard.save-failed` | 保存失败留原位和改动 |
| `search.guard.saved-during` | auto后台完成提示已自动保存可离开 |
| `search.guard.discard` | manual丢弃后原目标执行一次 |
| `search.guard.continue` | 继续编辑恢复原处焦点 |
| `search.guard.office` | Office原件保存句柄不能代存需工具条保存 |

#### search.layout · 浅深/长内容/跨宿主布局

- Sources: `packages/renderer/src/components/CommandPalette.tsx:65-279`；`packages/renderer/src/components/CommandPalette.tsx:552-573`；`packages/renderer/src/components/NavSidebar.tsx:132-135`
- 当前：Modal620/top14vh；列表max48vh/440，footer会整项换行；继承token；选中仍colorPrimaryBg+colorLink；无专属低高度fit约束。
- 拟打磨：沿用已认可中性选中、细边和类型尺寸，保留focusRing；限制整面板视口内高、内部列表滚动，固定输入与尾部；不重做全局tokens。
- 边界：`in_scope`；Esc/遮罩取消回原有效触发器；执行动作由宿主接管焦点

| 稳定ID | 覆盖项 |
|---|---|
| `search.layout.light` | 浅色桌面620px面板 |
| `search.layout.dark` | 深色对比和焦点 |
| `search.layout.narrow` | 390px所有动作与长行无横溢 |
| `search.layout.low` | 390×500底部动作仍可达 |
| `search.layout.zoom` | 200%缩放内容可滚动 |
| `search.layout.touch` | 粗指针至少44px点击区 |
| `search.layout.reduced-motion` | 减少动效遵循现框架 |
| `search.layout.drawer-focus` | Drawer发起时关闭后回52px功能栏入口 |
| `search.layout.desktop` | Electron相同renderer，原生键盘宿主另验 |
| `search.layout.screen-reader` | 弹窗名称/结果状态/选项选择可感知 |

### 必须保留的细分合同

1. 空输入优先最近note，再通用操作；无当前doc只新建/收集。当前note再有rename/move/find/back；file/网页等只有move/back。type尚未读到时不能猜note能力。
2. 搜索阈值是trim后JS length>=2；命令匹配对任意非空trim词生效。搜索limit6是chunk命中数，同文档重复片段独立命中序号；“找到N处”不是N篇，不凭API total虚构全部展示。
3. `queryKey:[palette-search,trim]`已经隔离不同词的响应；无placeholderData，不应把“旧响应覆盖新查询”写成已证实bug。同词缓存刷新失败仍可能显示cache hits，需清楚提示并考虑失权数据；401并无全局自动login重定向（request只抛错），不要画成已有能力。
4. Enter在searchQuery.isFetching时不执行临时首命令，是已有保护。行按钮click/Tab Enter仍走run，行为路径并不一致。activeIndex为数字而非稳定key；异步插入/缩短列表时可跳到别语义项或越界无当前项，需测试后修正。
5. new-note现先close再POST，未经过未保存guard，无pending单飞；失败只有toast。应先确认离开再创建，等待真实成功才导航，失败提供原处恢复。POST无幂等合同；服务器成功但响应丢失的重试不保证绝无副本，也无取消请求等于取消创建/撤销承诺。成功聚焦正文末尾（MarkdownEditor.tsx:777–781），不是标题。
6. 提问Button是独立显式动作；未匹配命令按Enter不会自动问AI。`_app.tsx:366–370`仅setAskDraft+跳/chat保留scope；`ChatPanel.tsx:178–194`仅setText，不调用send。此分支当前缺runGuarded，拟补齐但不得把预填演示成模型已发送或伪造回答。
7. 最近项GET已过滤403/404、401抛查询错误、网络/5xx计数，Palette目前忽略状态。最近note最多12ID子集，与侧栏RecentNotes的6篇上限不同。无需重复改动已完成hook。
8. 当前文档命令通过CustomEvent交接。rename/move/find不切离文档，无需硬套离开guard；应绑定正确document id、防重复/保存中退出/错误草稿/焦点handoff。原文编辑未保存时metadata与autosave如何交互需实施前核对，不在规划中承诺无冲突。
9. find UI当前只禁空，内部<2就return，所以1字静默；两处门槛应一致。只查定位匹配不加next/prev/replace引擎。move已有8秒撤销toast，是真请求，撤销失败需如实保留；不去掉也不虚构事务。
10. 命中Citation带start/end、snippet、matchedBy；渲染定位会按sourceStart辨别重复文本，异步重试20次150ms。缺失时只打开，不高亮另一次相同句。无Highlight API仍滚动。HTML模拟不能验证Tiptap/Office原文渲染。

### Scope boundaries / recommended slices

建议将16组收敛为10个review切片：①打开/最近读取；②查询门槛/IME；③搜索结果/重复片段；④请求/错误/重试；⑤键盘/长列表；⑥上下文命令能力；⑦新建/收集交接；⑧当前rename/move/find必要链路；⑨AI/未保存离开；⑩窄屏/低高/主题/回焦。每切片共享同内容和尺寸的Before/After，全部152项需落入coverage映射。布局维度不要求为每个状态复制一张静态图，但每个可操作场景应支持浅深和窄屏切换。

- 主视觉：用户已认可语雀适配、白灰表面、细边、紧凑间距、中性选中和可辨键盘焦点。620px现面板与常见48px结果行可保留，先解决布局与反馈，不为了新风格改全局token。
- 控件：保留AntD Modal焦点圈定/遮罩/Esc与真实button；回焦检查isConnected还需可见性兜底。Drawer入口已先关闭其自身，面板关后不能focus隐藏Drawer按钮。
- 可加入明确输入门槛、独立状态行、就地重试、长标题/片段可读、当前选择语义稳定，以及真实pending/禁用原因。不要添加筛选Tab、搜索模式开关、消息/Agent搜索、分页、得分、来源时间或新键盘快捷键。
- 收集后续页面留模块4，完整知识库管理留模块5，阅读文档框架/头部完整改版留模块6，AI发送与生成留模块7，Office编辑器内部查找留各格式。当前rename/move/find的必要chain反馈可以本模块展示，未来完整文档稿不得重复重设计。
- dirty确认沿用manual三选/auto双选以及auto已保存“离开”，Office原件saveFromHere不能代存且明确工具条保存；不改共享保存算法、beforeunload或原生窗口行为。

### External references (docs, versions)

- 2026-10-18重新HTTP核查 `https://weknora.weixin.qq.com/`、GitHub releases/latest与v0.8.3 tag ref。采样latest为v0.8.3，published_at=2026-10-14T07:53:24Z，tag确认为commit `3e22822c1d2397be730c458c7539d0eb8c113a24`。固定源码URL/HTTP/字节/hash见reference-evidence.json，源快照`.source.txt`不可作为项目可执行TS。
- 官网具体说“结合语义与关键词检索…回答附带来源引用，可打开原文核对”；适用于保留命中→原文核查，不足以证明其登录工作台样式和键盘行为。
- 固定 `GlobalCommandPalette/useSearch.ts:57–80,233–281,332–349` 默认350ms防抖+requestSeq旧响应判定，可借鉴归属意识；其KB/消息多源搜索超出Mimir范围，catch转空(`260–277`)不适合作为本轮错误体验。
- `ResultItem.vue:1–35,69–114` button/中性selected/标题片段/独立hover，适合与Yuque中性角色合流；不照搬score百分比或vector徽标。
- `useStartChat.ts:20–37` query预填+路由交接与Mimir现合同同向；KB附件、消息检索、锁定筛选等能力不移植。
- WeKnora为知识库/Agent域参考；Obsidian只保留布局连续性；语雀为用户已定视觉主参考。本次未登录其私人工作台，也未实际运行WeKnora，不声称像素级复刻。Office工具条未使用WeKnora Markdown编辑器作为参考。

### Related specs

- `.trellis/spec/project/product.md:450` 快速切换/命令/AI显式选择；§5.9未保存离开。
- `.trellis/spec/project/design.md:9,74–101,173–193,240` 已认可语雀角色、尺寸、主题/焦点与共享流程。
- `.trellis/spec/renderer/frontend/conventions.md` token/createStyles、API/Query、Compiler约束。
- `.trellis/spec/renderer/frontend/forms.md` 失败保留草稿、真实pending、IME、弹层回焦。
- `.trellis/spec/renderer/frontend/document/conventions.md` 原件/笔记查看与保存宿主能力边界。
- 相邻模块基础组件v1 design与工作区v2 design：保留细边/中性选中、44px粗指针、现有确认分支；冻结原型不修改。

### Existing tests / verification limits

`DocumentPanel.test.ts:4–28`有3个重复文本/Markdown归一化/目标缺失不误高亮纯函数测试。`recent-documents.test.ts`验证ID顺序隔离/坏存储/权限/网络失败/401/重试，`nav/RecentNotes.test.tsx`是真React Query加载/失败/隐藏旧权限标题/恢复导航测试，但不是Palette自身UI测试。仓内对CommandPalette/Palette搜索文本的test搜索未发现专门组件或AppShell命令集成测试；本轮规划应补将来最有价值的IME、pending、防误命令、AI未发送、未保存chain和宿主回焦测试，不先写产品测试。

父会话已采集真实浏览器baseline `verification/current-desktop-empty.png`、`current-desktop-results.png`、`current-narrow-results.png`；这里只引用父会话产物，研究代理未自行操作GUI，不以源码结论称已复现所有焦点/样式缺陷。

## Caveats / Not Found

- 本代理仅写research，未改产品/规范、未激活任务、未提交；研究不等于用户认可HTML。
- 152项为当前源码可达状态+明确提案安全修正，原型需保持真实Before缺口，不把拟加loading/inline-error/guard画成已有。
- Electron原生快捷键、实际软键盘、系统主题切换、读屏、200%zoom与CustomHighlight支持需对应宿主另验；HTML可预览路径但不能代验。
- query401不会由api.request自动跳登录；根session授权与后续失效处理属于既有鉴权/全局模块，不在此新造自动登出算法。
- 当前doc刷新及并发编辑可能改变行号和能力；所有metadata写入的脏内容竞态、保留doc身份、异常promise处理须实现阶段复核。
- 搜索算法/排序/分词/向量、API新增能力、Office工具、跨窗口未保存不在此范围。
