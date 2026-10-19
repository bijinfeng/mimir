# 完整官方渲染映射：上下文入口

完整逐状态证据在[full-official-feature-mapping.md](full-official-feature-mapping.md)，本文件作为自动上下文入口避免大文件注入截断。实施/检查对应切片时须读完整报告对应行、chat-package-inventory.json和chat-host-inventory.json，不能只读本摘要。

2026-10-19：71组379来源状态逐项唯一分类，无重复/遗漏：official 71、host-external 179、boundary 122、removed 7。这是规划责任映射，不是GUI实测数。新增标准附件ATT场景独立计算。

- 官方：直接完整未改Thread及25份运行闭包和默认CSS；不传components，不注册part/data/tool UI，不改字体/主题变量/selector。正文/真实reasoning/tool/image/file、输入/等待/错误/动作使用原件。
- 宿主外部：引用来源/定位、模型绑定/范围/强度、保存笔记、显式队列/取回、分类失败恢复、Agent中断/截图守卫及导航生命周期；不能在宿主另画消息流。
- 删除：CHAT-016七个自定义检索trace状态；其余含trace场景的proposed也不再消费它。旧库兼容，不映射假reasoning/tool。
- 边界：原生IME/读屏/剪贴板/权限/文件媒体、真实HTTP/Agent写原件、队列冻结、历史持久化与模型输入。不能靠fixture宣称产品已验收。

必须正视的默认差异：英文文案保持；Copy/Export只按非running非空正文，失败/停止正文也可能出现，保存笔记仍由宿主只取最后成功非空；官方代码复制失败静默，不自造toast/fallback。Reload只有真实安全adapter才提供，Agent/snapshot不得无差别重跑，缓存结果只能resume。默认Thread没有source/legacy audio专用case；source在外部，真实audio可等价归一为官方file媒体，缺payload来源保留边界。未接分支/编辑/语音/反馈不能假回调。

两个具体实施依赖：1）现有AGUI .0.68未暴露queue注入，onNew与composer send事件均晚于enqueue，已用公开runtime facade在产品SDK与新SDK各4项最小探针验证同步冻结接缝；详见agui-official-thread-pre-send-seam.md，完整Thread/产品联调仍需实施验收。2）完整Thread的+不会因无adapter消失，用户已同意独立10-19-chat-attachments规划，禁止用KB永久上传代替；附件资源、上下文、历史、生命周期需真实完成后产品切换。研究中的“附件范围待决”已由用户明确纳入规划，具体政策随v3审批。

固定来源assistant-ui a587b2838f2d644549d216098d54cfbeedfac522，React0.15.29/core0.3.29；产品0.15.28/core0.3.27/react-ag-ui0.0.68本地中断补丁不得丢。WeKnora网站v0.8.3与源2c0d838按同日证据只参考KB/Agent合同，不作为自绘UI模板。详细hash/许可/行锚点见完整报告及vendor-full-thread。
