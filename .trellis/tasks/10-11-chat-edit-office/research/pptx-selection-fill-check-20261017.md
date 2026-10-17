# PPTX 批量外观与组内翻转独立复核（2026-10-17）

补充验收已完成：根会话浏览器发现connector可被写入原生gradFill，但模型不暴露fill，导致批量当前态与后续渐变编辑不一致。现UI、操作构建与宿主共同使用纯 `pptxSupportsShapeFill`，统一排除line/connector的填充目标，保留组合样式对其stroke的作用；根会话同时收紧manual-fill服务。下方69/15为补充前完整快照，补充后独立受影响门禁为Office35/35、server4/4，轮次不累计。

## 复核范围

复核根会话的shared selection填充合同、manual-fill真实宿主、compact response、Editor expectedVersion/signal接线；复核已冻结的批量渐变/32组合样式/纹理UI与纯适配，以及服务端裸组内flip同步补写。没有改vendor、公共模型操作名或其他工作者的生产文件。

沿本任务固定GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`的真实原生代码核对：flipElements先保中心更新成员模型，editGroupChildTransform负责父组合XML补写；不把宿主可调用当作保存已正确。WeKnora固定v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24`的公开工具职责与适用边界沿 `pptx-group-agent-20261017.md`记录；知识检索/文档工具证据不提供Office外观控件或组内几何算法，本片为代码复核，没有新增外部调研主张。

## Findings（fixed）

- `pptx-selection-geometry.test.ts`：旧专项断言bare host flip重开等于原件，已不符合服务端真实修复。更新为flipH实际落地、原rotation/flipV/宽高保持、视觉中心保持、父transform与兄弟XML保持、其余ZIP entries保持，以及重开后再保存相等。生产geometry未改，原Inspector显式flush批次继续兼容。
- `apps/server/src/test/pptx-selection-fill-host.test.ts`：补同一组成员的runtime ID与durable GUID两种别名同时输入。shared可接受不同字符串，真实宿主须解析为同一对象后拒绝重复；专项确认原版本/原件保持。
- 新 `PptxEditor.selection-fill.test.tsx`：5条真正挂载Editor并走严格原生宿主的接缝回归。纹理只mock本地fetch读取固定PNG，模型服务一旦误调用立即抛错；不伪造宿主成功字节。
  - 选择顶层与group直接成员后先暂存纹理，未应用不dirty。等待期间重复点击不创建第二宿主调用，保存和对象选择锁定；接受后原生填充可保存，undo/save恢复原件、redo/save逐ZIP entry恢复修改。
  - 延迟宿主先生成真实accepted bytes，然后关闭面板、换目标、换documentId或并发setText再回传，旧纹理均不得落地。close/target/source发出的signal已abort；version场景按版本守卫拒绝旧结果，保存仍含并发新文字且没有纹理。不把版本拒绝冒报为即时signal取消。
- `.trellis/spec/office/engine/conventions.md`：补同名registry包装必须同步并finally恢复的可执行约束，防未来引入await使跨请求隔离失效。
- `.trellis/spec/office/frontend/editors/pitfalls.md`：记录connector无可编辑fill的模型边界，以及填充统一过滤、宿主原子拒绝和line-only组合样式仍须可达的约束。checker发现按fillTargets禁用整个Appearance会封死line-only样式，已交实施者修正并由组件回归验证。

## 实际代码路径结论

