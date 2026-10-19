# Research: XLSX 局部精修差距与复合控件忙态

- Query: 哪些真实局部差距值得修改；哪些已有 busy 的复合 Select 没有显式禁用
- Scope: internal
- Date: 2026-10-20

## Findings

### 冻结实施范围

1. 对象 Inspector 仅 chart/image/table 三种旧模式整理 body 独立滚动、footer 固定和单一主动作；不重写已成熟的 shape/pivot/edit。`XlsxObjectControls.tsx:166–308` 为旧模式字段与内联主动作。窄短视口问题已经主会话 GUI 验证：390×400 时 chart按钮纵向577–601而panel底373；该项是主会话观察，不是本研究代理操作。
2. 图片文件按钮 `XlsxObjectControls.tsx:230` 有label可访问名，现有children只有Upload图标（没有可见文案）；主会话也实际验证。补可见文案，保持 PNG/JPEG、8MiB、宿主写入边界。
3. 高级查找保留现有菜单，只整理结果行、状态、忙态并修复文档/工作表/版本与请求失效；无需把所有菜单迁移到Inspector。
4. 在已有 busy/locked 语义的本地 Select 显式传入 disabled；不改Shell、不新增API/全局抽象。ColorPicker与Select的底层禁用语义不同，不混算。

### 查找生命周期事实与最小边界

- `XlsxFindControls.tsx:21–49` 保存query/scope/lookIn/regex/errors/busy/message/matches；search无同步busy锁、无request identity，旧请求catch/finally可覆盖新上下文。
- `XlsxFindControls.tsx:65` Enter直接调用search；scope67、lookIn76、regex88、errors95没有busy禁用；结果119可在pending点击。
- `XlsxEditor.tsx:1419` 父渲染无key/source/version参数；旧查询/结果可以跨sheet/source/version保留。关闭面板只卸载renderPanel里的内容，不卸载持有状态的XlsxFindControls。
- `agent/xlsx-agent.ts:249–289` 的find_cells当前同步计算、Promise接口返回版本；最多200，返回截断标记，显示值来自公式缓存。当前同步不代表UI不需要失效防护（宿主调用/测试Promise可延后；React闭包仍可能过时）。
- `agent/xlsx-agent.ts:332–351` select_range根据当前handle的workbook解析sheetId；旧match不能直接拿给新原件。
- 建议回归：延迟inspect跨A→B→A不发布/不导航旧结果；同原件新version失效；双Enter只发一次；close/reopen迟到结果不污染；regex错误/0项/200截断/长sheet名；保持选择与dirty/history/保存原件语义不变。

### Select忙态完整扫描（研究时源码位置）

Antd Select 是复合DOM，`disabled fieldset`不会自动禁用；`shell/EditorShell.tsx:747–790` 的ToolbarSelect把显式disabled传给Antd Select。以下已有busy语义但遗漏该prop：

| 本地组件 | 缺口label与源码行 | 已有忙态来源 / 应保持的额外锁 |
|---|---|---|
| XlsxFormatControls | 范围水平对齐254、范围垂直对齐265、范围数字格式预设331 | busy；快速字体105和字号123已经disabled=busy |
| XlsxManualControls | 填充方式169、分组方向242 | busy；原生fieldset仍保留 |
| XlsxPropertyControls | 验证类型225、条件类型314、比较方式336、迷你图类型420、工作簿命名范围485、纸张方向507、纸张大小520、页边距546 | busy或(group非names且sheet protected)；沿用fieldset206的完整条件，names为工作簿级；字段/按钮有效性继续保留 |
| XlsxRangeControls | 复制源工作表195 | busy或locked（protected）；fieldset156已有busy||locked |
| XlsxObjectControls | 图表类型180、表格样式276、表格隔行底色295 | busy；edit模式有自己的locked控制，不重复重写 |
| XlsxVisualProperties | 图表类型109、图例位置115、数据标签127、系列排列138、数据系列189 | 当前组件已有busy=false参数30；Management将locked传入；不要创造新的全局状态 |
| XlsxFindControls | 查找范围67、查找内容76 | 自身busy；与上节同步锁和请求失效一起处理 |

共24个明确遗漏的Select调用点（3+2+8+1+3+5+2）。这是调用点数量，不是所有状态/选项/GUI覆盖数量。研究过程中父会话已在修改，应用时以当前源码定位为准。

