# Markdown 真实组件交互 Demo

这份入口直接导入实际 `MarkdownEditor`、renderer `createExtensions()`、`MimirProvider`、`ContentTypography`、`editor-theme-bridge` 与 `DocumentPanel.style` 根样式。before/after 使用完全相同入口、fixture与IO控制；before冻结到46a2120，after使用当前源码。没有手绘菜单、假编辑器或另造正文格式。

宿主标题/元信息是明确标注的简化fixture header。`scene=side`按真实宿主outline样式使用bodySide槽位，点击经活编辑器公开命令选中相应标题；这不代表完整DocumentPanel大纲滚动/导航行为已验。全站侧栏/AI侧栏/离开守卫需主任务实际产品验收。

## 启动与参数

从repo根运行：

```sh
GALLERY_SOURCE_ROOT=/private/tmp/mimir-markdown-baseline pnpm --filter @mimir/web exec vite --config /Users/admin/Desktop/mimir/.trellis/tasks/10-20-interaction-markdown/gallery/vite.config.mjs --port 5198 --strictPort
pnpm --filter @mimir/web exec vite --config /Users/admin/Desktop/mimir/.trellis/tasks/10-20-interaction-markdown/gallery/vite.config.mjs --port 5199 --strictPort
```

实际编辑区尺寸由`width`/`height`决定，不自动更改浏览器viewport。主题`theme=light|dark`，尺寸为正数像素。例：`?scene=body&theme=light&width=1100&height=760`。相同查询在5198/5199可配对。`capture=1`只隐藏辅助导航和日志；实际交互准备后也可按`Alt+Shift+H`隐藏/恢复。`prepare=1`在真实editor ready后执行一次公开命令，仅支持inline/table/code/wiki*/slash*预置。未设该参数时所有场景保持可从真实UI操作。导航切换会重新加载fixture，丢弃本地修改；没有持久化。

`io=controlled|success|error`决定初始模拟IO模式，默认controlled，带error场景默认error。`capabilities=missing`移除可选Agent/候选/图片/改写/AI预设回调，用实际组件的禁用原因或隐藏策略；不是隐藏真实存在的命令。初始化ready是实际Tiptap生命周期，不人为制造延迟。

## 场景与操作

- 正文：body、empty、long。所有四基础Ribbon分类可直接点击，宽/中/窄列由实际CompactToolbar布局。快捷保存、undo/redo均为真实命令。
- inline：点击“选中正文文字”展示实际官方BubbleMenu；实际改写/翻译/精简/扩写交由mock回调。失败在fixture日志显示并返回null，不创建假确认层。异步选区身份沿用现行产品限制。
- link：通过开始→链接打开真实面板，可输入外部URL或检索笔记。wiki、wiki-loading、wiki-error、wiki-empty、wiki-long：点击“输入 [[”或prepare=1，真实候选可↑↓/Enter/Tab/Escape；前两普通/long立即返回固定候选，loading由手动完成决定。
- slash、slash-empty：点击“输入 /”或“输入无匹配 /”；prepare=1亦可。真实菜单执行方言命令，键盘状态与关闭不另实现。
- table、code：点击“进入实际表格/代码块”或prepare=1后，从真实上下文Ribbon进行操作。插表从插入分类打开。行列/对齐/表头/语言使用真实节点和history。
- diagrams、diagram-error：固定有效或无效的真实数学、Mermaid、WaveDrom节点。图表绘制的180ms防抖和结果由实际NodeView/renderer决定，不由fixture定时器伪造。
- frontmatter、frontmatter-loading、frontmatter-error、frontmatter-save：从笔记→属性打开。普通frontmatter读取立即完成；其他模式有真实Promise等待。手动完成/失败→改YAML→保存→完成/失败可体验全部状态。`frontmatter-error`选择IO为手动或成功后重开恢复。
- save、save-error：直接编辑正文，900ms防抖来自真实组件。手动完成/失败模拟请求，重试点击真实状态动作；“宿主立即保存”调用真实onSaveHandle并记录boolean。saving期间继续编辑可在完成第一请求后观察第二次请求。
- find：点击真实查找或Ctrl/Cmd+F，输入查找、上下条、选项、替换、关闭均为实际FindReplaceBar和live Markdown adapter。
- writing、writing-partial、writing-stale、writing-stop：点击“开始实际写作流程”，调用公开Agent handle.execute(write_document)并绑定roundId/signal；点击“发送模拟增量”产生真实草稿预览；完成请求写正文，失败/停止后可在真实预览保留或丢弃。修改正文使草稿过期调用真实Tiptap事务，保留禁用由真实版本守卫决定。外部取消本轮Agent测试signal；撤销整轮调用公开undoRound。
- export：从笔记分类触发导出，等待/失败/恢复用同一Promise控制；不会下载文件或写磁盘。
- image：从插入分类选择本地文件或slash图片入口；仅模拟上传服务。成功返回内嵌固定SVG演示地址，失败不插入。原生文件选择器取消由浏览器行为决定，不虚构成已测。
- side：bodySide宿主槽位演示；真实完整大纲、未保存导航守卫留给主任务实际产品。

## 真实与模拟边界

所有保存、检索、属性读写、导出、改写、图片与写作IO都仅是受控Promise；不会发模型请求、连接后端、保存文件/数据库或上传用户文件。固定笔记ID只用于本地回调。浏览器资源请求仅取本地构建资源。模拟“成功”不代表真实服务、原件、文件读取/写盘、重开、版本冲突或模型效果已验；这些必须由真实产品证据/行为测试单独支撑。

日志仅输出动作名称/字符数/固定ID/模拟结果，不输出正文、文件内容或凭据。每个模拟请求都必须点击完成/失败或切立即模式，没有固定延迟冒充最终状态。停止写作由真实AbortController立即拒绝该请求；外部取消可清理正在等待的保留/丢弃。

## 静态长期归档

```sh
python3 .trellis/tasks/10-20-interaction-markdown/gallery/build-archive.py
```

生成`docs/visual-comparisons/2026-10-20-markdown/demo/dist/{before,after}/index.html`和完整带hash的资源，无后端。用任意静态HTTP服务打开；ES模块不保证file://可用。构建时使用真实source动态别名；renderer依赖的@mimir/office仅收敛到相应source的真实markdown-find模块，避免拉入无关各格式总入口。该模块又复用docx-find的纯查找逻辑，因此vendored TS经过esbuild的标准类型擦除（verbatimModuleSyntax=false），仅处理普通import中实际只用于类型的名字，不改vendor文件、无运行时替代。旧截图及静态bundle保留后不依赖临时baseline源码。

浏览器截图、几何、键盘和业务验收由主任务执行。此README不是“已通过”声明；74组ID与可操作入口见coverage-map.json，结果应回填主任务独立验收证据。
