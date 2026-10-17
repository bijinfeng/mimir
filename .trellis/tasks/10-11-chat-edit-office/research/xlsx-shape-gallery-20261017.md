# XLSX 完整可插入形状库 — 2026-10-17

## 固定参考与适用范围

- GenOffice checkout `/tmp/mimir-genoffice-html-git` HEAD 本片重新核对为 `480548fd55f1be3593ee0d8e316a734751d58309`。`packages/xlsx-gateway/src/shared/shape-types.ts` 104 项为原生 add_shape 白名单；`apps/sheets/src/renderer/ExcelShell.tsx:3253–3305` 复用跨格式分组图库并排除线条，因为工作表绘制器使用填充几何。Mimir 复用已有 `PPTX_SHAPE_GROUPS` 中文名称及 `pptxShapePreview`，逐项过滤 XLSX 白名单，补既有 textbox；未扩大宿主 schema。
- WeKnora 站点本次请求 HTTP 200，快照 `/tmp/mimir-xlsx-shapes-weknora-site.html`。公开源码 v0.8.3 commit `3e22822c1d2397be730c458c7539d0eb8c113a24/internal/agent/tools/definitions.go` 本次重新下载 HTTP 200，`/tmp/mimir-xlsx-shapes-weknora-definitions.go`：14–22 是知识检索，35–49、61–75 按真实 sandbox capability 注册工具。适用于图库只列实际可插入能力；没有 XLSX 形状几何或 Office 工具栏模型，因此不作为编辑器图库的主要参考。
- 视觉沿当前 Mimir 320px 工作表 Inspector、具名对象入口、Ant Design 控件与既有 PPTX 轮廓图库。Impeccable Operate/craft floor 已读取；本片不重设主题或样式系统。

## 接缝与所有权

仅改 `XlsxObjectControls.tsx`、`XlsxObjectLayer.tsx`，新增 `XlsxShapeGallery.tsx`、`xlsx-shape-gallery.ts/css` 及对应三份专项测试。保留同文件既有高级透视等其他人的修改；未改 XlsxEditor、server、shared、renderer 或 vendor。root 负责浏览器/统一构建，独立 checker 另补检查。

`XlsxShapeGallery({range,sourceKey,contextKey,busy,onOperation})` 的操作为既有单个 `{op:'add_shape',shapeType,anchorCell,text,fillColor}`。ObjectControls 复用现有名为 `onPivotOperation` 的可取消通用 propose_operations 接缝；XlsxEditor 已为其绑定 sheetId/expectedVersion/signal，无需改宿主签名。

## 行为与边界

- 104 原生预设加文本框，共105项，分文字、矩形、基本形状、箭头、星形、流程图、标注；中文或英文 preset 搜索，分组筛选，保留被筛出视图的当前选择。每项有真实几何及名称；单个 Tab stop，箭头/Home/End 移动选择，不写文档。
- 搜索/分组和底部“已选形状 · 插入位置”与唯一插入按钮固定，图库独立滚动。文字/位置/填充收在图库前方具名折叠区。默认位置取当前范围首格；未选范围时明确要求位置。验证原生单元格地址、4列×8行默认占位边界、1000字符、`#RRGGBB` 后才调用宿主一次。
- 草稿不随普通重渲染或 busy 改变丢失；重复点击不重复执行。工作字节变化取消待处理请求并保留草稿，文档/工作表 context 变化重置草稿；关闭/Escape/切换类型卸载时 abort。宿主活句柄继续重验版本与 signal，迟到字节不发布。
- Gallery 与 ObjectLayer 共用同一预设轮廓；未知 preset 返回明确“形状预览有限”，不再通用矩形回退。管理区说明原件复杂填充、旋转和文字样式预览有限。当前解析层未暴露原生 adj、rotation、gradient/rich text 等完整信息，自定义几何缺 prst 时既有 parser 仍按 rect 建模；本片不声称这些原件像素保真，也没有改写它们的原生 XML。
- 原有数据、结构化表、透视、图片和图表入口保留。插入进入当前工作副本与普通保存/history；不自动保存原件。

## 验证

- 新专项14项：白名单完整性和105项有限真实几何、搜索/分组/键盘/隐藏选择/单次插入；真实宿主顺序插入全部105项并原生 XML 重开；未知几何提示；源/context/卸载取消；真实 Editor 慢宿主、关闭/Escape/切换类型迟到字节拒绝；连续 heart+cloudCallout 插入和两次保存，再两步 undo/save、两步 redo/save，所有非目录 ZIP 部件精确恢复。
- 原生数据使用实际 sheetData XML、styles/sharedStrings 保真；插入会扩展显示网格，不能将新增空白显示行列误判为原单元格变化。既有 gateway 每次写入会补 fullCalcOnLoad，workbook.xml 除 calcPr 外保持；不能要求其全文原字节不变。
- 与既有 XlsxEditor、XlsxEditor.pivot、XlsxPivotControls 合跑6文件93/93；最终日志 `/tmp/mimir-xlsx-shape-gallery-final.log`。Office tsc、目标 oxlint 无告警、oxfmt --check、Antd lint（0 issues）、样式守卫、git diff --check 通过。
- 浏览器宽/420、原件下载与真实界面几何由 root 续验；此处组件测试不能替代浏览器结果。未配置模型，无真实模型调用；未构建、暂存、提交或归档整体任务。

## 浏览器发现的对象定位修复

root 实测新增 heart 原生锚点 D10 正确，但宽屏预览 y≈381、实际行10 y≈444.78。原 `xlsxVisualBox` 累加模型默认20px行高、24px表头，而真实 DOM 表头27px、第一行32px、其他内容行28.046875px/空白行27px；累计偏差来自预览坐标，非原件 add_shape。

- 新增 `xlsx-object-layout.ts` 测量 stage 内普通流 `colgroup > col` 与 `tbody > tr`，保留隐藏/稀疏行列的原生索引；不读取 sticky 表头或合并单元格矩形。`XlsxObjectLayer` 使用一次测量结果绘制全部对象，并由 ResizeObserver/缩放 style/窗口尺寸变化重测，卸载清理。无对象不安装观察器。未改 XlsxEditor、原生锚点或写回接缝。
- 真实矩形减 stage 原点后除以 CSS zoom，EMU offset 仍为9525/px；滚动造成的共同平移消去。隐藏或未物化轨道折叠到下一可见边界，完全隐藏跨度不再产生24px虚假矩形；当前既有200列/1000行/20000格显示物化边界仍保留，边界外不声称完整预览。无真实布局的测试/宿主环境沿用模型回退。
- 新专项7项：D10实际行高、75%/100%/150%及滚动与fractional EMU、自定义行列尺寸/隐藏/稀疏索引/合并格排除、无布局回退/观察器噪声、挂载后行列变化/缩放重测与清理。与图库/Editor/透视合跑7文件100/100，日志 `/tmp/mimir-xlsx-shape-layout-final.log`；Office tsc与目标oxlint通过。真实浏览器 D10/420/缩放续验由 root 执行。
