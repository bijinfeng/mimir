# packages/office —— Office 文档的浏览器内预览与编辑

这个包是 **vendored 代码 + mimir 适配层**：引擎与编辑器来自
[GenOffice](https://github.com/genspark-ai/genoffice)（Apache-2.0），
mimir 侧负责打开、补丁保存、agent 画布句柄与样式裁剪。

DOCX 对话编辑是这层适配的扩展：`src/agent/docx-agent.ts` 持有可撤销的
`DocxAgentHandle`，读取当前未保存画布，逐工具验证参数与版本，并把正文外的
样式、批注、注释、图表、页面与媒体改动交给 `DocxSession.save` 的附加选项。
写工具不得直接改 `vendor/`，也不得用模型 JSON Schema 代替执行时验证；
活动写作草稿必须计入 dirty 和离开守卫。工具、续轮及保存测试合同见
[DOCX 对话编辑](../../../shared/contract/docx-agent.md)。

**动手前先读这一页。** 它讲的都是「不知道就会毁掉几个月工作」的事。

### DOCX 原件保护 P0

保护策略必须从原件 settings XML及其document relationship读取，独立于公开parsed、编辑器editable和SaveOptions。启用readOnly/comments/forms/trackedChanges的原件，在受限写路径未被逐项证明前一律只读保留；未知/旧式/损坏凭据、无法判定的节点/关系不当作无保护。推荐只读仅在没有其他限制时，经用户明确选择开放本次会话，重开不继承；策略epoch改变应使旧Agent预期版本失效。密码/hash/salt不进入Agent上下文。

关系读取必须验证 OPC 元素命名空间、直接子节点和明确的 transitional/strict settings 关系类型；不能先去前缀再把未知或嵌套关系当成缺省路径。保护节点属性按各自节点区分，重复展开名和将编辑限制属性放进 writeProtection 等异常配置均须保守拒绝，不能因属性被忽略而开放推荐选择。

原生session.save是最后防线：只读仅接受真实no-op，允许schema挂载默认值差异后返回私有原件字节；拒绝正文/附加结构及protection/writeProtection/settings或其关系直接覆盖。公开content/parsed/originalBytes变化不能放宽策略。PM事务、NodeView DOM入口、Agent附加写、草稿与整轮恢复均检查同一策略；只禁工具栏不算保护。P0不提供核验/设置/移除密码或加密，不把readonly保留称四模式受限编辑完整支持。

### DOCX 原件保护 W1：会话修改密码

writeProtection 与 documentProtection 凭据按节点保存在私有 WeakMap；公开 native/access/Agent 上下文只暴露能力摘要，不能含 hash、salt 或密码。修改密码验证仅解除当前会话的 writeProtection 门，不解除原件编辑模式。支持的 comments/forms 能力在核验后动态开放，正文保持只读；未知凭据、未支持的限制与设置写入仍拒绝。

SID14 的 SHA512 验证仅在每请求专用 module Worker 内执行：UTF16LE 保留代理对，h0=SHA512(salt||password)，hi=SHA512(previous||LE32(i))。原件缺省 spin100000，明确0有效；格式错误、不安全整数或大于1000000不能缺省/钳制。hash 恰64字节，salt1–64字节，base64必须规范；密码最多1024个UTF16码元。主线程禁止重复digest；30秒、取消、Worker错误、面板卸载、源切换都终止Worker并结算请求。

控制器固定凭据身份、epoch和活动请求，await后复核；不接受公开成功布尔值或注入核验器。错误/取消/晚到响应不改变access、文档、history或dirty。成功仅更新会话快照与epoch，使旧Agent预期版本失效；原件保护设置仍精确保留。未经实际编辑的保存返回完整原件字节；实际正文/受限编辑走已有最终守卫。原生异步保存最终返回前复核入口保护epoch与完整保存权限，重新验证后也不能复活旧保存；Editor写盘前另核当前session/source/handle与保护epoch，普通同文档继续编辑仍沿既有版本/dirty规则处理。Editor cleanup同时绑定session和documentId，A→B→A与重新打开必须重新验证；Inspector也绑定documentId，不能泄漏旧源草稿。

320px保护侧栏使用Antd密码输入和标准显隐，清错随输入、Enter验证、Escape取消清空并交由Inspector关闭/恢复焦点；固定页脚单一主动作“验证并继续编辑”，验证中可取消。明文仅短期保留于面板状态和Worker请求，不进Agent/API/日志/存储。W1不包含修改/创建/移除保护设置、强制修订和整文件加密。

### DOCX 原件保护 W2：原生设置与停止

编辑限制四模式、建议只读、修改密码与限制密码的保留/替换/清除必须由私有 controller 准备并验证。空新密码不代表清除；已有修改密码先按 W1 验证，停止或改变带密码的 documentProtection 另核对应原生凭据。未知/损坏配置保持原件并拒绝变更。新凭据只在可终止 Worker 中按随机16字节盐与100000次SHA512生成；核验、计算、取消及失败不发布文档。

PM只记录不透明的保护历史身份，实际XML/hash/salt和已经验证的内容/附加参数候选留在controller内。保护事务只允许切换已授权身份且正文不变，普通Agent操作不得构造新候选；Undo/Redo恢复对应策略，保存后仍保留这段PM历史。每次await后复核request、epoch和来源，拒绝/抛错的发布者不得留下可重放身份。密码明文不进历史、Agent或持久化存储。

设置使用namespace-aware span补丁，只触碰实际Word保护节点和属性，跟随原生settings relationship；缺部件时先验证并原子创建合法part、relationship与ContentType。写前预检和最终写出均校验；最终合并只覆盖授权保护节点，保留同次内容写入产生的其他settings变化与目标外ZIP条目。停止forms/comments后，已接受的受限改动仍优先走原生保留writer，不能仅因新策略可编辑而重新生成未知段落/讨论结构。

新限制立即阻止未授权写入；若启用forms/comments之前已有普通正文或附加结构修改，受限适配仍以原件为基准，当前副本保守只读，保存重开后才能填写/批注。不能只比正文指纹而忽略候选附加参数，否则会开放最终保存拒绝的受限操作。trackedChanges设置可原生写入，强制记录行为由独立T实现；W2阶段该模式保持只读。整文件打开密码与元数据清理分别属于E/P，不以W2设置支持冒充完成。

### DOCX P：个人信息与已保存清理基线

个人信息设置从私有原件的实际 settings relationship 和命名空间读取，最终保存对原生包执行唯一清理；关闭 vendor 的提前 scrub。仅处理明确支持的作者、修订/批注署名、公司等已知元数据，不承诺清除正文、自定义属性/XML或二进制中的身份信息。原始XML须验证合法字符、单次实体解码、真实namespace和关系；公开parsed/originalBytes或SaveOptions不能改变私有原件与保护资格。

候选仅以本session私有WeakMap绑定返回Uint8Array身份。只有该候选成功写入库后才能ACK并推进单调metadata scrub floor；生成、导出、失败、复制字节、其他session与重复ACK均不能推进。成功清理后关闭设置仍写出off原生标记，但不得从初次打开的原件恢复旧姓名。floor推进前的未清理候选须在finalizer及发布前拒绝；旧同源IO成功仍确认实际已写快照，新源IO不得改变当前源基线。四类保护最终按真实包差量拒绝未经授权清理；canonical仅豁免自有根合法boolean，同名子节点属性、未知根属性和畸形值不豁免。

### DOCX 原件保护 P1-C1：已有讨论

仅原件确认 enforced comments、原生关系及讨论身份可证明且无修改密码门时，开放已有讨论文字、回复、解决和重开；主正文仍 writable=false。已识别的编辑限制 hash 不要求批注操作先核验密码；含修改密码或无法判定的 writeProtection 保持只读。新增根、删除根/回复、forms、密码管理及强制修订不属于 C1。

资格与保存均以私有原件及原生模型为准：检查 comments/扩展的命名空间、关系及 ContentType；document 的非批注内部关系不能同时指向目标批注部件。所有段落 paraId 必须合法且全局唯一，不能只检查每条讨论的末段。未知现代线程语义保守拒绝；已支持讨论也按目标复杂内容给出独立拒绝原因。读入及最终保存最多1000条，单会话追加最多100条，不能生成重开即不再支持的结果。

最终 session.save 必须确认完整 PM 未变、附加参数只有合法 comments 差量，原身份/作者/日期/parent/paraId 不变。文字仅补 w:t 内文，解决仅补 done，回复局部追加必要原生节点/关系/类型；不走正文或 vendor 全量批注重建。插入属性须复用正确 namespace 前缀或分配未占用前缀，不得重绑原件未知属性的前缀。无变化及撤销归原返回整份私有原件字节，其他非目标 ZIP 部件精确保留。受保护批注的 Agent 结构撤销只恢复 SaveOptions，校验版本/保护 epoch/正文且不得 setContent；普通正文 Cmd+Z 不代替该历史。

### DOCX 原件保护 P1-C2：受限批注锚点

C2 在相同 comments-only 资格下允许可证明普通单段的新增根批注、根讨论含回复删除，以及单独删除回复；正文仍不可输入或改格式。私有原件按 paragraph/run/w:t 映射完整 UTF-16 边界，不能拆开码点或凭相同文字推断段落身份。顶层 SDT/altChunk 展开会改变 docxIndex，当前及其后不能证明原生段落身份时明确拒绝新增或删除锚点，已有讨论仍保留。复杂超链接、字段、跨段等目标按资格拒绝，不转换成普通段落。

最终保存及 PM guard 只允许准确授权的 comment marks 差量；移除这些 mark 后的完整规范化 PM Fragment 必须相同，不能忽略其他 marks、节点或属性。controller 对同一事务同步核 PM 与 comments metadata，任何 PM filter 拒绝都不得发布 metadata、版本、dirty 或结构 round。新增根的 ID 分配必须保留私有原件所有 ID，包括已删除项；不能复用旧身份使作者、日期或父子关系校验错认。

native 保存只精确插删目标命名空间与 ID 的锚节点，必要时按真实文本边界拆 run 并保留原 rPr、未知属性及扩展；删除回复不改 document.xml，删除根只去该根三个锚节点及指定讨论。首次评论只创建必要 comments/扩展部件、关系和类型。未改 ZIP 部件精确不变，撤销归原时返回原件；C2 结构撤销同步恢复已验证的 PM comment marks 和 metadata，不得以全量正文 setContent 绕过保护。结构 round 仅在当前未保存版本有效；保存后清除是现有合同，不能称为通用 Cmd+Z/Redo 或保存后历史。

### DOCX 原件保护 P1-F：原生复选框

forms-only 的正文仍 writable=false；仅开放私有原件可证明的 legacy FORMCHECKBOX 与 SDT checkbox。身份按原生 occurrence 与真实 PM nodeSize 映射，不依赖控件名称、SDT ID 或同形文字。禁用、锁定、数据绑定、冲突类型、未知 Word 行为及无法证明的复杂容器保持只读；外部命名空间 opaque 扩展原样保留。

PM guard 比较完整规范化状态，仅允许目标 checked/glyph 的准确差量，不能由 marks、history meta 或普通方框获得权限。鼠标命中从 glyph 两端向内部取 coords；键盘通过原生按钮 Space 切换。保存从私有原件只补目标 checked/glyph，正文、settings、其他控件及非目标 ZIP 条目精确保留；无变化或撤销归原返回整件原始 bytes。

forms 使用 PM 历史，可保存后 Undo/Redo；不要套用批注结构 round 的保存清除规则。保存基线须绑定同一 session 与实际保存快照的 forms 指纹，并发保存期间的填写/撤销不能被误标为干净。正文编辑、非法属性或附加 SaveOptions 仍由 session.save 拒绝。

### DOCX 图片预览裁切

八把手与移动保留区域使用实际原图 content rect 换算，保留区最小为一个源像素；所有 pointer 生命周期事件都须匹配活动 pointerId。数字与手势共享同一源图 insets 草稿，拖动和预览不写文档，固定主动作处理后只提交一次 PM 事务。绑定原 session、PM doc/node/selection 与附加 options，每个异步步骤后复核，过滤拒绝不得发布成功。

未改变源像素边界的原生裁切初值或全图 no-op 不重编码、不制造 dirty。真实像素加工输出 PNG，GIF 变为静态图；只在实际替换后清旧 crop/fill，保留宽度、旋转、翻转及环绕，新高度按输出像素比计算。它不是保留原图的非破坏 srcRect 编辑。

### DOCX 标题层级保存

setHeadingLevel支持原件真实样式0–9，写入目标原生styleId以使画布CSS与重开一致；编号标题不转换为普通docHeading。固定上游rawPPr结构判定不包含显式outlineOnly级别，Mimir在list保存计划后以docxOutlineSavePlan仅修正实际变更的pStyle/outlineLvl，保留未知pPr及其余正文/部件。属性补丁须识别单双引号及等号空白，并保留同节点的未知属性，不能因原始写法不同重建整个属性节点。显式大纲改正文写outlineLvl9以取消继承标题；不改vendor，不将原始pPr整体重建。回归必须包含既有显式大纲2→3、7–9真实样式、未知段落属性、第二次保存与undo/no-op非目录ZIP条目精确。

标题与列表互转涉及 docListItem 时，由列表保存计划保留 pStyle/numPr；大纲补丁不能仅凭节点类型变化就接管列表生成的原生 XML 块或强制要求 generated。实际标题层级命令仍拒绝编号目标，须同时回归标题→列表的真实保存、连续修改和完整 ZIP undo/redo。

### DOCX 墨迹保存

实际vendor合同为 `SaveOptions.inks?: NewInkImage[]`：undefined保留原墨迹，显式数组全层重写。未操作墨迹但正文再生成时，自有适配须按最终SaveBlock可靠映射恢复原run、关系、媒体及per-part内容类型声明，保留未知payload与XML原字节；不以重新序列化等价XML冒充原件保真。只有严格识别且资源独占的v1墨迹才可编辑，未知/opaque/共享及复杂定位明确禁写。新墨迹向量和透明PNG同步生成，普通段落column/paragraph锚定；段落删除/移动/撤销与原生保存映射必须一致。必需回归含正文编辑后的原墨迹保留、PNG Override/格式化rels精确、显式删除/重开与history。

---

## 目录形状

```
vendor/          vendored 的上游代码。**一律不改。** 同步会覆盖
  UPSTREAM.json    清单：commit、入口、跳过清单、文件列表（同步脚本维护）
  apps/docs/…      上游的文件，保持原目录形状（便于与上游对照）
  packages/docx-engine/…   docx 引擎
  packages/pptx-engine/…   pptx 解析（继承已解析成最终值）
  packages/pptx-render/…   pptx 布局（Slide → 纯数据的绘制列表）
src/
  docx.ts          解析层：openDocx → 编辑 → save
  pagination.ts    docx 分页视图；footnotes.ts 脚注
  xlsx.ts          xlsx 网格解析（**自己写的**，未 vendored）
  xlsx-edit.ts     xlsx 单元格编辑：补丁式保存 + 内联字符串（**自己写的**）
  pptx-archive.ts  pptx 的 zip / rels / 媒体读写（浏览器安全，预加载 entries）
  zip-bounds.ts    浏览器侧 OOXML 的流式解压预算；docx 进 vendor 前预检
  pptx.ts          pptx 打开：装配解析上下文 + 编辑会话（openPptxForEdit）
  pptx-save.ts     pptx 保存：元素补丁回字节（**移植自上游 index.ts**）
  pptx-structure.ts pptx 页级结构补丁：页序、slide/rels、演示文稿关系与内容类型；安全边界见 [页结构契约](./page-structure.md)
  pptx-render.ts   pptx 渲染入口：renderSlide / renderDeck → SVG 字符串
  pptx-svg.ts      RenderSlide → SVG（**我们写的**，替上游的 Konva 适配器）
  shell/           **界面外壳**：六种编辑器共用的框架与控件（D-054）
    EditorShell.tsx   五个槽位：toolbar / subbar / children / footer / status
                      加一组工具条原语：ToolbarButton（含 disabledReason）、
                      ToolbarGroup / Divider / Spacer / Label / Note / Notice / Tabs、
                      ToolbarTextButton（状态行里**有动作的一句话**：重试 / 关掉
                      这条提示。是 antd `Button variant="link"`，被 `.me-text-btn`
                      压成下划线文字——状态行里放 24px 的方框会看成第二条工具条）、
                      ToolbarSelect、ToolbarNumberField、ToolbarTextField、
                      ToolbarTextArea（多行输入，pptx 的段落编辑框；单行框不能
                      代替它——`\n` 会被值消毒静默删掉）、
                      ToolbarToggleGroup、ToolbarMenu（含 ToolbarMenuItemRow /
                      ToolbarMenuSeparator：菜单项要和别的控件混在同一个面板里
                      时用它们，别照着 markup 手抄）、ToolbarColorPicker
                      （`inline` = 只出那排色块，给「面板里的一小节」用）、
                      ToolbarGridPicker、ToolbarFileButton、FindReplaceBar、
                      useToolbarState。
                      **外面包一层只传 componentSize="small" 的 ConfigProvider**
                      （D-064：控件是 antd 的，布局与弹层仍是自己的 CSS）
                      面板里的方向键**按事件来源让位**：来自 input / combobox
                      那类表单控件的按键归控件自己——别在调用点挂
                      `stopPropagation` 绕过（那样漏一处就是一次静默失效）
                      **正文画布是可点而不经原语的两处例外**（pptx 的 SVG 画布、
                      xlsx 的 `<td>` 网格）：被点的是画布里注入的节点、动作随点
                      在哪而变，换成 `ToolbarButton` 没有意义。它们是**显式白
                      名单**，新增例外要先明确键盘路径。PPTX 的
                      `PptxSelectionControls` 对象列表另有一处限定例外：
                      原生 button 承载 listbox 的 role=option、aria-selected
                      与修饰键事件；Arrow/Home/End 移焦、Shift 连选、Ctrl/⌘
                      加选及全选，深层组合禁用并说明原因。普通工具按钮仍走原语。
    shell.css         外壳样式：布局、弹层、非 antd 的元素（主题值走 --me-*）
    icons.tsx         工具条图标（自绘 SVG，不依赖图标库）
    editor-commands.ts 方言能力检测与调用
    antd-test-dom.ts  驱动 antd 下拉的测试辅助（`@mimir/office/test-dom` 导出）
  editors/         **六种编辑器**（docx / xlsx / pptx / html / markdown / pdf）
    ThumbnailSidebar.tsx  PDF/PPTX 共用真实内容缩略图、右键菜单与键盘排序入口
    DocxEditor.tsx / XlsxEditor.tsx / PptxEditor.tsx
    PptxEditor.test.tsx pptx 工具条的按钮 → 命令（挂真组件、读保存出的 XML）
    HtmlEditor.tsx     源码 + 预览双栏（借 vendored 的 CodeMirror 与点选映射）
    PdfEditor.tsx      页面级操作（pdf-lib）+ 逐页渲染（pdf.js）+ 查找文字。
                       四样东西决定一页：来源（原件/空白/导入）、旋转、裁剪、
                       纸型——模型与保存都在 pdf-pages.ts
    MarkdownEditor.tsx 笔记：30+ 个工具条控件（D-061）
    markdown-format.ts markdown 方言的判据与操作（整张列表的范围、段落样式的
                       当前值、列对齐、工具条状态串）。**导出**给宿主测——
                       方言在宿主那边（`packages/renderer/src/editor/extensions.ts`），
                       只有真方言能验证这些行为
    MarkdownEditor.test.tsx（在宿主）按钮 → 命令：挂真工具条 + 真编辑器实例
    markdown-controls.test.ts  控件契约的**静态**一半（读源码：没有手写原生
                       控件、不直接 import antd、不把 .me-btn 挂到控件上）。
                       **渲染**的那一半在宿主（`markdown-controls.test.tsx`）
                       ——尺寸档与弹层要真方言才挂得起来
    InlineToolbar.tsx / use-source.ts  取字节 → 解析 → 写回
    pdf-render.ts      pdf.js → canvas（**代次防并发**）+ 按字节的文档缓存
                       （画布与文字层共用；导出 loadPdfDocument 给查找复用）
    pdf-pages.ts       PDF 的页面模型与保存（**没有 JSX，所以测得动**）：读
                       每页的 CropBox/旋转、按目标结构重建字节（copyPages，
                       导入的页按来源分组）、裁剪、纸型（scaleContent 与
                       setSize 配对，补一次绕可视区左下角的 translate）
    pdf-text.ts        文字层与查找：getTextContent → 页面比例矩形（含中文、
                       含旋转）。与画布共用 viewport，所以高亮必然对齐
    pdf-pages.test.ts / pdf-text.test.ts  用 **pdf-lib 与 pdf.js 独立读回**产出物
    pdfjs-assets.ts    cmaps / 标准字体 / wasm 的路径（宿主 public/ 提供）
    types.ts           EditorIo：宿主提供取与存
  index.ts         对外出口
  shims/i18n.ts          上游 i18n 的等价替代
  shims/pptx-engine-types.ts  pptx 引擎的类型桶（挡住整条写路径）
  generated/       样式裁剪产物（不进 git，由同步脚本/共享构建预设生成）
scripts/
  sync-upstream.mjs  从上游同步 vendor/（含闭包计算、改写、自检）
  trim-editor-css.mjs 从上游整份样式里裁出编辑器需要的部分
```

**六种格式六条路**（`.trellis/spec/project/architecture.md` §15.7–15.12）：

| 格式 | 做法 | 保存 | 为什么 |
|---|---|---|---|
| docx | vendored 引擎 + 编辑器，**可编辑** | 补丁式 | 编辑要求文件能读写回来 |
| xlsx | 自写网格解析与补丁写回（约 550 行） | 补丁式 | 「把表画出来、改几个格子」用不到上游的 Rust 侧车 + Univer |
| pptx | vendored **解析 / 布局 / 编辑映射**，自写 SVG 适配器与保存原语；工具条改文字 + 整段字形（D-060） | 补丁式 | 四级继承 + 文字度量 + 160 种预设几何，自己写会错得看不出 |
| html | vendored **编辑器本体**（CodeMirror + 点选映射，12 个文件），界面用自己的外壳 | 整体重写（保留 BOM/换行） | 上游那个 app 25924 行，其中 2.6K 与编辑 HTML 有关，其余是办公壳 |
| markdown | **就是笔记编辑器**（上传 `.md` 即导入为笔记） | 写回正文列 | 正文格式是 mimir 的产品决定 |
| pdf | pdf.js 读（渲染 + 文字层）、pdf-lib 写（页面结构） | 整体重写 | PDF 是一叠页面指令而非结构化文档；页面级操作（旋转/删除/调序/倒序/插页/导入/裁剪/纸型）是纯结构改动，pdf-lib 做得对。**改文字**要 PDFium 的 7MB WASM（§15.12），**查找**是自己取文字层做的（没有替换） |

### pptx 保存：`src/pptx-save.ts` 为什么是照搬

`buildZip` / `patchSlideXml` / `patchedElementXml` / `patchAnchorXml` /
`slideIsDirty` / `modelStrokeToPatch` 六个函数在上游 `index.ts` 里，而那个
文件**不能 vendored**（import `zip.ts` 的 `node:crypto` 与 `media-insert.ts`
的 `node:zlib`）。但那段保存逻辑本身是纯的——只用已 vendored 的
`generate.ts`（全部 patch 原语）与 `identity.ts`。

所以 `src/pptx-save.ts` 逐条照搬了它们。**上游改这几个函数时要跟着改**
（`UPSTREAM.json` 记了 commit）。改动只有两处：不用 `createHash`，
以及 `buildPptxBytes` 直接产出字节（浏览器里没有「写到文件」这一步）。

**两条不能违反的性质**（有测试守着，红了不要放宽断言）：

1. **没动过的条目逐字节相同** —— 整个前提是未改动的元素用
   `anchor.originalXml` 原样回填
2. **改一段文字只动那一张 slideN.xml** —— 主题/版式/母版/媒体都不该动

还有一条隐含契约：**`save()` 成功后必须 `commit()`**。不 commit 的话
第二次编辑会拿旧锚点拼字节、把上一次的改动静默回滚（两次保存都「成功」）。

### PPTX 图片原件与显示副本

本地图片来源由 `shared/pptx-image.ts` 按真实内容统一验证 PNG/JPEG/GIF/BMP/WebP/标准 TIFF，原件扩展名和字节不得被显示转换替代。GIF/WebP 动画保留原文件；去背景输出明确为静态 PNG。JPEG 仅在显示副本中将 EXIF 方向中性化，保持 PowerPoint 原像素坐标。

TIFF 当前仅接受通过条/瓦片完整性、颜色/样本组合及解码预算检查的未压缩或 PackBits 页面，选择面积最大的安全页显示 PNG，原件保留所有页面。不能仅凭 IFD 尺寸放行其他编码：UTIF 的 Deflate/JPEG 会按内部压缩流另行分配，CCITT/LZW 对畸形输入缺少可靠分配/终止守卫；新增编码前须有受限解码证明。传给 UTIF 的选页副本只保留图像 tag，防止私有相机 tag 绕开 Compression 校验并切换解码器。

`preparePptxDisplayMedia` 在打开、编辑会话初始化及宿主替换时先准备显示媒体。宿主替换必须在全部异步准备后重新检查取消信号与版本，再一次发布 archive、media、尺寸和页面模型；迟到结果不得改 archive 或制造 history。

### PPTX 批量图片项目符号

顶层文本框/含文字形状及顶层组合的直接文字成员可共同设置图片符号；深层组、无文字或失效目标须整批拒绝，不能过滤后只改部分。选图仅是绑定当前来源、页、版本和选择的本地草稿，关闭或身份变化须终止读取；唯一固定主动作生成逐目标 `setParagraphFormat` 操作，经同一宿主 candidate 发布和历史记录。

图片限制为512 KiB、400万像素以内的真实PNG/JPEG；通用 `apply_ops` 的图片符号必须在 native txn 前校验整个批次的 schema、目标、内容格式和完整解码，不能只验证扩展名或 base64 字符串。原生每目标段落的 blip、slide relationship 和媒体须对应原图字节，保留未知段落属性、非目标对象及其他 ZIP 部件；取消、版本或选择变化后的迟到 candidate 不得发布。已存在的图片符号只调大小等细节时继续保留各对象原图，不要求重新选图。

---

## 三条不能违反的规矩

### 1. `vendor/` 里的文件一律不改

需要改行为就在 `src/` 做。手改 vendor 的代价不是「下次同步冲突一下」——
是**每次同步都要重新解决同一处冲突**，而且上游一动那个文件你就得重看一遍。

上游依赖的两个东西（i18n、样式）已经用**机械改写**处理掉了，见
`sync-upstream.mjs` 的 `REWRITES`：改写是可重复的，所以每次同步都自动应用，
不算「手工修改」。要加新的改写，在那里加一条并写明理由。

### 2. 不要用 mimir 的严格度去检查 vendor

上游没开 `noUncheckedIndexedAccess`，mimir 开了。所以 vendored 文件顶部由
同步脚本机械加 `@ts-nocheck` + `eslint-disable` 横幅，`vendor/tsconfig.json`
是单独一份宽松配置。

**收紧类型检查的边界是 `src/`。** 那里是 mimir 自己的代码，按 mimir 的
规矩来。

### 3. 界面与逻辑同包，但**壳与内容分家**

界面在这个包里（D-054），因为六种格式的外壳必须长得一样——而「一样」只能
由同一份实现保证。边界是：

| 归包 | 归宿主（`packages/renderer`，两端共用） |
|---|---|
| 壳（工具条 / 状态行 / 布局 / 保存状态） | 方言（markdown 的 Tiptap 扩展集合） |
| 编辑器组件 | 正文排版类（与只读视图共用同一个） |
| 解析与保存 | 取字节与写回（`EditorIo`） |
| 主题变量**消费**（`--me-*`） | 主题变量**提供**（`editor-theme-bridge.ts`）与 antd 实例 |

**包依赖 antd（D-064 起）**。原先刻意不依赖，是为了「能独立测试、独立预览」
——那个收益是真的，但它换来的是壳里一整套手写控件追不上 antd 已有的东西，
而缺口是实测的：`ToolbarSelect` / `ToolbarToggleGroup` / `ToolbarColorPicker` /
`ToolbarMenu` 都没有 `disabled`（加载期 19 个控件可点，点「段落底纹」把文档
标脏而保存字节与原件相同），`ToolbarNumberField` 没有 `step`（原生 spinner
每档 ±1，调用方按 10 的倍数吸附，点一下看着没反应）。判断见 D-064。

**哪一层管什么**（改工具条样式前先读这一张）：

| 归 antd（`--ant-*`） | 归 `shell.css`（`--me-*`） |
|---|---|
| 控件的高度、内边距、圆角、边框、hover、焦点环、禁用态、控件字号 | 外壳布局（`.mimir-editor` 的四条约束、`flex-wrap`、状态行、工具条 gap） |
| 按钮的实心 / 文本两档、下拉弹层、分段控件选中外观、水波纹 | 弹层（`.me-menu*` / `.me-color*`，就地 `fixed`，**不 portal**）与色块、页签、状态块这类非 antd 元素 |
| 数字框的上下抓手（我们 `controls={false}` 关掉了） | 按钮的**按下态**（`.me-tb[aria-pressed='true']`）与两个未迁移触发器的 `.me-btn` |

四条随之而来的规矩：

- **包不新建主题。** antd 实例与主题由宿主的 `MimirProvider` 提供；包只允许
  一层**只传 `componentSize="small"`、不传 `theme`** 的 `ConfigProvider`
  （`EditorShell` 内部，包住 `.mimir-editor`）。传 `theme` 会重算 cssVar 的
  key（`--ant-*` 变量名跟着变，引用处静默失效）
- **`antd` 的版本与宿主同一份**（进 `pnpm-workspace.yaml` 的 `catalog`；
  包把它声明成 `peerDependencies` + `devDependencies`，**不进 `dependencies`**
  ——两份拷贝的症状是「某些控件不吃 componentSize」，不报错）
- **`--me-*` 变量桥不退役**：颜色、间距、正文字号仍由它提供；
  退役的只是「控件本身也得手写」
- **`.me-btn` 不许挂到 antd 的按钮上。** 它现在只服务两个未迁移的弹层触发器
  （`ToolbarMenu` / `ToolbarColorPicker` 的裸 `<button>`）。它的 `height` 与
  antd 的 `:where(...).ant-btn-sm` **特异性相同**（都是 (0,1,0)）而这份样式在
  head 里更靠后，挂上之后 small 档按钮会被拉成 24px 之外的值；它的
  `background: transparent` 还会压过实心 `type="primary"`（症状：透明的「保存」）。
  antd 按钮要按下态就挂 `.me-tb`

两条这一层特有的规矩：

- **不要手改 `src/generated/editor.css`**：它是 `trim-editor-css.mjs` 的产物，
  同步、Web/desktop 构建及 Office Vitest 配置加载时会覆盖；构建生成契约见 renderer/frontend/conventions.md
- **`vitest` 的默认环境是 node，不是 happy-dom**。happy-dom 会替换全局
  `URL`，于是 `readFileSync(new URL(..., import.meta.url))` 抛
  `The URL must be of scheme file`——解析类测试整片挂掉（实测踩过 48 个）。
  要 DOM 的测试在自己的文件顶部写 `@vitest-environment happy-dom`。
  **挂 antd 组件的测试要自己包一层 `ConfigProvider`**（产品里那层是宿主的
  `MimirProvider`）——不包的话量到的不是 small 档，尺寸对不上；而 happy-dom
  下 `Input` / `Select` / `InputNumber` / `Segmented` 的计算高度取不到
  （返回空串），「一行所有控件同高」只能进浏览器验收。**这一条已经量过**
  （无头 Chrome + CDP：Button / Select / Segmented / Input / InputNumber
  外层与 `.me-btn` 全 24px，见 D-064），但**量它的能力不在 `pnpm check` 里**
  ——改了工具条尺寸要自己开浏览器再量一遍
- **弹层里的 antd 控件要连同「它 portal 出去的弹层」一起算作面板内**：
  `useToolbarPopup` 的 `insidePanel()` 靠 antd 自己写的 `aria-controls` /
  `aria-owns` 认。只按祖先判断的话，真浏览器里一按选项面板就被关（症状是
  「点一档什么也不会发生」，界面不报错）。**测试要按 pointerdown → click 的
  真序列驱动**：只派发 click 时 React 会批处理，`onChange` 照样发出，这个
  bug 会被测成通过（`EditorShell.test.tsx` 那条「面板里的下拉」就是样板）

### 浏览器 Worker 的依赖导出回归

加密 Worker 的边界测试须用实际生产浏览器 bundler 打包 `docx-encryption.worker.ts`，再以 `.mjs` ESM Worker 执行；断言 `require` 不存在，并移除 `Buffer`、`process`。Node 直接加载 CommonJS 依赖，或把浏览器产物存成 `.js` 后在 Node 的 CommonJS 上下文加载，都会让 `cfb` 的额外 `typeof require` 导出条件误过，掩盖真实浏览器的 `utils.cfb_new` 缺失。不能为通过测试向生产注入全局 shim。

`docx-encryption-bundle.test.ts` 必须覆盖外部 Standard/Agile 原件解密、修改正文、生产 Worker 写出 Agile、另一个 Worker 解密后与预期原生 ZIP 全字节相等；新写产物另用独立实现验证密码和 HMAC。只检查导出存在、打开成功或 no-op 原件精确不能证明实际保存可用。

### 4. 保存必须走补丁路径

`saveDocx` 有两种模式：逐块补丁（未改动的块原样复制 zip 条目）和整体重建。
**产品里只允许前者**——整体重建会丢掉我们没建模的东西（域代码、修订标记、
OLE 对象、自定义样式）。

`src/docx.test.ts` 有一条断言在守它：改一段后**只允许 `word/document.xml`
变化**。这条红了不要放宽断言，先查是不是保存路径退化了。

### 5. 未受信任的 Office ZIP 不直接调用 `file.async()`

`file.async()` 会先解完整个条目，事后比较长度挡不住单条解压炸弹。
docx/xlsx/pptx 的打开入口必须经过 `src/zip-bounds.ts`；xlsx/pptx 从有界流
取得字节，docx 在不可改的 vendor 解析器前预检所有部件（D-110）。

---

## 同步上游

```bash
git clone --depth 1 https://github.com/genspark-ai/genoffice /tmp/genoffice
node packages/office/scripts/sync-upstream.mjs --from /tmp/genoffice          # 同步
node packages/office/scripts/sync-upstream.mjs --from /tmp/genoffice --check  # 只报告差异
```

`--check` 用于定期看上游是否动了我们 vendored 的文件（输出非零退出码表示有差异）。

同步脚本会：重新计算闭包 → 应用改写与横幅 → 写入 vendor/ → **按闭包清理
多余文件** → 裁剪样式 → 更新 `UPSTREAM.json`。**它是幂等的**：连续跑两次，
第二次「内容有差异 0 个文件」。

**跑完同步要跟着跑 `pnpm format`。** 改写会把 `@genoffice/x` 换成长相对
路径，而 oxfmt 会把超过行宽的那种 import 折成多行——所以「刚同步完」会看到
十几个文件有差异，格式化之后归零。顺序反了（先 format 后 sync）就会漏掉。

### 一条 pptx 专用的改写（裸包名类型导入）

`@genoffice/pptx-engine` 的**裸包名**导入会被改写到
`src/shims/pptx-engine-types.ts`，**必须在 `byPkg` 那条规则之前**。

理由：渲染层对引擎的裸包名导入全是 `import type`（运行时不需要任何代码），
但闭包计算**不区分类型导入**——它会顺着包名走到引擎的 `index.ts`，把整条
**写路径**（insert / generate / media-insert / slide-transfer / sections，
约 10K 行，带 `node:zlib` 与 `Buffer`）拉进浏览器闭包。实测：不加这条规则，
闭包从 135 涨到 146 个文件。

子路径导入（`./table-grid`、`./identity`、`./background-promote`）是**真代码**，
照常走 `byPkg` 改成相对路径。

### 闭包自检拦的是哪三类错

解析不完整时脚本会**静默跳过**文件，所以产物不对而脚本不报错。三次教训：

| 症状 | 原因 |
|---|---|
| docx-engine 的 35 个文件全丢（93 → 56） | `.js` 后缀没映射回 `.ts`（改写产出 NodeNext 写法） |
| 9 个文件漏掉（watermark / protection / blank…） | 抓 import 的正则不允许跨行，而上游大量用多行 `export { … } from` |
| vendor 里多了 26 个 UI kit 文件、应用起不来 | 改写规则把 `@genoffice/ui` 变成了相对路径，**绕过了 skipPackages** |

现在两种断链都会报错退出：相对导入落在闭包外、以及**未被改写**的
`@genoffice/*` 导入（后者正是「依赖了被跳过的包」的判据）。

顺带一条：抓 import 的正则**不能跨越语句边界**（见 `computeClosure` 的注释）
——否则注释里提到 `@genoffice/ui` 也会被当成真导入。

### 闭包是算出来的，不是列出来的

`UPSTREAM.json` 的 `entries` 是人工选的入口（编辑器、排版度量、文档状态），
`files` 由脚本从入口出发沿 import 图算出。所以**上游新增的依赖会自动进来**，
但**新功能不会**（那要改 `entries`）。

闭包算完后脚本会自检每个相对导入都能在闭包内解析；对应的静默漏文件
症状与原因见上一节，不在这里重复。

---

## 能力边界

| 缺什么 | 说明 |
|---|---|
| **大文档解析** | `parseDocx` 是同步重活，上游为它做了 worker（`parse-off-thread.ts`）。现在直接 await，大文档会卡主线程 |
| **保存冲突** | `PUT /api/documents/:id/file` 不校验 `If-Match`。单客户端可接受，多客户端会互相覆盖 |
| **xlsx** | 网格读取沿用 `src/xlsx.ts`；固定版 GenOffice gateway 的服务端字节写路径供部分 Agent 与手动操作共用。显式 WASM 重算仅补原件公式缓存；完整会话、自动重算和 Univer 网格仍未接入。已接入操作与缺口按 XLSX 格式矩阵逐项核对。见 TECH §15.7 与 [XLSX 宿主合同](../../../shared/contract/xlsx-agent.md) |
| **xlsx 行/列增删与公式重算** | gateway 已接行列增删、合并与取消合并、行高和行列隐藏。普通编辑后公式显示仍是缓存；显式重算用隔离 worker 计算并交叉校验原始缓存类型，源公式/样式/未触及部件保留。1904、共享数组、外链、未支持函数及超预算须拒绝，不发布部分结果。更多结构与计算语义按格式矩阵逐项验收 |
| **xlsx 改样式** | 原轻量 `xlsx-edit.ts` 覆盖单元格时会丢该格 `s` 样式引用。当前 gateway 的内容写入保留样式；`format_range` 修改目标格与 `styles.xml`，网格解析字体、纯色填充、边框、对齐及明确数字格式。图案/渐变、完整条件格式、图表与工作簿 DSL 操作仍按格式矩阵验收，不能由基础样式推论为全部格式编辑。 |
| **pptx 编辑** | 改文字与整段字形沿用 `src/pptx-save.ts` 补丁式保存；本轮对象菜单另经固定版 `pptx-ops` 宿主接入元素位置和大小、填充、轮廓与删除。段落格式、图表和其余上游操作仍按 PPTX 格式矩阵逐项验收；宿主可调用不等于手动入口或保存读回已验收。见 TECH §15.9 |
| **pptx 文字范围与插入点** | 单个原生 textarea 跨段选择；null 为整框、非空范围只格式化选中文字、折叠光标仅保存 pending marks，输入时才写 session。选区/marks 绑定文档、slide path、元素与版本；外部改动使其失效。不能用字符数字表单冒充真实选择。 |
| **pptx 范围编辑保真** | `pptx-text-range` 用身份绑定来源元信息交给 setText 专属分支，在 clone 上按原 XML 外科 patch；保留未知 rPr/pPr/endParaRPr、超链接关系、软换行、field GUID。普通 Agent 的 EditParagraph 合同不接受客户端 XML；仅 srcRun 映射不足以证明拆 run 后保真。范围专项及 Editor 原文字回归同时守住。 |
| **pptx 字体度量** | 用启发式（按字符类别估宽度）——**换行位置**可能与原件略有差别。要精确得接 opentype.js + vendored 字体（docx 那边有） |
| **pdf 的文字编辑** | 查找读文字层；新增的服务端宿主已能经固定版 GenOffice/PDFium 写入带可靠坐标的文字替换和插入，并以独立阅读器读回。手动画布只在能取得可靠页坐标时开放插入；替换缺少文字对象锚点时禁用。批注、图片、表单及其余内容工具仍按 PDF 格式矩阵验收，不能仅凭宿主函数存在就注册给模型。 |
| **pdf 的单边裁剪** | 页面模型（`PdfCropInsets`）四边各自算，**界面上只能四边等量**（去掉扫描件黑边的常见用途；单边裁剪在旋转之后就分不清「左右」了）。要单边就补界面，模型不用改 |
| **pdf 的选中文字** | 页面上的文字画进 canvas，选不中、复制不了。文字层只用来定位查找的高亮（那与 pdf.js 自带 textLayer 叠 DOM 是两种做法——它要和画布像素级对齐，多一层缩放维度） |
| **html 的增量预览** | 每敲一个字预览整页重载（滚动位置回顶）。上游也这样，但要做好的话得把改动 patch 进 frame 的 DOM |
| **html 的点选改样式** | 点选元素与源码共享版本；可经固定版 `HtmlOp` 原子应用快捷样式、元素属性及图片样式，失败保留原源码。图片像素裁切/去背景、延迟预览及上游完整 StylePanel 命令仍按 HTML 格式矩阵逐项验收。 |
| **页内分栏** | 已接上游分栏切页与位置样式；复杂表格跨栏仍需真实文档复核。`pagination-geometry.test.ts` 用双栏夹具守住左右栏与纸张几何 |
| **docx 里写不进去的几类格式** | `rawRPr` 透传那批（字符间距、大小写、字符边框、文本效果、发光、带圈）与复杂文种字体（`csFont`）：前者模板里改了保存时会被原字节覆盖，后者要按 `w:rtl` 判断、中文库里命中率极低。表格边框只给了三个预设。见 TECH §15.4.3 |
| **列表编号分配** | 新列表沿用文档里已有的 `numId`；新建编号定义要写 `numbering.xml`（上游的 `allocateListNumId` 在 host 侧，未 vendored） |

### 分页的静默坑

排查分页问题时先看 `window.__mimirPagination`（中间量）与
`window.__mimirPagError`——分页失败的**三种原因现象相同**（都是「没有页」），
不记下来只能靠猜。

| 症状 | 原因 |
|---|---|
| 页数对但没有页间隙 | `origin` 用了滚动容器的位置（容器一滚动就偏移一个 scrollTop） |
| 51 个块被量成 1 个 | 传了容器 ref 而不是 `.ProseMirror` 本身 |
| 分页永久不触发且不报错 | 用 `requestAnimationFrame`——**后台标签页不派发帧** |
| 分页正常但灰带透明 | `--canvas` / `--docs-paper` 由上游 App 壳运行时注入，未 vendored |
| 多节纸张宽度正确但高度不对 | 上页未用完的空间被放进下页上边距，末页又按容器自然高度结束；每页纸张层须按对应节的物理 `pageHeight` 绘制 |
| 双栏段落变窄、右栏仍为空 | 分栏切页须使用会产出 `regions` 的 `sliceWithLineSplit`；段落位移依赖 `--col-dx` / `--col-dy` 的 CSS `transform`，上游 `.editor-scroll` 前缀规则会被样式裁剪器丢弃，须在受版本控制的编辑器样式保留 |
| 表格跨页有页数，灰带却只覆盖某个单元格 | `.page-gap-table-fill` 是单元格内绝对定位层；`setPageGaps` 后须调用 `alignTableGapFills`，并以 `.doc-page` 为定位基准。只传 `.ProseMirror` 会漏掉左右纸边距；`pagination-geometry.test.ts` 断言窄列中的 fill 左边与宽度覆盖整张纸。页眉页脚条仍以 `.ProseMirror` 对齐 |

样式裁剪（`trim-editor-css.mjs`）只保留 `.doc-*` / `.ProseMirror` / `.page-*` /
`.hf-*` 前缀的规则。**加新的编辑器 UI 时如果样式不生效，先看它是不是被裁掉了**——
那种失效是静默的（元素渲染出来但没样式）。

### pptx 预览的五个静默坑（都在 `src/pptx-svg.ts` / `src/pptx-archive.ts` 的注释里）

| 症状 | 原因 |
|---|---|
| 文字间距诡异（「2026」渲染成「2 026」） | 误以为「一个 `GlyphRun` 一个字」，把 run 的 x 拼成 SVG 的**逐字坐标列表**。实际一个 run 是**一个词**，多余的坐标被浏览器当逐字定位（**实测踩过**） |
| 整页空白 | SVG 是 XML——一处没转义的 `<` 或 `&` 让整份文档解析失败。`pptx-svg.ts` 有转义测试与「能被 XML 解析」的测试 |
| 形状旋转后位置偏 | OOXML 的 rot 绕**框中心**；翻转后坐标系回到左上角，旋转中心要相应还原 |
| 合并相邻 run 后间距不对 | 同格式的两个 run 位置接不上（中间有空档）时**不能合**——合了就被浏览器按自然排版重排 |
| 幻灯片空白（背景也没了） | 占位符的位置可能在**母版**（幻灯片与版式里都是空 `<p:spPr/>`）。两级上溯链断在任何一级都会让内容叠在 (0,0)。`src/pptx.test.ts` 有一条测试专门断言这个 |

### DOCX 图表、样式与注释视图合同

`docx-chart-save.ts` 接收 `pmDocToSavePlan().chartPatches`，同时补丁原生图表缓存与 `externalData` 关系指向的嵌入 XLSX 引用格；按公式解析表名和横/竖范围，不假定 Sheet1 或 A/B 列。外部/损坏/缺失引用及同格冲突写入须拒绝，未引用格、样式和 ZIP 部件保留；该路径不重算其他公式缓存。

`docx-styles.ts` 从原 styles.xml 合并待保存定义后重新解析；沿 `doc-style-css` 生成当前编辑器作用域样式，同一解析结果供列表存储、分页与注释使用。宿主手动 `apply_style` 与模型工具目录分离；创建/更新定义验证类型、basedOn/next 引用和循环。

脚注预留按实际引用行和富文本 DOM 测量，纸张高度固定；超长脚注由 `docx-footnote-flow.ts` 按安全行边界切片，续页仅属视图，不改保存正文。尾注用 `docx-endnotes.ts` 按各节 `sectEnd`/`docEnd` 渲染只读流内 widget；同锚点的多个续页在 PM 装饰器及尾注内部直接 DOM 两条路径都必须保持来源次序。编号 paint 不改源属性。复杂编号/分栏/混合纸张组合仍须实际视觉验收。

### 保存与编辑的静默坑

DOCX 上游 writer 的 `JSZip.file` 会默认补建原件没有的父目录条目（如仅有 `docProps/custom.xml` 时新增 `docProps/`）。最终自有保存边界须保留原目录清单；只删除新增目录记录，不能调用递归的 `zip.remove(directory)`，否则连同部件一起丢失。无目录差异直接返回候选原字节。

补丁式保存、pptx 的 run 边界、xlsx 的共享字符串与公式格、docx 的列宽与
样式 id、pdf 的 cmaps 与并发渲染——**见 [编辑器坑表](../frontend/editors/pitfalls.md)**
（与编辑器代码同目录，最近者优先）。外壳（工具条 / 高度链 / 弹层）的坑在
[外壳坑表](../frontend/shell/pitfalls.md)。

### PPTX 宿主组内翻转的同步事务

固定原生 `flipElements` 会更新直接组成员的模型，但未把成员transform补回父组合XML。服务端 `pptx-group-flip.ts` 的 `runPptxHostTxn` 在原事务范围同步包装同名OpDef，原生apply完成后用 `editGroupChildTransform` 刷新实际模型；不新增操作名、不改原生records、校验、快照或原子回滚。顶层flip直接沿原行为。

此包装安装、runTxn、finally恢复之间不得出现await或Promise。registry是共享状态，只有整个调用保持同步，其他请求才不会在定义替换期间插入执行；finally必须连runTxn快照异常也恢复原定义。不要改成按请求保留替换定义或异步包装。`apps/server/src/test/pptx-group-flip-host.test.ts`覆盖并发宿主、快照异常、后续原生操作失败回滚，以及flip后立即ungroup/duplicateSlide的同批次持久化。Office几何专项还须断言bare host flip已保存，不能继续把旧未持久化诊断当正确预期。

### 干净环境测试前置

Office Vitest 配置在 suite collection 前用当前 Node 和 `fileURLToPath` 执行既有
`trim-editor-css.mjs`；生成失败直接中止，不依赖开发者先 build 或 sync。
原生 PDF 中文插字的 vendored 字体路径需要系统 sfnt CJK 字体（含受支持 TTC 字面
提取）；Ubuntu CI 在 `pnpm check` 前安装 `fonts-noto-cjk` 并记录 fc-match。
缺字时须保留明确拒绝；不能跳过中文换行/保存断言、伪造字体覆盖或以别的 writer
使用 woff2 的成功代替此路径。实际字体准备属于测试宿主条件，不修改 PDF 生产实现。
