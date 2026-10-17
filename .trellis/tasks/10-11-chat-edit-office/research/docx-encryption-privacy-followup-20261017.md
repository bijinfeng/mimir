# DOCX 打开密码与个人信息清理后续边界

2026-10-17，root。仅为已批准全工具范围的后续设计证据，不是实现或通过记录。W1/W2/强制修订仍按独立计划串行执行。

## 固定参考与当前接缝

- 主参照固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`，实际读取 `/tmp/mimir-genoffice-html-git/apps/docs/src/main/docx-encryption.ts`。上游 `officecrypto-tool` 解Standard/Agile、写Agile；当前磁盘密码与下次保存意图分开，成功原子写后才提交密码状态；恢复副本不得意外保存明文。它运行于Electron主进程，不能直接照搬到浏览器主线程。
- 实际读取 `packages/docx-engine/src/patch.ts:1743–1960`。`removePersonalInfo`还执行最终ZIP清理：WordprocessingML author/initials→Author/A，core creator/lastModifiedBy清空，app Manager/Company清空，people person节点移除；customXml、自定义属性和二进制不动。仅保存settings flag不等于此功能。
- Mimir `packages/office/src/docx.ts::openDocx`当前仅检测CFB magic并拒绝，尚无解密入口；`DocxSession.originalBytes`用于native补丁基底。`DocxEditor`的手动保存/当前副本导出均调用session.save，Agent在本地PM工作；不能只替其中一个出口。
- `OfficeSourceEditor`经EditorIo→`PUT /api/documents/:id/file`，`replaceUpload`会对上传字节提取正文再持久化body/excerpt/searchText；原件写storage且旧source删除。加密时必须明确处理旧正文、旧chunk/embedding/检索快照，不能让此前明文索引继续泄露。当前路径并无加密私有会话合同，需独立实现，不把CFB魔数等同可靠格式解析。
- 按AGENTS核对WeKnora官网/公开源码既有同日固定缓存：v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24`；官网与definitions SHA256分别`6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe` / `3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0`。复用证据，不声称重新联网。其KB/受能力约束工具可借鉴；没有拿Markdown编辑器或知识工具代替Office密码/元数据语义。

## E：整文件加密实施前必须闭合的合同

1. 浏览器专用可终止worker，真实CFB目录/EncryptionInfo解析、Standard/Agile scheme及参数/字节/spin/时间/内存预算先校验。不能仅在文件里搜EncryptedPackage文本；错误密码与不支持/损坏清楚区分。复用维护良好registry库前审查浏览器依赖与官方版本；当前lock无officecrypto包，不先猜接口或引入Node shim。
2. Cipher原件与解密后的ZIP补丁基底分离。密码只留当前文档私有内存；切文档/关闭/超时取消终止worker并清理引用。不得发往Agent/API/日志/URL/浏览器存储。每个await后核对session/source/epoch/意图身份；旧解密或加密结果不得覆盖新文档/新密码意图。
3. 未改内容且未改密码返回原始cipher整字节；修改正文后的save/export先生成私有plain candidate，再加密成功后才交EditorIo。失败/取消零发布零history；不能先上传plain后补cipher。Undo/Redo保持内容与加密设置的明确身份，密码明文不进history。
4. 原件加密保存至KB时只传cipher，明确显示暂不索引加密正文；原有提取正文/chunk/embedding等需同一发布事务清除/失效，并验证重建、检索、备份、恢复不重现旧明文。Agent本地编辑可沿现有PM，但真实调用会发送所选文档内容，应沿已有用户显式对话授权，不新增后台自动提取/模型调用。
5. 新设/更改/移除打开密码是显式设置意图，保持原密码可解当前持久化cipher，只有成功保存才推进persisted state；保存期间新意图留到下一次。内存清理不代表可保证JS堆立刻物理擦除，不写不成立保证。
6. 320px Inspector、当前加密状态、标准密码显示切换、busy取消、错误及固定主动作。浏览器真实新设/改密码时，按CUA工具规则由用户接手输入/确认/提交；代码、native fixture、错误密码和只读打开验证先完成，不提前索取不具体批准。

验收需独立加密fixture与第三方可解证明、真实wrong-password、预算/取消/乱序、两次save/export/重开、cipher零明文持久化与KB旧索引清除、目标外ZIP内容解密后精确、两种viewport及完整独立check。上游加密存在不等于目前已齐。

## P：个人信息清理

由W2之后独立小片做最终package处理，避免vendor修改。使用本项目有界XML解析和namespace-aware最小span patch，不能照搬上游跨作用域prefix正则而误清扩展命名空间。覆盖document/headers/footers/notes/comments/glossary与people，core/app须从实际关系定位，保留custom/binary/正文/日期/未知属性，明确文案不承诺清除正文里的所有个人信息。

开启标记后每次实际保存都执行清理；原件已开启但仍有可识别metadata时，no-op保存是否需要触发清理必须与固定上游一致，并在dirty/导出合同中明确。失败原子拒绝，不能返回部分清理结果。按comments/forms限制决定设置是否可变，不利用privacy路径绕过保护策略。准确allowed-entry集合与namespace重绑定/自定义位置/CDATA/注释/恶意XML/budget原生fixture是必要验证。

不把本设计计为完成，不混入W1代码所有权。最终选库/具体CFB能力与KB索引事务尚待实施前完整审查。
