# PPTX 统一多选与直接组合成员独立复核（2026-10-17）

范围：本切片 PptxEditor 的统一选择/工具整合、SelectionCanvas、SelectionControls、Selection helper、受控 Arrange、GroupTextControls 与 pptx-agent 组内 transport。保留此前裁切/轮廓/图标等变更以及其他会话的外壳/设置修改；未修改 vendor、暂存、提交或归档任务。

## 依据

读取当前任务 PRD、design、implement、check 上下文、Office engine/editor/shell 规范与项目 rules/quality。固定 GenOffice 与 WeKnora 的具体版本、源码证据及适用边界沿 `pptx-group-agent-20261017.md`；本片不新增模型协议，不把 WeKnora Markdown 当 Office Toolbar 参考。GenOffice 顶层组合只展开直接成员的行为在当前 helper 和宿主白名单得到保留；深层组合可发现而不执行写入。

## 发现与修复

- **Canvas Escape 顺序**：window bubble 监听晚于 React 画布清选快捷键；移到捕获阶段取消框选，保留既有选区并抑制随后 click。补 lostpointercapture 清理。独立控件与真实 Editor 挂载均覆盖取消后不发布选择、不 dirty。
- **列表重解析身份**：Shift 范围锚点和待恢复焦点直接比较 canonical ref，首次 creationId 升级后失效。按原 cNvPr 别名解析当前行后再查找；新增生成原生 creationId 的焦点与范围回归。
- **字体作用范围与等待状态**：整个组合原先显示“整框”；改以实际有无单对象文字判断“所选对象”。宿主等待时显式禁用 Home 字形、字号、字体和颜色，同时保留画布更换选择来取消陈旧写入。
- **键盘循环**：空选择 ArrowLeft 原先落到倒数第二项；显式处理无锚点。Shift+Right 原先每次取第一个选择，连续扩选停止在两个对象；改用最后所选上下文及其顶层祖先。
- **React 编译门禁**：早期 applyFormat 捕获晚初始化的 applyPanelOps 造成 react/immutability 错误；沿既有 ref/effect 委托模式更新当前 applyPanelOps，保留版本、选择、上下文取消守卫。hoisted 函数补空 session 守卫。
- **组内文字输入（与实现者配合修复）**：原逐字原生提交禁用 textarea，真实浏览器快输只保留首字符；改连续本地草稿及明确“应用成员文字/取消”。一次 setText 从原件 runs 计算映射，保持来源格式；过期版本清草稿，失败保留草稿。首次 creationId 升级保持成员/组别名，接受后迁移光标，用户已移到外部输入时不抢焦点。
- **局部门禁**：补 mock 类型、移出无闭包 helper，清理测试多参数/条件 expect 和格式错误。

新增 `PptxEditor.multi-selection.test.tsx` 7 项用真实原生 PPTX + 严格 server host 验证：修饰键与受控 Arrange 共用集合、键盘/不 dirty；文字/段落/填充/轮廓原子批次；旧 cNvPr 身份首次写后、undo/redo 和两次保存持续；直接成员和祖先归一化；过期异步写入 signal abort 且无 dirty/history；原 Home 工具批量及整个组合；连续组内草稿、原生应用、光标与保存后再编辑；捕获 Escape 保留选择。未改变的 ZIP 部件与历史恢复逐 entry 比较。

## 验证

最终同一命令 9 文件 **124/124** 通过，不与此前重叠快照累计：

- `PptxEditor.test.tsx`
- `PptxEditor.selection-tools.test.tsx`
- `PptxEditor.multi-selection.test.tsx`
- `PptxSelectionCanvas.test.tsx`
- `PptxSelectionControls.test.tsx`
- `PptxGroupTextControls.test.tsx`
- `pptx-selection.test.ts`
- `pptx-agent.group-selection.test.ts`
- `pptx-agent.test.ts`

日志 `/tmp/mimir-pptx-global-selection-final-tests.log`。Office tsc exit0，日志 `/tmp/mimir-pptx-global-check-tsc-final.log`。本片 14 个 TS/TSX 定向 Oxlint exit0、16 文件 Oxfmt check exit0、样式守卫与 git diff --check 通过。

全仓 `pnpm check` 实际运行仍在 lint 阶段失败，最终快照恰为 **480** 个错误，均来自并行引入的 bundled Impeccable 脚本（`.agents/skills/impeccable/scripts` / `.github/skills/impeccable/scripts`）；不属于此 Office 切片，未擅改其实现或忽略配置。日志 `/tmp/mimir-pptx-global-check-full-final.log`。不能称全仓门禁通过。

浏览器样式、420px、下载原生字节证据由根会话统一收口；本记录的组件/引擎测试不当作浏览器验收。真实模型未配置，Desktop 按用户要求自验，均不冒报通过。整体任务继续 in_progress。

## 浏览器反馈后追加复核

根会话最后实测发现 subbar 打开 Inspector 时记下 activeElement，会在原 ToolbarButton 阻止默认聚焦的场景回到画布或 BODY。根会话改为真实按钮 ref；checker 新增“先聚焦画布 → mousedown 不改变焦点 → 点击真实 subbar 入口 → 聚焦对象行 → Escape”挂载回归，确认关闭后回到入口按钮，不依赖测试环境默认聚焦。

保存 commit 推进 version 后成员文字框重挂，会清掉已接受光标。实现者按相同已接受文字保存 blur/select 的范围，版本变动只恢复范围而不抢外部保存按钮焦点；checker 新增“应用文字 → 外部保存按钮聚焦 → 保存 → 仅 refocus、不设置选区 → 按现有 caret 追加 ! → 再应用/保存”真实 Editor 和原生字节回读，确认追加在末尾。

这两项追加后独立定向 **2 文件 14/14**（Editor multi-selection 9 + GroupTextControls 5）通过，和上方 124 项重叠，不累计。Office tsc、这四个涉及文件的 Oxlint/Oxfmt、diff 检查通过。日志 `/tmp/mimir-pptx-global-selection-focus-save.log` 与 `/tmp/mimir-pptx-global-focus-save-{tsc,lint,format}.log`。没有新增生产修复，真实按钮 ref 与保存光标实现复核通过；最终浏览器与构建证据仍归根会话记录。
