# XLSX R2：复制/剪切相交结构迁移

2026-10-17 root，正式补齐计划；未实施，不以R1/S绿灯替代。

## 固定源与实际证据

GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`。`apps/sheets/src/renderer/ribbon-actions.ts:317–340`真实调用Univer普通/特殊粘贴；`save-actions.ts:130–170,350–365`收集structuralOps/hyperlinkEdits/cfStates/dvStates/noteStates；`app-constants.ts:82`和`App.tsx:1950–1990,2116,2207`观察merge、CF、DV、note变更写journal。`edit-journal.ts`保存这些身份。`clipboard-anchor-tile.ts:92+`内部copy允许平铺，cut不平铺。

其实际package-lock固定Univer0.25.1。已从官方npm下载并读取tarball（未加入项目依赖），目录 `/tmp/mimir-univer-r2-review-20261017`：

- sheets-ui `lib/es/index.js:10957–11020` 默认copy依次复制值/样式并clear+set merge，CUT转getMoveRangeCommandMutations；`:11238–11324`复制真实span，清除目的相交merge后新增，具有原子undo/redo。特殊format也包含merge，不是仅scalar格式。
- sheets-conditional-formatting-ui同文件`:3628–3830`注册clipboard hook；实际收集每格规则身份，剔除目的覆盖格、复制规则区域，跨表cut还删除源覆盖；同表cut交范围移动拦截。此实现在内存逐格展开，Mimir不能原样复制到整列规则上。
- sheets-data-validation-ui同文件`:929–1080`真实collect/generate mutations；普通copy/cut调整规则矩阵，特殊paste有准确不同语义，跨表克隆规则身份并在cut清源。不能根据“按钮存在”推定规则已保留。
- sheets-note-ui无clipboard hook，sheets-note core有sheetInterceptor hook；本次尚未证明普通copy批注迁移全链，须进一步沿core interceptor与GenOffice native journal验证，不能写成已实现证据。
- 不把上游可能重建OOXML的做法变成本项目无关entry可变许可；Mimir原生保真仍需独立验证。

WeKnora官网/公开源沿本日缓存 v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24`，官网SHA `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe` / definitions SHA `3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0`。实际复核缓存，不声称本次联网；KB/Agent能力门控相关，Office范围/OOXML语义以GenOffice/Office为主。

## R2a：普通完全包含merge/hyperlink

最小缺口是范围copy/move仅搬rawcell，R1安全拒绝相交结构；应同时迁移普通明确结构。实际所有权在server原生范围执行器，不在按钮。新私有结构迁移helper + xlsx-range-features最小可证明许可 + xlsx-agent-range/manual-ops调用 + native/host tests；不动S排序内核/DV确认controller/公开DSL词表/vendor。

1. 读实际namespace/关系，所有候选在patch前验证；源/目的仅完全包含标准merge/hyperlink时支持。部分覆盖merge明确拒绝；源裁切range hyperlink需另片矩形差算法，不能删整条而损失区外格。未知属性/扩展、坏关系、duplicate/重叠merge拒绝，不忽略。
2. copy保留源并平移复制merge/link；move从源移除并放置目的（同表重叠用冻结快照一次规划，不顺序覆盖）。普通paste覆盖目的完全包含merge/link；目的部分相交拒绝。所有新merge不得重叠且需锚定目标范围；被覆盖原cell遵守既有明确粘贴模式。
3. 外部hyperlink只迁移Relationship数据，不发网络；copy同表复用已知关系，跨表分配无冲突rId及关系项。内部location绝对目标按Office普通链接语义保留，不擅自当公式平移；相对工作表地址须实际证明后再支持。只删证明无其他引用的旧关系，或明确保留合法未引用关系；不能让旧link节点指错关系。relationship Target/Mode/未知字段保真，拒绝TargetMode与scheme歧义。
4. 特殊粘贴值/公式/格式需逐一指定：值/公式不迁移结构；格式合并语义按固定上游，链接不因格式粘贴意外复制。filter/平铺/跳过空格先维持准确拒绝结构，普通单矩形先闭合，不用静默降级。
5. R1表/透视/CF/DV/comments/扩展/保护守卫保持；copy只读保护源，move所有实际写表受保护检查。2000格预算保留。公式/样式/富文本/日期系统现有原生合同不能退化。
6. patch后重新读native结构、每个关系与受影响cell；allowed entries精确包括源/目的sheet及实际关系文件，不得把全ZIP加入允许清单。失败零发布，noop身份保留，一次history/版本。

先红后绿native含同/跨表、重叠move、目的覆盖、部分拒绝、关系冲突/坏关系、带自定义namespace/属性、未目标entries逐字节保留；实际Editor单history/保存UndoRedo/过期响应；root最终浏览器普通选择复制剪切与重开。正式independent check后再释放R2b。

## R2b：CF/DV和批注独立片

规则区域需要有界矩形交/差/平移/归并，不能遍历整列。每条规则可有多rect；目标覆盖与源cut保留区外子区，首sqrefanchor变化要重锚相对/混合公式及CFVO@val，跨表语义明确。CF全局priority、stopIfTrue、dxf与规则顺序保留；DV规则和文字提示/隐藏下拉/错误语义保留，不伪造通用忽略许可。后置校验使用迁移后的实际规则，不能仅验证旧目标规则。

批注需要真实comments authorId映射、VML note形状的ClientData Row/Column和Anchor、跨表关系和content types，不能只搬comments XML。未知VML形状/控件/共享关系保留或拒绝，不能删除整VML。先进一步固定源研究并单独计划，不混入R2a。图/表/透视/数组等其余结构的能力保持准确说明；本计划不计这些全部支持。

## 批注引用链补查（同日 root）

另从官方 npm 取得 `@univerjs/sheets@0.25.1` tarball，仅解压研究，未加入项目依赖。`lib/es/index.js:5086–5173` 的 move-range command 真实取得 interceptor mutations；`:7230–7267,7777–7797` 的 common ref-range helper 对源包含目标执行位置平移。`sheets-note/lib/es/index.js:643–800` 将每条 note 注册为单格 ref-range，并产生 `sheet.mutation.update-note-position` 或 remove mutation；`:249–265` 真实改变 note model 的 row/col。因此能证明内存移动引用链，不能据此证明普通复制或跨表原生保存已闭合。

固定 GenOffice `app-constants.ts:161–163` 的 `NOTE_MUTATIONS` 仅含 update-note/remove-note，注释明确排除 position-only；`App.tsx:1987–1988,2112–2122` 仅这些 mutation 置 noteDirty，`edit-journal.ts:294` 为该标记写入点。本次搜索未发现普通 clipboard note copy hook，也未发现位置 mutation 直接标记 noteDirty；仍需实际原生 journal/结构迁移路径及保存样本才能认定支持。R2b 不将“包内能移动 note model”扩写为“固定 GenOffice 普通复制批注已支持”，也不据此移除 Mimir 对含批注范围的保真守卫。

WeKnora 继续沿上文已固定的同日官网/公开源缓存，不宣称本补查重新访问官网。
