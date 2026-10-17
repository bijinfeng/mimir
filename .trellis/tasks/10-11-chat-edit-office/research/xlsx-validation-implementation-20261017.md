# XLSX 数据验证交互实施交接

2026-10-17，正式 trellis-implement 子代理。按 `xlsx-validation-interactions-next-plan-20261017.md` 实施；固定 GenOffice / WeKnora 版本及具体证据复用该方案的本日缓存记录，本片未重新声称官网访问。未改 vendor 或其他格式。

## 已实施

- 读取完整原生提示、错误行为、下拉开关和原规则 XML；正确处理原生缺省 false 与 showDropDown 的反向语义。DV 属性单独解析合法引号/空白/大于号，未知布尔、重复/坏属性及扩展保守拒绝。Excel `_xNNNN_` 提示文本读写转义，保留原约束、公式与非目标 XML。
- 浏览器显示与宿主校验共用有界列表 resolver：inline（保留空项、001、等号文本和转义引号）、引号跨表、全局/局部名称。2K项/32K文字/8层名称预算，大小写不敏感名称、局部优先，拒绝循环/歧义/隐藏名称/外链/复杂公式/合并格/未缓存公式。隐藏工作表作为只读来源时仍核验实际值及预算。
- 当前格紧凑下拉入口，Alt+Down、方向/Home/End、Enter/Space、Escape/Tab、鼠标；popup 放在编辑器未缩放主题树中，按实际 trigger rect 限制视口位置。选项是 literal scalar，`=A1` 不变成公式。输入提示按原生开关显示，打开/取消零发布。
- 宿主区分 stop、warning、information、关闭错误提示；未知/失败保持严格拒绝。先检查全部改动及所有规则，stop 不可被较早 warning 掩盖，批量失败不发布部分结果。缓存缺失公式只限制实际验证范围，避免阻止同表无关公式。
- 私有手动单格握手：独立执行 options / multipart 字段传 intent 与 opaque token，模型 args 不取此字段。路由只用鉴权 principal，服务端再次计算当前规则；token 绑定账号、文档、完整源 bytes SHA、版本、格、值及全部规则，5分钟、最多128个、单次消费。Agent/批量拒绝并如实提示。
- 客户端冻结源/句柄/版本/格/草稿/保存和工具上下文。改稿、换格、取消、保存、版本或源改变单调失效，A→B→A 不复活；同tick锁避免双确认。迟到单格与属性写入均不发布。确认成功只进一次既有 FIFO/history，原件仍手动保存。
- “数据 → 验证提示”打开320px Inspector：选择真实原件规则，编辑输入提示、错误行为/文案与下拉可见性。内部滚动，section直属固定 footer 只有一个 primary。成功保留当前规则并读取新值；关闭/外部版本变化取消旧请求。编辑只改唯一 raw XML 对应规则的属性，不替换其约束；保护、扩展/未知、过期规则或无改动拒绝。

## 文件边界

- shared：`packages/shared/src/xlsx-agent.ts`，私有确认与提示属性严格 schema/错误类型，未加入模型目录。
- Office native：`xlsx-sheet-features.ts`、`xlsx-cell-effects.ts`、新 `xlsx-validation-list.ts`。
- Office UI：`agent/xlsx-agent.ts` 的手动 options 转发；`editors/XlsxEditor.tsx` 最小接缝；新 `XlsxValidationDropdown.tsx`、`XlsxValidationOptionsControls.tsx`、`use-xlsx-cell-input.ts`、`xlsx-validation.css`。
- Server：`xlsx-agent-host.ts`、新 `xlsx-validation-consent.ts`、`xlsx-validation-options.ts`；`routes/conversations.ts` 只改 XLSX apply-ops 块，保留并行 PDF 修改。
- Renderer：`lib/api.ts` 仅 XLSX consent 与 typed warning bridge，保留并行 PDF 修改。
- Tests：Office `xlsx-validation-list.test.ts`、`XlsxEditor.validation.test.tsx`、`xlsx-validation-test-fixture.ts`；server `xlsx-validation-host.test.ts`、`xlsx-validation-route.test.ts`；renderer `xlsx-validation-api.test.ts`。
- 现行合同：`.trellis/spec/shared/contract/xlsx-agent.md` 替换旧 warning/info 全部严格的描述，并补原生列表和确认合同。

## 实际门禁

- Office目标3文件 **21/21**：实际 Editor7、resolver/native5、既有 Agent9。最后 Editor7 单独再验确认回同稿不复活的断言。真实宿主串联当前 Editor，包含 literal选择、stop/info/off、警告显式确认/取消/双击、迟到拒绝、固定footer/current rule、属性关闭取消、保存/undo/redo全部ZIP与原bytes恢复。
- Server目标4文件 **23/23**：native host13、鉴权HTTP1、既有effects/properties9。涵盖七维token绑定/过期/消费、伪造stop/未知/批量原子拒绝、选项原生往返与未改ZIP、存储原件不被工作副本请求改写。
- Renderer bridge **2/2**：真实 API 方法 strict warning 转换与独立 multipart 字段，坏 details 仍保留 ordinary API error。
- Office / Server / Renderer `tsc --noEmit` 均 exit0（Renderer直接exec tsc，没有重写路由生成文件）。首轮并行 PDF test 类型错误随后已由其owner解决，最终这里实跑绿色。
- 所有本片目标TS/TSX oxlint exit0；最后目标扫描已清掉本片全部诊断。新增 Dropdown、OptionsControls 与 XlsxEditor 的 antd lint均 issues0。目标文件 oxfmt已运行。
- 初期缺少 options 模块造成热 API500 已立即修复；后续两次实查 `http://localhost:3000/api/conversations` 均401，模块加载正常。
- 未跑全Office/server套件、Webbuild或浏览器；这些由root统一，不能将组件测试当作420×500几何证据。无真实模型调用，Desktop按用户要求自行验收。

## 浏览器夹具和待验

生成器 `research/generate-xlsx-validation-fixture-20261017.ts` 已实际执行，输出 `/tmp/mimir-xlsx-validation-20261017.xlsx`，默认“汇总”sheet-2，11项原生规则。

- A1：inline `001 / =A1 / 中文 / 含"引号"`；A2：含空格、中文和单引号的跨表引用；A3：全局名称；A4：局部名称优先；A5：隐藏下拉；A6：原生缺省不开错误提示。
- B1：stop（1–5）；B2：warning；B3：information；B4：关闭错误提示；B5：不支持 custom 函数。
- 源表、隐藏来源、受保护来源、第三表和 customXml 可用于保真对照。

root仍需独立checker与1280/420×500生产浏览器，量取真实popup、Inspector滚动/固定footer、焦点与保存重开。进程重启会使内存 token 失效，用户需重新应用；这是受限手动确认，不是持久通用许可。不宣称所有Excel复杂公式/原件兼容。未暂存/提交/归档/上传或删除测试件。

另保留root已发现的DOCX浮动表格跨节120px偏移待回片；本片未触碰冻结DOCX代码，也不把该浏览器项记为通过。
