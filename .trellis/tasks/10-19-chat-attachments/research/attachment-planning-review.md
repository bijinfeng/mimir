# Research: 聊天附件规划一致性复核

- Query: 只读复核子任务prd/design/implement与父任务R11、既有源码研究和官方默认UI合同的一致性；检查限额、默认问题和生命周期的待审标记。
- Scope: internal / external evidence review；不修改产品、spec、任务方案或原型。
- Date: 2026-10-19

## Findings

### 结论

三文档与父任务R11整体一致，可作为新版HTML规划依据，未把规划当作已实现或已获具体审批。初次发现的无文字混合附件策略及AG-UI身份/图片URL问题，主会话已在PRD A6与design数据链第5项补充，本复核重新读取确认。仍需在具体HTML中落实所有拟定政策和宿主原件读取/失效说明，不以本文视为产品验收通过。

### Files found / 逐项核对

| 文件与锚点 | 观察/判定 |
| --- | --- |
| `../prd.md:5,22,33` | 本轮只规划和HTML，格式、数字、寿命、默认问题待具体新版审批；用户授权的是纳入附件规划，不重复问是否支持。符合。 |
| `../prd.md:11–12`、`../design.md:5,13` | 完整官方Thread/Attachment原件与默认CSS，不自定义tile/renderer/重试；宿主说明在Thread外。符合父R9–R11。 |
| `../prd.md:13–14` | UTF-8文本/MD/常见纯文本、Office提取和PDF文字层、三种静态图格式；4件/20MiB、文档10MiB、图片5MiB/4096/16MP、12000/24000字符、实际窗口、200MiB。数字均保留拟定标记，不暗称现行能力。 |
| `../prd.md:15–16` | 无KB命中可依据附件问答；实际chat/reasoning模型视觉检查；仅检索+附件阻止且保稿。无文字含任一文档（含混合）默认“请概括附件内容”，纯图片默认“请描述并分析这些图片”，不伪称用户键入，待审。符合。 |
| `../prd.md:17–20`、`../design.md:24,28` | 草稿24h、失败/中断1h、有界lease、已发随会话、刷新/追问、删会话幂等对象清理；保稿不覆盖新输入。符合研究方向，但失败1h适用对象需保持下文优先级。 |
| `../design.md:9–14` | ensureConversation共享promise、独立资源/关联双数据库、隔离对象key、纯parser、不复用KB uploadFile、真实服务器核验与canonical ID。符合源码事实。 |
| `../design.md:18–24` | 不止删除IMAGE_AGENT_REQUIRED；补无引用模型支路、系统提示、真实多模态、历史；保留唯一模型usage与Agent桥/截图守卫。符合。 |
| `../implement.md:6–8,12–24` | 新附件场景不冒充71/379旧来源状态；认可后实施、队列前冻结、双DB/真实HTTP/时钟/模型stub/GUI与全仓门。未用fixture代替产品通过。 |
| 父 `10-18-interaction-chat/prd.md:23,40` | R11/AC8已包含上传准备发送移除失败取消重试、格式/限额/排队/历史/寿命和独立子任务；不永久KB导入，具体HTML审批。子任务无扩展到OCR/音频/编辑/新Agent权限。 |

### 默认官方 UI 的实际限制及纠正

固定源 `a587b2838f2d644549d216098d54cfbeedfac522` 的 `packages/ui/src/components/react/assistant-ui/elements/attachment.aui.tsx:118–236`：上传spinner、失败图标/tooltip、composer移除；有src才是可预览按钮。`packages/ui/src/hooks/use-attachment-src.ts:31–46` 仅对type=image取File/objectURL或image part。**Document/file默认tile没有点击下载动作，也没有文档预览。** 它是FileText图标、名称tooltip和focusable group。Image有默认预览；没有业务重试、阶段详情、数字进度、过期tile。原件读取/下载与缺失说明应由Thread外宿主明确提供，不可往官方tile添加按钮或假称默认已具备。

