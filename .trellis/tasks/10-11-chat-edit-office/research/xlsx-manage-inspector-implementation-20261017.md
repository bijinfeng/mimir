# XLSX 管理 Inspector 修复实施

2026-10-17，formal trellis-implement。依据 root 已批准的 `xlsx-manage-inspector-followup-20261017.md` 和生产浏览器 `xlsx-manage-before-420.png` 具体失败实施；本报告不是浏览器通过声明。

## 变更边界与文件

- `packages/office/src/editors/XlsxObjectControls.tsx`：只抽出管理分支，接现有带 signal、版本校验的 `onPivotOperation` 执行通路；保留其他已在文件中的 pivot eligibility 等并行修改；Escape 不穿透内部色板/portal listbox/tooltip。
- 新 `XlsxObjectManagement.tsx`：对象/结构化表两个具名管理任务，固定当前选择导航、内部滚动内容、同级固定 footer。空表只显示紧凑空态；对象仍保留图表/形状属性及图片/图表/形状删除，表格仍保留四种结构调整与转普通区域。复用同一原生操作，无新原生命令。图表属性/系列数据/系列颜色各有唯一当前主动作；图片原有管理能力只有删除，没有虚构替换能力。
- `XlsxVisualProperties.tsx`：主动作可投影到固定 footer，图表分为属性/系列数据/系列颜色三任务；形状颜色基于实际 `shapePreview.element.fill`，不再以嵌套 text/gradient 的 `fillColor` 或默认白/蓝冒充当前纯色。gradient/noFill/unsupported 不标任何 solid 为 selected；原生主题能解析为纯色时显示真实解析色。只改文字/位置时不写 fillColor；显式选色才覆盖纯色。形状文字及纯色恢复原值后清对应 patch；成功系列更新清草稿，失败保留重试。
- 新 `xlsx-object-management.css`：管理高度链、固定导航与 footer、独立 body scroll；无全局 Antd 覆盖。
- `xlsx-tools.css`：320px Inspector 使用 border-box；header 不参与压缩。
- 新 `XlsxObjectManagement.test.tsx`：17 条面板/真实 Editor/native 回归。

不改 XlsxEditor、服务端、native writer、vendor、pivot、DV 或其他工具；未暂存、提交、归档或删除文档。

## 冻结、失败与焦点

管理请求冻结 source/context/对象/表格/任务身份。来源、目标、任务、卸载变化均 abort，旧响应不发布反馈；自身 busy 不取消自身。请求 ref 防重复，footer 主动作显式 busy 禁用，失败保留草稿。目标/source 改变重置属性草稿，原生执行最终仍由现有 handle expectedVersion/signal 守卫。

发现并修复两种实际组件回归：

1. 普通色板 document capture 关闭后，旧 Escape 还会穿透 Inspector；局部 Inspector handler 识别 shell 子层。真实面板回归先红后绿，首个 Escape 只关色板并回颜色触发器。
2. Antd 原确认弹层保留焦点在触发器，Escape 原先会关整个 Inspector。局部 ManagementConfirm 使用相同 Antd Popconfirm 配置与显式 open，Escape 只取消确认并回真实触发器，下一次才交给 Inspector。来源/目标 key 变化卸载旧确认。测试覆盖确认之前零操作及明确确认后真实参数。

## 检查结果

- 最终目标七文件：`XlsxObjectManagement.test.tsx`、`XlsxShapeGallery.test.tsx`、`XlsxShapeGallery.check.test.tsx`、`XlsxEditor.pivot.test.tsx`、`XlsxEditor.test.tsx`、`XlsxObjectLayer.test.tsx`、`xlsx-shape-preview.test.ts`：122/122，通过。
- `pnpm --filter @mimir/office typecheck`：最终通过。第一次曾仅遇并行 DOCX T 测试的类型错误；该工作者修复后最新检查通过，无本片错误。
- 改动四 TS/TSX 文件 scoped oxlint：通过；六文件 oxfmt check：通过。
- `pnpm lint:styles`、`git diff --check`：通过。
- 三生产 TSX 文件 Antd lint：均 0 issues、partial=false。使用 Popconfirm 前查询了本地 Antd 6.6.4 info/basic demo。
- 没有运行全仓 check、全 Office 或 build；由 root 统一执行。没有控制浏览器或 Desktop。

真实 Editor 测试在原生六形状 fixture 里选择 gradient 形状、零变更保持 version/history=0，文字修改经实际 handle/服务一次 edit_shape，只发布一次 history；save 后真实 readXlsx 读回 gradient 不变。Undo/save 全部非目录 ZIP entries 与原件逐项精确相同，Redo/save 与首次保存逐项精确相同；不声称压缩后整 ZIP 字节一致。

## 移交

代码冻结，等待独立 trellis-check。root 统一新 build 后实测1280与420×500：标题、六类型tabs、管理任务/当前对象可见，body 自身滚动、320px border-box、唯一 footer 主动作未被挤走；验证 native gradient/noFill 色板、真实鼠标确认/取消、Escape分层与回焦、save/history。组件环境没有真实布局，不能由 CSS 推断浏览器通过。

已批准既有证据与竞品分工继续沿 root 计划，不新作网络调研或伪称新抓取：固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 为文件编辑参考；WeKnora v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24` 为同日缓存官方站/公开源核对，知识库/Agent相关，不能决定 Office Inspector 工具栏。
