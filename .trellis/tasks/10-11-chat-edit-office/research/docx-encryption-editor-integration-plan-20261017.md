# E1U：加密DOCX的打开、密码意图及保存出口

2026-10-17 root。E0真实互通已证明，但独立XML检查有7红，修复复查后才实施。P UI正在占用docx.ts/DocxEditor，E1U须其冻结/独立后接手。

## 边界

沿docx-encryption-privacy-followup与browser-library-review，固定GenOffice480548fd55f1be3593ee0d8e316a734751d58309的cipher当前密码/下一保存意图分离、成功native写后推进身份；本地浏览器需要额外Worker取消/sourceepoch。WeKnora沿同日缓存v0.8.3/3e22822c1d2397be730c458c7539d0eb8c113a24和已有哈希证据，只作为KB能力门控参考，不冒称其实现了浏览器加密。

现有DocxEditor `useParsed(source.bytes,openDocx)`对CFB统一拒绝；W1修改密码和W2限制密码是另一种工具。新开密码UI不能把这些密码混称“文档密码”。`useSource`基线仍是加载字节，不能拿解密plain替换源并在io层误上传plain。P新增own-candidate ACK/scrubfloor/save-IO lock，E1U应组合同一候选生命周期，不另立并行保存出口。

## 最小集成

1. source-bind私有打开状态，在解析前通过E0真实CFB读取器区分plain/encrypted/坏或不支持；加密原件展示具名打开密码面板、标准显隐、错误与busy取消。成功Workerdecrypt后验证实际DOCX，再建native session。已读密码只在私有session closure/controller，输入字段提交后清空；不进PM/options/Agent/context/API/URL/localStorage/日志。切源/关闭dispose并终止worker，A→B→A不复活。
2. cipher原始整件、plainZIP基底与PM原始模型分离。正文/附加参数不变且当前加密意图未变→返回原cipher整字节；实际native save先完成P/W/T等所有原生校验，再在Worker加密，失败/取消零io。导出与保存都必须使用当前密码意图，一切异步完成复核source/session/version/保护/Pfloor/意图身份。解密原生ZIP非目标entry精确。
3. 打开密码设置Inspector320px，显示当前加密状态和“只在本地处理；加密保存后库不索引正文”的准确提示。新设/更改两次输入，移除单独显式意图；原件加密时更改/移除需当前已成功打开会话，不额外把密码发server验证。取消清草稿/终止worker，不影响已应用意图。
4. 可撤销设置只在PM根属性存opaque token，私有有界映射保存secret；不允许React外置第二套文档history。返回旧token是显式Undo设置。新原件/关闭清整个映射；设合理数量上限并准确提示。未知/伪造token拒绝。root属性只作精确投影，不松正文/W1/W2/T验证。
5. library io成功才ACK persisted cipher/key身份；新意图在旧保存期间保留dirty，只有实际io成功才推进当次持久化密码。当前session未改内容的再次save/export按真实当前意图/最近cipher处理，不不断随机重加密制造dirty；导出和failedIO不推进库状态。P scrub floor ACK必须保留，即使正文版本已变。候选有界/不可跨session伪造，不保留无限大bytes；释放inflight身份。
6. Agent本地写仍复用活PM与save；不自动发plain给provider。当前账号未配模型，只测试本地handle/门控，不宣称真实Agent服务执行。原件保护和打开加密是独立状态，设置入口的禁用理由精确。
7. 代码所有权：私有encrypted session adapter/hook/new controls及CSS/tests，docx.ts/DocxEditor最小接缝与root attribute。不动E0密码算法、server/index、Pscanner、vendor。server E1S独立通过前不能把cipher保存与KB安全闭环标完成。

## 必须证据

真实外部Standard/Agilefixture打开、错误密码、取消/超时/切源；实际Editor文本编辑save/export→独立工具可解且原生target外精确；未改返回原cipher；新设/改/移除+UndoRedo只opaquehistory、两次save、旧IO/newintent、failedIO、导出不ACK、secret不出API/context。整Worker最新Webbuild与真实浏览器必验。

浏览器新密码属于credential change，按CUA要求先完成具体可运行界面/代码/native fixture及只读打开，再在页面上请求用户接手填写、确认、提交；不能提前索取抽象授权，也不能由agent通过browser输入新密码。已知fixture旧密码用于打开可直接测试。最终1280/420截图/内部滚动/固定primary/Escape/回焦。正式独立checker后合并总门禁。
