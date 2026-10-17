# XLSX 原生填充独立复核（2026-10-17）

## 范围与依据

- 复核私有 fill reader/preview、320px Inspector、XlsxFormatControls/XlsxEditor 接入、原生宿主样式修复与 Agent catalog。覆盖全部18种图案、主题/tint、linear/path渐变、2–10色标、fill省略/null及同批优先级、CF/table图层、当前/混合值、任意HEX输入、版本/取消和历史。
- 主参照 GenOffice 固定提交 `480548fd55f1be3593ee0d8e316a734751d58309`；本次核对 `/tmp/mimir-genoffice-html-git` HEAD，以及固定 vendor 的 `domain/style-color.ts`、`workbook-dsl.ts`、`gateway/xlsx-styles.ts`。StyleColor仅支持RGB字串或带tint的主题引用；原生样式池通过追加XF派生变更，私有补丁保留其未建模元数据。
- WeKnora 官网HTTP200快照 `/tmp/mimir-references-weknora-site.html`（113529bytes），公开源码v0.8.3、提交 `3e22822c1d2397be730c458c7539d0eb8c113a24` 的 `internal/agent/tools/definitions.go` 快照 `/tmp/mimir-references-weknora-tools.go`（13533bytes）。本次复核其中search_knowledge/read_file和sandbox工具定义；可参考真实执行边界，不提供Office填充UI或OOXML样式合同，故不作为工具栏主范式。

## Findings (fixed)

1. `packages/office/src/editors/XlsxFillControls.tsx`：primary ToolbarButton自动显示label，children再传同一文字，导致真实浏览器“应用填充”重复。children改用PaintBucket图标；操作名与aria仍由label提供。控件测试增加默认/等待中可见文字精确断言。
2. `packages/office/src/xlsx-fill.ts`：原件RGB颜色带非零tint时，reader丢弃tint并把原RGB当成可编辑当前值。原生StyleColor无法保留此组合，现将它作为unsupported原件提示，避免无修改地应用错误颜色。新增solid及gradient两项回归；先跑证明旧实现2项失败，再修复并跑绿。新增真实宿主用例证明省略fill、只改字体时原RGB+tint XML与继承标记仍保留。
3. 根会话真实浏览器补充证据：1280px打开面板后切420px，CompactToolbar折叠分支卸载整个FillControls，面板和草稿随之丢失。`XlsxEditor`现把FillControls持久挂在body；`XlsxFormatControls`只保留轻量入口，通过私有ref传入实际触发按钮。Inspector跨宽窄切换保留同一节点、草稿和在途请求；Escape优先回当前填充按钮，折叠后回“格式”分组。未修改全局CompactToolbar。
4. `.trellis/spec/shared/contract/xlsx-agent.md` 同步RGB+tint原件边界、省略fill保留原XML、Inspector持久挂载与焦点回退约束。

## Findings (not fixed)

- 本次范围未发现其他需要修改的代码问题。原始XF的quotePrefix/pivotButton/保护/未知扩展、未改alignment属性、清除阻止父fill回流、仅改字体保留fill继承、richfill与CF/table的优先级均沿实际读写路径核对并有回归。
- 真正的420px/宽屏样式、长色标内部滚动、固定footer与浏览器保存重开由根会话统一验收；本复核未操作浏览器或运行构建。Desktop按用户要求自行验收；模型未配置，未宣称完成真实模型Agent验收。
- 全库`pnpm check`此前被480条随包Impeccable脚本lint错误阻塞，本轮没有重跑或声称全库通过。以下为实际独立运行的范围门禁。

## Verification

- Office：最终7文件 **151/151**；填充4文件43项、format/reader回归39项、既有XlsxEditor整体回归69项。包含真实host→canvas→保存→undo/save→redo/save的完整ZIP条目比对，以及对象Inspector接管后不遵守abort的迟到宿主返回不能发布字节/版本/dirty/history。新增真实Editor/ResizeObserver驱动1280→420→1280：断言同一portal节点、角度237保留、折叠Escape焦点、折叠菜单开启的在途操作跨展开不abort，真实host完成后只产生一次history。
- Server：3文件 **55/55**，fill-host25、既有agent-host17、pivot grouping/refresh13；覆盖18图案、两种渐变2/10色标、连续两次保存、未触及ZIP、XF元数据、清除/省略/批次优先级、非法参数整批拒绝和保护。
- Office TypeCheck：pass；Server TypeCheck：pass。
- 触及TS/TSX的oxlint：pass；本复核涉及9个文件的oxfmt：pass。
- XlsxFillControls/XlsxFormatControls/XlsxEditor逐文件Antd lint：pass；`pnpm lint:styles`：pass；本次变更`git diff --check`：pass。
- 测试使用无DB临时config `/tmp/pptx-three-slice-vitest.config.mjs`，未新增账号、未触及vendor、未构建或提交。

日志：`/tmp/mimir-xlsx-fill-check-office-tests.log`、`server-tests.log`、`office-types.log`、`server-types.log`、`lint.log`、`format.log`、`styles.log`，Antd日志为同前缀`antd-Xlsx{FillControls,FormatControls,Editor}.log`；宽度修复另有`resize-tests.log`、`resize-lint.log`、`resize-format.log`。失败先证据见`/tmp/mimir-xlsx-fill-check-rgb-tint-red.log`。
