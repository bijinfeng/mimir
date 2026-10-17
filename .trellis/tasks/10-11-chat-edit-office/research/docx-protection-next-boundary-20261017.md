# DOCX 原生保护后继边界（只读研究）

2026-10-17。本文件只记录下一片需解决的真实保护合同，未授权实现者在未完成设计时加假开关。

## 固定来源与适用性

GenOffice主参考 `480548fd55f1be3593ee0d8e316a734751d58309`，本地 `/tmp/mimir-genoffice-html-git`。`components/ProtectDialog.tsx` 1–160区分打开密码（整文件加密）、写入密码（honor-system）、四类编辑限制和移除个人信息；`App.tsx`1569–1617对readOnly/forms/comments禁正文、允许comments批注/forms复选框、强制trackedChanges；1956–1992将设置与加密IPC分开。不能把这些不同功能合成一个session只读开关称原生保护。

实际vendor `packages/office/vendor/packages/docx-engine/src/types.ts`2035–2065有DocProtection与WriteProtection；`patch.ts`206、1190、1708支持SaveOptions.protection，undefined不改、null移除、对象写原生settings。`protection.ts`提供SHA512 hash/verify、100000默认轮/1000000上限；此模块是Word编辑限制密码，不是整文件加密。未知算法和无法验证的凭据必须保留、不能强制清除。

WeKnora官网和源码沿本任务HTTP200证据 `/tmp/mimir-group-flip-weknora-site.html`、`/tmp/mimir-group-flip-weknora-definitions.go`，版本v0.8.3/commit `3e22822c1d2397be730c458c7539d0eb8c113a24`。文件工具与wiki能力范围门控有助于Mimir权限表，未提供DOCX保护/密码或Office UI，不能作为本功能主参考。

## 当前确定缺口

Mimir `docx.ts`解析session持有parsed但没有公开保护策略；`DocxEditor`默认editable:true，阅读只读不等于原生限制。`createDocxAgentHandle`的beforeWrite目前不检查原件protection/writeProtection，许多附加结构写入不经过正文editable。只在Ribbon禁按钮无法覆盖Agent、命令、表格/文本框子编辑和saveOptions。

## 实施前必须收敛

1. 当前原件保护作为现行事实被读取与执行；不支持/未知类型fail-closed并显示原因，读取/下载/对比可用。完整写权限同时覆盖PM事务、子编辑器、附加saveOptions、Agent直接写/草稿/commit/round恢复及工具栏；原件设置不因打开被移除。
2. 四类restriction逐项权限表：readOnly无正文写，comments仅批注，forms仅真实表单字段/复选框，trackedChanges强制修订且禁止拒绝/接受绕过。若本片不能安全支持某类写，明确只读保留，不能冒称四模式都能编辑。
3. 新设置/改设置/移除原生限制的状态归属、原生保存与history；保护设置为文档状态，不能因视图切换或sourceA→B→A复活临时解锁。密码只在局部受控输入/内存核验，不能进Agent prompt、日志或持久状态；错误/超预算hash须保留设置。异步核验冻结源/版本/身份并可取消。
4. 已有带密码限制需核验后才允许改/移除，未知算法/坏字段明确拒绝；不能用无hash覆盖坏hash。修改密码和开文件加密要另有完整原生算法与两端保存合同，不能用明文ZIP冒充加密DOCX。
5. UI复用Review具名320px Inspector，显示当前原件模式/是否生效、允许操作和明确密码状态，分步启用/停止，避免四套密码字段堆满。420/固定动作/最近层Escape/折叠菜单关闭同既有合同。密码实际浏览器输入由用户完成，不要求聊天提供密码。
6. 实施测试须真实protected DOCX、普通保存原件setting精确保留、正文/批注/checkbox/forcedrevisions、Agent所有写分支及round/draft、错误密码/未知hash、取消/切源、单次save与reopen。不能只断言contenteditable=false。

下一实现者应先提交具体权限表与最小文件所有权方案，root批准后实施。当前compare/split仍独占DocxEditor，保护不并改该文件。此研究没有新增生产代码或验收主张。
