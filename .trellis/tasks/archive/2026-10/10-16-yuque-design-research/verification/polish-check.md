# 第二轮视觉与交互精修检查

日期：2026-10-17。检查角色：`trellis-check`。范围：静态稿对齐后的导航、知识库、笔记标题与保存反馈、供应商表单、共享 CompactToolbar 窄区压缩。检查期间保留并行 Office 会话的 PPTX 功能改动，未修改其源码。

## Findings (fixed)

本检查轮未发现需要检查代理直接修改的机械问题，未修改产品代码。实施负责方已经修正的行为，经实际代码路径和回归用例核对如下：

| 检查点 | 代码与回归证据 |
| --- | --- |
| 笔记标题与元信息 | `DocumentTitle` 由宿主传入 MarkdownEditor 的 `contentHeader`，在正文滚动区、ProseMirror 之外。Header 只保留路径；唯一文档标题可修改，更新时间来自文档数据。Enter trim 后只提交一次，Escape 不提交且返回改名按钮。 |
| 真实保存状态 | 编辑时进入 `pending`，实际写入时进入 `saving`；失败 `error` 与重试、成功 `saved` 均有回归。现有版本循环保存与离开守卫保持；父级状态更新具有同值保护，没有新增 memo 例外。 |
| 未保存导航 | `closeAfterAction` 位于 `runGuarded` 获准的回调内，最近笔记复用同一路径。测试覆盖取消后保留抽屉和操作焦点、保存/丢弃获准后关闭与导航。 |
| 抽屉键盘 | antd Drawer 加局部首尾 Tab 边界循环；确认框出现时暂停抽屉 trap、Escape 与遮罩关闭，避免两层焦点管理冲突。测试覆盖首尾循环、关闭后焦点恢复。 |
| 知识库层级 | 标题使用 `FONT_SIZE.display=28`，描述与卡片名14px，卡片名500；窄屏长名称折行，ready 使用安静文字，异常状态保留徽标。卡片空白/摘要/标题打开与更多/下载不误打开有回归。 |
| 设置与密钥 | 设置标题22px，预设使用可搜索 Select 并复用原有填充逻辑；只移除连接表单冗余分隔。密钥草稿明确待保存，只有持久化密钥显示已配置，清除/撤销语义保留。 |
| 输入焦点 | 重复添加空手动模型会滚动并聚焦现有稳定行，不新增第二行；模型校验同样定位稳定 input ID。预设选择后聚焦显示名。 |
| 可触达与工具栏 | 导航窄屏/粗指针44px，卡片更多40px，改名40px。CompactToolbar 使用同一44–72px计算值驱动宽度预算与CSS，组标签允许折行；338/390px六组及末组命令执行有回归，分类、组名和真实命令保留。 |

主会话提供的独立真实浏览器结果：390px 的 Drawer 首项 Shift+Tab 到设置、设置 Tab 到关闭；Escape 后焦点回到展开按钮且无 body 滚动锁，功能栏7个按钮均44px；卡片更多 Enter 与标题 Space 可用；1280/390px 知识库浅深截图及笔记28px唯一标题已核实。相关证据在同目录 `polish-library-*.png`、`polish-navigation-mobile.png`。这些浏览器观察由主会话执行，本检查代理没有重复控制浏览器；最终设置截图与Desktop构建/烟测由主会话补充。

## Findings (not fixed)

- **全仓质量门未通过。** 最终一次 `pnpm check` 在 lint 阶段退出1，共480条错误，全部来自 `.agents/skills/impeccable/scripts/`、`.claude/skills/impeccable/scripts/`、`.github/skills/impeccable/scripts/` 的15个生成脚本路径。未改第三方技能文件、未削弱规则。完整输出：`/tmp/mimir-yuque-polish-check.log`。
- 该命令在 lint 处停止，因此不能把后续 format/typecheck/test 阶段写成完整质量门通过。下面的类型、样式、格式和受影响测试均是另外独立执行的实际结果。未重跑全仓测试；前一轮已记录的 Office 全套时序失败不由本轮定向通过覆盖。
- 正式规范与任务中“工具区滚动”的历史表述由主会话同步，明确可滚动的是分类标签，338/390px的命令组带按组压缩；本检查不代替其最终文档验收。

未发现其他本轮范围内的未修复代码问题。不扩大到并行PPTX功能审查。

## Verification

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 本轮30个产品文件 scoped oxlint | pass | `/tmp/mimir-yuque-polish-lint.log`，文件清单 `/tmp/mimir-yuque-polish-scope.json` |
| 同一范围 oxfmt --check | pass | `/tmp/mimir-yuque-polish-format.log` |
| 样式模板守卫 | pass | `/tmp/mimir-yuque-polish-style.log` |
| git diff --check，本轮范围 | pass | `/tmp/mimir-yuque-polish-diff.log` |
| pnpm -r typecheck，全仓 | pass | `/tmp/mimir-yuque-polish-typecheck.log`，含 Office、Chat、Renderer、Server、Web、Desktop与插件 |
| Renderer主题/外观/导航/库/头部/供应商/目录/模型/Markdown控件与编辑器 | pass，10文件193项 | `/tmp/mimir-yuque-polish-renderer.log` |
| Renderer Markdown保存 | pass，1文件11项 | `/tmp/mimir-yuque-polish-save.log` |
| Office CompactToolbar/markdown-controls/EditorShell | pass，3文件136项 | `/tmp/mimir-yuque-polish-office.log` |
| pnpm check | fail，停于上述技能JS lint | `/tmp/mimir-yuque-polish-check.log` |

本轮独立测试合计：14文件340项通过。此前单独复跑的导航/主题127项与这些测试重叠，不重复计数。源码检查与测试结果支持本次八项精修；全仓质量门仍需解决技能脚本扫描错误后重新运行，不能关闭任务或宣称全仓通过。


## 主会话最终验收补充

- 最后发现并修复主题子菜单 portal 残留：先同步关闭子菜单，再关闭父菜单并切主题，启用 `destroyOnHidden`。回归用例已在旧代码复现失败，修后导航相关5文件26项通过（与上面的340项有重叠，不相加）；Renderer类型、AntD lint、scoped oxlint/format/diff检查通过。
- 真实浏览器分别选择深色、跟随系统、浅色，均确认主题生效、子菜单隐藏、焦点回到账号按钮；390px再确认深/浅切换与页面无横向溢出。已覆盖更新干净的 `polish-document-light-wide.png` 与两张 `polish-library-*-mobile.png`。
- 真实浏览器检查唯一28px标题、Escape取消改名、390px六组命令无横向滚动、879/880/881px布局边界与文档AI范围；供应商预设搜索/键盘选择、重复空模型定位、密钥草稿提示正常。测试草稿已放弃，未保存供应商或密钥。
- Desktop实际当前源码构建以临时userData启动，检查知识库和种子文档；12项启动/首启/本地与云桥隔离烟测通过，截图 `polish-desktop-library.png` / `polish-desktop-document.png`。临时进程和目录已清理。最后主题菜单修复后再次构建通过，日志 `/tmp/mimir-yuque-polish-desktop-menu-build.log`。
- 浏览器恢复浅色、清除临时视口覆盖，保留本地预览页。详细测量见 `polish-browser-evidence.json`。
- 全仓质量门仍受上述技能JS lint阻断，任务保持 `in_progress`，未提交本批精修、未归档或发布；并行Office功能保持原样。
