# PPTX 真实字符范围编辑与源 XML 保真

日期：2026-10-17。范围：本地手动文字编辑。根会话负责 PptxEditor 集成、完整历史和真实浏览器；此文不将组件验证写成实机结果。

## 固定参考证据

- GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`，本轮 `git -C /tmp/mimir-genoffice-html-git rev-parse HEAD` 再核一致。
- `apps/slides/src/renderer/TextEditOverlay.tsx`：内容可编辑覆盖层使用 DOM 原生选择；485–555 行通过 `data-src-run` 追溯模型 run；1077 起 `extractParagraphs` 保存源段落、源 run、软换行和当前格式。`components/Ribbon.tsx:1581` 明确通过 mousedown/preventDefault 保住文字选择。Mimir 保持原 SVG 渲染器，改用同一文本框的 antd 多行输入提供可跨段的真实浏览器字符选择，并按原生范围即时提交；数字索引表单不作为交互。
- `packages/pptx-ops/src/edit-text.ts:78` 的 `applyEditParagraphs` 仅凭 `srcPara/srcRun` 可保留模型属性，但新拆 run 导致 `packages/pptx-engine/src/generate.ts` 退至 `rebuildTxBody`，未建模 rPr/pPr 会丢失，field GUID 会重新生成。单纯在 UI 切字符串不足以保持原件。
- WeKnora v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24`，本轮复核已有固定源码 `/tmp/mimir-pptx-weknora-definitions.go`，定义的是 `search_knowledge/read_document/list_documents` 及受控工具发现/工作区工具，没有 PPTX 字符范围或 Office Ribbon 合同。它适用于知识与 Agent 服务分层，不能作为文字编辑工具栏原型。站点 `curl -I -L --max-time 10 https://weknora.weixin.qq.com/` 本次 0 字节超时，不记为访问成功。

## 实现边界和接口

- `src/pptx-text-range.ts`：UTF16 范围（与浏览器 selectionStart/End 一致）、代理项边界保护、范围/光标当前 run、原生多段范围格式和局部输入 delta。普通 run 按源拆分；格式不变时不拆分、不 dirty；软换行不参加字形当前态。
- `formatPptxTextRange(paragraphs, selection|null, format|fn)`：null 是整框，非空范围只格式所选字符。活域按一个不可拆的单位格式化，防止多份相同语义域；未改域保留原 GUID。collapsed 格式由 Editor 的 pending marks 处理，不制造空编辑。
- `editPptxTextValue(paragraphs,nextValue,pendingFormat?,softBreak?,previousSelection?,inputType?)`：只替换实际变动区。真实输入前选区能区分重复字符中间插入与段尾插入；删除支持 Backspace/Delete。跨 run/段替换保留两侧 source；整段重写沿原 dominant 普通正文 run 的语义，普通替换取实际起点 run。新字不继承 live field 身份；Shift+Enter 保留为 a:br，Enter 新建语义段。
- 输出 EditParagraph[] 与 WeakMap 元信息按对象身份绑定。元信息只存该次编辑的来源，不出网络、不序列化、不用全局源索引。
- `PptxSession.setText` 新增唯一可选分支：确认源段落对象仍为当前对象后，在 clone 上先物化旧 pending 状态；以原 XML 的直系 a:p、a:r、a:fld、a:br 定位来源，复用原生 patch 原语外科修改每个 run，并保留原 pPr、endParaRPr、未知扩展、链接关系和 field GUID。完整准备成功后一次发布模型与工作 anchor，并用现有 slide.structureDirty 跟踪工作字节；现有 checkpoint、save、commit 路径不变。无范围元信息的 setText 调用维持原路径。不修改 vendor 或通用 writer。
- `PptxTextRangeEditor`：单个 antd TextArea，鼠标/键盘可跨段选择，每次普通 input 即时提交；IME 缓冲至 compositionend，期间文档/版本改变则丢弃。选择回传 `PptxTextSelectionEvent {targetKey,version,selection}`，应用按钮取得焦点后保留原 native range，恢复范围不抢焦。Escape 清字符范围，返回整框范围。可见标签表达整框、所选字符或插入点；样式沿现有主题和小尺寸控件。
- 源内容是不可编辑的数学 AlternateContent 时，未知 XML 保留；局部改写其纯文本 fallback 明确拒绝，不能把公式静默扁平化。此切片没有声称增加数学公式编辑。

## 验证结果

- 新 `pptx-text-range.test.ts` 9 项：原生混合字号/字形、未知 rPr 与 pPr、链接与原关系、带属性 a:br、动态域 GUID；字符拆分、多段格式、跨段替换、两个保存、重开、checkpoint undo/redo、未改 ZIP 条目字节、空段再次打字、重复文本真实 caret、stale 原子拒绝、no-op、emoji UTF16 边界。
- 新 `PptxTextRangeEditor.test.tsx` 5 项：真实跨段 selection、工具栏取焦后保留范围且不抢焦、即时 input 与 pending marks、IME 完成/过期、Escape 分层、禁用时不发布迟到输入。两文件 14/14 通过。
- 原 `PptxEditor.test.tsx` 文字与控件回归按单个完整文本框更新，保留其他段内容；标准源 run 插字、软换行后插字、部分替换/整段重写继承、整框字形均通过。最后整文件运行 72 项中 71 过，剩余动画宿主 version 错误由根会话维护（该条不属文字实现），不能记整文件全绿。
- 定向 Oxlint、Oxfmt、antd lint、git diff --check：通过。Office tsc 最终通过（`/tmp/mimir-pptx-rich-range-final-tsc.log`）；期间并行动画测试和本片测试中的可空索引均已修正。最终整包门禁由根会话冻结后重跑。
- 实际浏览器宽/420、选择格式后下载原件与编辑器快捷撤销由根会话接续。没有模型供应商，不把手动验证当真实 Agent 模型调用验证。整体所有编辑器工具补全目标仍未完成。
