# PPTX逐页生成真实Editor受控浏览器验收

2026-10-17 root，CUA IAB tab35，1280×800及420×500。临时5186直接导入实际PptxEditor/handle/hook/Inspector/renderer/native save/history，host从Node原生预制且已reopen校验checkpoint返回。第三页通过具名测试控制明确等待/失败/放行。不是provider或完整服务器实时模型验收；服务端/HTTP流/协议另有独立测试。无KB写入。

## 已实测

1. replace生成两页、第三页等待，原画布仍原一页、dirtyfalse、save/Undo/Redo disabled；Inspector显示2/3和完整页预览，可前后切页。停止后显示缺1页，原稿仍未改。明确保留后一次发布version1/dirtytrue/pages2/stoppedtrue，只有1个Undo。
2. append两页后第三页真实受控失败，Inspector准确错误与未完成1页。明确保留后结果pages2、failedPages1/notGenerated0，原稿加2页共3页。
3. 两路径均保存、Undo保存、Redo保存下载；Python独立比较每个非目录ZIP entry，Undo准确还原原件、Redo准确还原应用。append原始slide XML逐字节未变。重开partial saved为2页、dirty/history全清。
4. Escape丢弃草稿返回okfalse/changedfalse/version0、dirtyfalse、原一页、save/history禁用，无候选发布。首次发现busy按钮先blur导致focusbody，已退checker修复；后续最终回焦复验见下文（未提前通过）。
5. 完整三页一次发布version1；保存、单Undo、单Redo均导出验证，每native entry一致；保存后重新打开3页、dirtyfalse/historydisabled。
6. 420面板width320/top200/bottom443，内部滚动，固定唯一保留primary始终可见。1280与420已保存并实际查看截图`pptx-deck-partial-{1280,420}-20261017.png`。当前受控harness额外操作条不是产品页面，不作为产品Ribbon新增控件。

工件`/tmp/mimir-deck-browser-{replace-stop-keep,replace-stop-undo,replace-stop-redo,append-failure-keep,append-failure-undo,append-failure-redo,replace-complete,replace-complete-undo,replace-complete-redo}-20261017.pptx`。PPTX serializer可能重打包ZIP时间/目录，比较原生entry，不声称整压缩包SHA一致。

## 临时验收页历史加载问题

首次harness React裸CJS错误、Node-only engine index在浏览器crypto错误、整ZIP envelope误判baseline，均仅/tmp harness修正。最终使用真实预制native checkpoint与PptxArchive逐entry基线核验，未改生产或去除Editor来源守卫。


## 最终回焦和真实产品主题复验通过

最后focus修复显式绑定同一PptxEditor.canvasRef；真实浏览器入口先disabled/blur后生成→Escape丢弃，工具结果okfalse/changedfalse/version0，下一次只读activeElement是DIV、aria-label“幻灯片对象画布”、tabindex0。旧body失焦失败已结清，独立用户主动移焦不抢焦点回归保留。

临时验收页已复用真实MimirProvider及useEditorThemeVars，删除手写蓝色变量；actual ThemeProvider/locale/AntApp/GlobalStyles/appearance完整栈与产品一致。再次真实生成2页/停止，1280×800与420×500实际截图均已查看：`pptx-deck-final-theme-{1280,420}-20261017.png`。绿色单一保留动作固定可见，420面板宽320/top194.56/bottom448.36，内容内部滚动。最后Escape丢弃并再次确认焦点回同画布，零dirty/history。旧默认蓝色截图仅历史受控功能证据，最终视觉用真实产品主题图。

最新生产build `/tmp/mimir-all-tools-final-web2-20261017.log` exit0，包含最终focus和DOCX导出归属修复；实际产品tab32reload后两类CDATA文字仍准确、save/Undo禁用。完整质量门另见final-quality-check-20261017.md，不以这些烟测替代全门。