明确排除或维持：

- `XlsxEditor.tsx:1674` 工作表缩放缺disabled是只读视图设置，不应因为写入忙态被一刀切锁住。
- Data排序列/顺序、filter/replace；Clipboard粘贴方式/分隔方式；Fill来源/主题/类型/图案；Pivot所有字段/透视表/来源/值/分组/筛选；ValidationOptions规则/提示/错误/下拉；ShapeGallery分类均已有显式disabled，保留现状。
- ToolbarColorPicker `EditorShell.tsx:1936–2033` 普通触发器为原生button、普通popup在DOM内；父fieldset可禁用trigger，不能按Antd Select判为同等缺口。已展开弹层再变busy仍须行为测试；如修复只传本来就存在的busy。相关点：Format字体233/填充242、Property条件372/迷你图436、ShapeGallery159、VisualProperties系列258/形状301。

### 成熟 Inspector 的验收边界（本研究为源码证据）

- Data：mode切换会取消pending，source/context失效，排序1–8级且列不能重复、独立body/fixedfooter。用sort/management-cancel测试的延迟宿主覆盖保留。
- Clipboard：原生capture/workbook identity、cut仅全部粘贴、stale提示、外部HTML/CSV/TSV导入、≤1MiB、≤2000格、系统权限失败回退、fixedfooter。copy/paste网格事件仅canvas，不劫持输入框。
- Fill：source/context变化/close abort，类型无/纯色/图案/线性/路径渐变，theme/tint、2–10色标，mixed/unsupported显式，字段滚动与footer已成熟。
- Shape：104个原生预设加1个文本框（105个画廊项），以实际allowlist和测试为准；分类/查询/4列键盘roving、空搜索、锚点/文字/填充、close/context abort，保留原生映射与预览。
- Pivot：字段/值/筛选，来源含隐藏表但保护源禁用，默认输出实际activeTab；原件readback与eligibility先校验，编辑模式不新增分组/筛选；1–8值，5汇总/4显示/4分组/6筛选族；source/version/pending abort、独立body/fixedfooter。
- Management：对象/表格target、task/source/selection身份失效；locked/pending可切换导航取消；内层删除/转换确认先消费Escape；primary在fixedfooter。不得吞掉图表series/颜色、表格结构或形状原生fill未知状态。
- ValidationOptions：已存规则选择；原件不支持项只读说明；输入提示/标题/内容、stop/warning/information/off、showDropDown反向语义；pending duplicate guard/abort/fixedfooter。

### Fixtures 与验证资源

- `XlsxEditor.test.tsx:83` / vendor `apps/docs/tests/pagination-corpus/xlsx-fixture.xlsx`：真实字节、文本/公式C3缓存1001、样式、合并。
- `editors/xlsx-pivot-test-fixture.ts:5` xlsxPivotFixture：A1:F6销售/成本/日期/区域/部门/渠道，Z2公式缓存3，未知customXml；crossSheet fixture40包含长中文apostrophe源表、默认汇总activeTab1、保留第三表、隐藏来源、受保护来源。
- `editors/xlsx-fill-test-fixture.ts:6`：主题/tint、未知原生属性、条件格式。
- `editors/xlsx-validation-test-fixture.ts:6`：DV字面量001/=A1/引号中文、全局/局部名称、隐藏下拉、stop/warning/information及不支持custom。Node fixtures不能直接在浏览器导入node:fs，Demo构建时序列化字节。
- 既有fill/pivot/clipboard/validation/sort/management-cancel真实组件与原件保存测试提供可复用行为边界；布局变化不用为每个样式写镜像测试。

### Related specs / references

- `.trellis/spec/office/frontend/editors/{conventions,pitfalls}.md`、`shell/{conventions,pitfalls}.md`、`engine/conventions.md`。
- 外部参考单列 `references.md`：实查WeKnora官网/最新release固定commit；本领域主参考Excel web、Google Sheets和固定GenOffice。

## Caveats / Not Found

- 本代理不操作浏览器；本文件区分源码推断与主会话已报告GUI证据。不能称上述每一控件/状态均已GUI通过。
- 行号在并行实施期间可变化，inventory.json将记录源码hash和研究时间用于识别快照。
- 高级查找为生命周期缺口，当前底层同步计算不意味着已观察到线上异步故障；测试必须证明防护边界而非虚构现象。