- shared selection arm限定1–200个明确target，每项可带直接父group，拒绝字符串重复；宿主逐对象解析并按对象身份再次去重，验证整个选择后才执行一个原子txn。current模式分别取每个对象自己的mediaRef，不拷贝第一对象图片。纹理按固定资产SHA256与PNG实际解码校验；cancel在原生写入前、保存后均复验。
- selection manual_fill只返回一条compact summary record，含target/source id或current/tile/count，不重复携带PNG或原生Uint8Array。既有shape/background记录保持原语义。最终server专项覆盖此响应边界。
- Editor新入口沿已有panelWriteBinding管理请求所有权，携带expectedVersion和signal；关闭、切目标、切文档不会把迟到响应应用到新上下文。接受版本推进后的旧控件卸载不反转已完成事实。原生host返回accepted字节仍由活句柄复验取消与版本。
- 批量渐变只改明确参数，原件不同色标分别保留，mixed类型须明确选新类型才转换；32种样式复用原样式源，替换其意图中的填充/轮廓颜色/线型，保留逐对象线宽、端点、箭头和文字。暂存样式的轮廓详情与填充覆盖一起生成一次批次。图片填充草稿与其他格式草稿互斥，由UI明确说明并以提交前校验兜底。
- runPptxHostTxn保留原生validate、records、snapshot与atomic rollback，同步安装同名flip包装并在finally恢复；未引入私有操作名。补写发生在每次flip内部，因此同批次紧接ungroup/duplicateSlide也已持久化。顶层native flip无变化。
- connector补充：同一predicate贯穿常用与外观的填充当前值/数量、setFill构建、纹理targets和宿主验证。Appearance按shapeTargets启用，内部fill区域按fillTargets渲染，因此line-only可进入组合样式且不显示不可用填充字段。真实五种line/lineArrow/lineArrowDouble/lineBent/lineCurved保存后原fill保持、无新增gradFill，样式stroke仍实际持久化；真实host混入valid+line在txn前拒绝。

## 独立最终门禁

- Office九文件 **69/69**：新selection-fill mounted、multi-selection、SelectionControls、selection-fill纯适配、selection纯适配、geometry纯适配/UI、OutlineControls、GroupText。日志 `/tmp/mimir-pptx-fill-detail-final-office.log`。
- server三个真实宿主文件 **15/15**：selection-fill、group-flip、selection-format，使用无DB setup配置 `/tmp/pptx-three-slice-vitest.config.mjs`。日志 `/tmp/mimir-pptx-fill-detail-final-host.log`。
- Office / Server / Shared `tsc --noEmit`均通过。16个目标TS/TSX Oxlint、17个目标文件Oxfmt、`pnpm lint:styles`通过；最终全树 `git diff --check`通过。日志前缀 `/tmp/mimir-pptx-fill-detail-final-`。
- 先前单跑group host10/10、geometry5/5、fill host3/3与mounted5/5为重叠轮次，不累计。新mounted首轮因Vite将asset new URL转为浏览器URL而使readFileSync拒绝，改沿已有dirname+fileURLToPath夹具读取后通过；该失败未涉及生产逻辑。
- 本会话前片实际全仓pnpm check被Impeccable脚本480项错误阻断。本片没有为相同外部边界重复宽跑，也不宣称全仓check通过。

### connector补充后的独立受影响门禁

- Office四文件 **35/35**：mounted selection-fill、SelectionControls、selection-fill纯/真实宿主适配、selection纯适配。日志 `/tmp/mimir-pptx-connector-check-office.log`。
- server selection-fill真实宿主 **4/4**，含新增valid+line原子拒绝。日志 `/tmp/mimir-pptx-connector-check-host.log`。
- Office/Server `tsc --noEmit`均通过；九个目标TS/TSX Oxlint、Oxfmt与`pnpm lint:styles`通过，全树`git diff --check`通过。日志前缀 `/tmp/mimir-pptx-connector-check-`。Shared合同在此补充未改变，沿前轮已通过门禁。
- 本轮35/4与上方69/15覆盖重叠，不能相加为测试总数。组内flip与selection geometry未受connector补充影响，不重复宽跑。

## Findings（not fixed）与验收边界

当前复核范围没有未修复的确定生产缺陷。前片 `pptx-selection-detail-check-20261017.md`所列“通用Agent裸组内flip未保存”缺口已由本片真实宿主修复并验证，不能继续视为当前限制。

根会话负责宽屏/420px浏览器视觉、实际下载闭环与最终build；本checker不冒报浏览器实测。模型未配置，用户已选择代码与浏览器验收，Desktop由用户自行验收；本片不声称真实模型或Desktop通过。总体任务仍in_progress，没有提交/暂存/归档。