纠正父研究 `chat-attachment-planning.md` 生命周期表“官方文档tile…仅下载”的措辞：应为“默认文档tile不提供下载；由宿主提供已授权原件读取/下载”。本次不越权修改原研究，只在本复核留明确纠正并已通知主会话。子任务三文档目前没有直接声称官方文档tile可下载，但AA5/AA7的历史可读应落到真实宿主入口。

另需真实呈现：附件选择前拒绝可能只有attachmentAddError事件，不会自动生成error tile；错误详情宿主解释。原件缺失不应让官方image预览空白冒充可读，须在宿主显示失效并守卫读取；不修改官方UI造tombstone卡片。

### 本轮隔离实测补充

已执行已安装AGUI0.0.68/core0.3.27真实compiled转换函数的七个fixture，完整结果落父 `research/chat-attachment-adapter-roundtrip.md`。不证明HTTP/provider。

- 文档file+sourceType:url的相对与绝对路径可往返；图片image part的相对/api路径被误当base64，必须规范化绝对同源HTTP(S)URL。
- file image+sourceType:url相对地址初次可过，from恢复image part后再次to会退为data，不能依赖这一绕路。
- from生成attachment.id序号，不能作为服务端身份；serverAttachmentId/runConfig独立保存并由服务器核验。providerMetadata.agui可携带字段但不赋予信任。
- text attachment变成问题字符串且失去附件tile/身份，正式资源ref不应替换成客户端text；fixture可明确只作本地示范。
- design第5项已写入上述风险；真实HTTP/queue/历史/模型仍列后续验收。

### 生命周期/预算细节（实现与具体HTML必须保持）

1. `失败/中断1h`应仅指**未绑定已发消息、且无队列/run lease**的失败准备/孤儿草稿；已绑定附件即使该回答失败/停止仍按会话保留。已发保留和独立引用优先，不能1h GC误删可重试的用户历史。三文档虽已写有界lease/已发共存，实施时需明确此优先级并测试。
2. 12000/24000是拟定正文字符预算，不等同模型token预算，更不涵盖视觉token成本；实际选中模型的剩余窗口仍需核验KB/历史/系统和图片。无静默截断；多轮引用也受本轮预算，不把完整会话所有附件无限拼入。
3. 两件并行、30秒是待验证的准备预算；parser没有AbortSignal，取消revision只能让结果失效，硬CPU终止须隔离。当前设计无夸大。
4. PNG专用截图与通用附件混合时，既有更严截图1张/5MiB/1280×1920、来源页/版本/寿命/视觉/Agent执行守卫不被通用4件/4096覆盖。子任务A8已保留原则，实施真实HTTP测试需覆盖。

### External references / Related specs

本次核查继续采用父研究已重新验证的官网 https://weknora.weixin.qq.com/ 与固定公开源 https://github.com/Tencent/WeKnora ：v0.8.3，commit `2c0d8384398ca756ee414eef01b71caf91e2caa6`。`frontend/src/api/chat/temporary-attachments.ts:7,17,25–56`的session_id/expiry/会话内上传读取删除、`internal/application/service/temporary_document_prompt.go:45–56`的同会话ready核验支持独立资源和预算方向；其每轮5件、OCR/ASR、worker和chunk选择不作为Mimir现行能力或本轮UI设计。具体HTTP/SHA证据见父研究及vendor-full-thread/weknora-reference-recheck.json。

相关规范：`.trellis/workflow.md`规划审批边界；`.trellis/spec/chat/frontend/conventions.md`、`pitfalls.md`的真实runtime/历史、队列/截图/中断桥；`.trellis/spec/server/backend/auth.md`受保护资源；parser/storage规范的纯提取/统一storage。当前chat spec部分旧自绘/主题条款与用户完整官方Thread新要求不同，以本轮明确用户要求及父R9/R10为准，实施后规范需同步。

## Caveats / Not Found

- 这是规划一致性复核，不是代码验收、产品能力证明或用户具体新版认可。没有修改产品/规格/任务元数据/方案/旧原型，没有运行git操作。
- 官方UI能力缺口须诚实放在宿主；附件转换纯函数通过不代表真实上传、鉴权、媒体读取、队列、数据库历史和provider通过。
- 本次仅写本子任务的本研究及父任务指定的roundtrip研究文件。
