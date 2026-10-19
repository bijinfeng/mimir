# v7 产品实施独立复核

2026-10-19。范围：主任务 `10-18-interaction-chat` 与附件子任务 `10-19-chat-attachments` 的未提交实现。依据最终 `implementation-review-v7.md`、PRD/design/implement、冻结 v7 及对应现行规范。审核与实现共享工作树；以下状态按实际验证记录，不将原型演示计为产品验收。

## 已核验

- 产品 chat/renderer/server/provider 路径没有 assistant-ui 或 mimir.trace 的运行生产/消费链；旧共享 trace 类型/数据库兼容保留。
- exact SDK：ai 0.69.0、ai-client 0.39.3、ai-react 0.30.4、ai-openai 0.30.0。provider 对兼容网关不套用原生 OpenAI 能力，明确选择与等级经过服务端再次验证。
- 普通聊天使用服务端已落库 canonical ID 选择历史，附件从服务端受保护资源读取真实字节；当前 refs 与历史前缀分别验证，附件不会写入知识库。
- 解析在可终止 worker 内执行，实际图像解码、OOXML 预算及 UTF-8 检查明确；准备超时、停止与服务重启有失败状态。双数据库迁移和生产 worker 构建由附件实现者另行记录。
- 发送意图与独立 FIFO、真实 ID 创建、固定连接 URL、Agent 原目标缓存续传接缝已进行源码复核；多数初轮缺陷已由各所有者修复；最终复核发现的 Agent 历史及所选模型宿主门控已修复并源码复核；测试证据见末轮记录。

## 发现与处置

| 项目 | 证据与影响 | 处置 |
| --- | --- | --- |
| 仅检索受目录状态阻塞 | runtime.capture 在 search 分支仍检查 model loading/error | UI 所有者修复并补回归 |
| 删除附件与租约竞争 | removeFile 立即 DELETE，effect 的 release 可能尚未到达，产生 409 | UI 所有者修复明确释放顺序 |
| 续传 busy 与准备取消 | resume 抛错缺少清理，建会话等待期间取消需要阻止后续发送 | UI 所有者修复并验证 |
| 分支历史与保存回答 | setMessages 后立即读取旧 chatRef；save 取最后落库回答可保存错误分支 | UI 明确前缀；主会话接入 canonical messageId 保存和测试 |
| 分支附件来源 | save-note 按时间收集全会话附件，会标注实际没用过的弃置分支文件 | 附件所有者改成服务端实际 prepared refs 与本回答关联 |
| GC 与续租竞争 | GC 候选读取后无同会话锁内 re-read，可能清除刚续租资源 | 附件所有者串行化 lease/bind/GC，添加 stale-candidate 回归 |
| 文档 Agent 真实 ID 与落库时序 | docx-agent-stream 未回传 canonical ID，且成功 terminal 早于 final append | 主会话协调后端所有者修复 |
| 历史 Agent 泛化重试 | 仅按当前 live Agent 判断 edit/regenerate，主视图重载历史可把旧 Agent 问题发成普通问答 | UI 所有者增加轮次来源门控 |
| 工具失败/停止显示 | SDK 的 output-available 结果可能 ok:false；只判断虚构 error/cancelled state 会错示完成 | UI 所有者按真实结果与消息终态映射 |
| 截图停止恢复 | in-flight 截图停止后只有 stopped notice，无可见取回路径 | UI 所有者保留恢复路径且不覆盖新稿 |
| 准备中附件交互 | 上传结束前仅显示通用说明，尚缺逐件准备/取消状态；并发 drop 可漏计 pending 件数 | UI 所有者对照批准 ATT 状态补齐 |
| TypeScript MIME 歧义 | 原生浏览器可将 .ts 报为 video/mp2t，合法 UTF-8 源码被 MIME 前置拒绝 | 附件所有者核查限定例外与真实二进制拒绝回归 |

侧栏范围：主会话已根据冻结 v7 的实际菜单与 PRD R12 解释为初始当前文档、可切单篇/全部；Agent 执行目标独立守卫，旧 spec 中“锁定”文字由主会话同步，不新增未批准锁定 UI。

## 本审核者实际执行

- `plugins/provider/node_modules/.bin/tsc --noEmit`：通过。
- `packages/chat/node_modules/.bin/tsc --noEmit`：通过（后续修改须再跑）。
- `apps/server/node_modules/.bin/tsc --noEmit`：通过（后续修改须再跑）。
- provider Vitest：2 文件，31/31 通过。
- server `chat-model-selection.test.ts`、`chat-stream.test.ts` 串行运行：2 文件，11/11 通过。
- chat `runtime/history.test.ts`、`parts/parts.test.tsx`：2 文件，19/19 通过。
- targeted oxlint：无错误，UI 所有者已收到 effect 依赖等警告；最终重跑待完成。
- `git diff --check`：通过。

## 当前结论

**最终源码独立复核通过。** 本审核者最后执行chat 7文件84/84及tsc/lint通过；没有剩余未处置源码发现。 全仓 `pnpm check`、真实浏览器主/侧栏浅深窄屏与交互还原、依赖锁最终核验由主会话负责。没有执行真实外部供应商付费模型认证、原生 Electron/系统输入法/读屏全平台验收；本地 HTTP/SSE 回归不能替代这些结果。

## 最终复核补充（本审核者）

- UI queue-first catch 与 unmounted onCreated live guard已核对；初次chat80/80，之后上传StrictMode/末项取消/user-only Agent回归已随末轮82/82独立复跑通过，类型及lint0错误0警告。
- 附件assistant provenance、GC同会话锁及expiry re-read、严格文本检查后的.ts/video-mp2t窄例外已源码核对；没有把实现者33/33计为审核者重复执行。
- Agent canonical identity/persist-before-terminal补丁已源码核对，所有者12/12通过。当时发现Agent各append未持久化实际protocolEvents/选中模型元数据、无工具最终轮未标注Agent来源，可能影响刷新后呈现/分支保护；主会话协调所有者已修复，末轮源码复核见下。
- 当时发现DocChatSidebar/availableDocxAgent以旧全局角色modelReady/mediaKinds门控句柄和截图；已按主会话授权直接修复并补回归，末轮证据见下。
- server/provider末轮类型检查通过；没有并发运行共享DB server测试。

### 本审核者直接修正的全仓工程阻塞

- miniapp chat/editor/reader：一次初始化由lazy state承载，渲染不读写ref；chat最新持久化快照在layout effect更新，原有事件内同步更新仍保留；editor所有draft变更仍经replaceDraft同步更新latest。
- miniapp Markdown图片：外链/不支持状态由输入派生，受保护下载异步更新；source key重挂载清理旧下载/错误，避免effect同步setState。
- miniapp editor：Taro卸载提醒API类型为void，使用Promise.resolve兼容异步返回，修正3处类型错误。
- miniapp-write测试：beforeAll登录失败显式抛HTTP错误，去掉lint不认可的setup standalone expect，未弱化测试主体断言。
- 10-17原型自有Prototype/tests：定时完成回调代替同步effect状态写、导航图标补key、删未用locator。第三方protected src/mobile保持原28项hash，runtime integrity通过；根主会话仅排除已证实第三方模板代码。
- miniapp产物校验：Taro多页复用把NutUI抽至common.wxss，旧硬编码chat/index.wxss错误。改为沿app.wxss真实import图断言nut-button可达；模块归属/Node内建/2MiB预算仍检查。同步miniapp build spec。
- 验证：miniapp tsc通过，工程测试8/8，Taro编译成功，更新后产物校验7页667模块466159bytes（455.2KiB）；原型tsc和runtime28/28通过；上述维护源lint0error（既有warnings保留）、格式检查与git diff --check通过。微信设备/GUI未验。

完整来源覆盖账本：`parity.md` / `parity.json`，71组379来源态和24附件态仅是实现证据对应，不是403条产品GUI通过。

## 末轮独立复核与宿主修复

- chat最终7文件82/82独立执行通过，chat tsc与oxlint0错误0警告通过；包括上传StrictMode、末项取消、user-only Agent历史等最终回归。测试中的两条HTTP503为故障恢复fixture。
- 修复DocChatSidebar/availableDocxAgent：只按实际文档ID、格式、executorReady判断宿主；旧角色modelReady/mediaKinds不再阻断明确选择的模型。PPTX截图标志表示传输支持，发送前仍逐轮验证所选模型工具/视觉能力。DocxCapabilityStatus根据真实模型目录加载/错误/空状态给出提示，不错误宣称缺失旧角色等于没有模型。
- 新增侧栏DOCX/PPTX真实query-cache接线回归，旧角色modelReady:false/mediaKinds:[]仍连接正确句柄/截图传输；辅助函数拒绝错误文档、错误格式及未就绪executor。renderer相关4文件9/9、tsc、六源文件oxlint通过；两个产品组件antd lint均0问题；document spec已同步。
- Agent历史补丁源码复核：服务端保留有界真实TEXT/REASONING/THINKING/TOOL_CALL帧、明确modelSelection、认证当前文档scope及可信来源；无工具assistant和启动失败仅user历史均标注Agent，真实interrupt行优先覆盖当前工具状态；EOF失败不可存为成功。新增服务端测试覆盖SDK历史回放、容量及边界，由所有者/主会话在共享DB窗口运行，审核者未并发重跑。
- 未关闭的验收边界仍是主会话最终全仓质量门/GUI记录及实际外部供应商、原生系统能力；本审核者没有发现额外未处置的源码问题。

- renderer保存/附件HTTP客户端/Agent媒体补充回归3文件13/13通过；最终目标源格式与git diff --check通过；parity机器清单重新核对71组、379来源ID、24附件态数量一致。

## 最终增量：停止默认动作与纯工具轮次

- `Composer.tsx`停止click先preventDefault再runtime.stop，防止React同步回填/重渲染把同一DOM节点由button变为submit后触发表单默认发送。新增DOM回归在document冒泡末尾flushSync，真实执行button.click，断言只收到1次HTTP、只保留1条已发user、队首回填和第二条暂停，覆盖了浏览器发现的具体事件顺序。chat pitfalls已同步该合同。
- `use-mimir-runtime.ts`在TOOL_CALL_START明确以parentMessageId设置assistantId并刷新sidecar；纯工具没有TEXT/REASONING_START时也不会把后续Agent来源/终态写到前轮。双轮真实SSE回归分别发送不同parentMessageId/文档来源/完成失败状态，验证两条assistant保留各自状态，源码和测试一致。
- 最后独立复跑：chat7文件84/84通过，tsc通过、oxlint0错误0警告；两条503为故障恢复fixture。没有为本次复核改产品源。
- 主会话另报PG6文件84/84通过，浏览器已确认停止修复一次、最终稳定复验尚待主会话记录；这些不是审核者重复执行。全仓质量门正在处理Office两个异步失败，归主会话及Office所有者完成，不据此宣称全仓已绿；审核者未运行server或全Office。

## Office异步测试补丁只读复核

- 复核范围仅`editors/XlsxEditor.test.tsx`、`editors/DocxEditor.encryption.test.tsx`、`editors/docx-encryption-worker.test-helper.ts`的最终diff，没有启动测试或修改产品源。
- XLSX保存助手把两段50次setTimeout(0)轮询改为复用已有waitForGrid；其既有3000ms截止值未改，Vitest测试timeout也未改。等待条件仍要求非空且不同于上一份的真实保存字节，并新增界面“已保存”终态；后续工作簿/公式/XML/格式断言没有删除或放宽。这里确实替换了原来按tick计数的短轮询窗口，应准确记为等待语义修复，而非声称等待时长完全相同。
- DOCX外部standard/agile加密测试在编辑前await实际生产worker首个response（包含React act提交），替代仅靠后续DOM轮询碰运气；后续真实编辑、保存、实际解密、document.xml正文及dirty:false断言不变。helper仅新增可等待完成信号，在正常消息/error/terminate后释放；error/terminate不伪造成功内容，后续真实DOM与解密断言仍会失败。未替换worker、mock字节或提高测试timeout。
- 只读结论：三文件修复未弱化验收断言，也没有修改测试超时配置。UI所有者报告三文件83/83、Office tsc/lint通过，属于所有者证据；最终全仓gate由主会话继续运行。
- 主会话的`browser-qa.md`已记录最终稳定停止重复、FIFO自动发送、真实图片上传/预览/Escape回焦/移除、分支保存、引用跳转、侧栏保活与390px无横溢出，并明确原生/付费供应商边界；审核者已读取记录，没有把这些写成自己重新操作的结果。Web/Server/Desktop构建0由主会话报告，最终全仓通过仍须其实际gate结果。

## 最后只读增量：字号接线与旧trace断言

- 核对Composer、ComposerMenus、MessageItem、ReasoningPart、ToolCallPart共11处字号：使用已由ChatHostVars声明、renderer ChatThemeBridge供值的--mimir-chat-font-meta/note/excerpt/badge，带现有字号阶梯回退值；未新增第二套主题、跨包导入宿主token或改动交互处理器。ChatHostVars与ChatPanel.style末次布局说明只纠正24/16px gutter、808/856px列宽注释，不产生布局代码变化。该增量未发现问题。
- structure.test.ts旧“trace非空/带steps”断言与已批准product§5.6移除自定义检索过程相反；更新为trace严格null符合合同。测试仍要求assistant及非空引用存在，真实文档GET为200；新增本次创建sourceID必须命中，并以同一canonical assistant ID查找重载消息、验证trace为null及引用完全一致。没有用可选分支绕过断言、伪造结果、删除真实引用验证或提高timeout。该增量未发现问题。
- 本轮仅只读源码核对并更新本记录，没有启动任何测试或改动产品。所有者此前报告design109/109、chat84/84及tsc/lint/format通过，最终Web/Desktop构建0。主会话上一轮全仓报告Office2709、Renderer581、Chat84及server其余1364通过，唯一失败为本次修订的旧trace断言；新的全仓gate77221仍运行，尚不能记为全仓通过，最终结果由主会话补录。

## 主会话最终质量门补录

2026-10-19，最终 `pnpm check`（session 77221）exit 0：Server 1365、Office 2709、Renderer 581、Chat 84 全部通过，其余 local/fnOS/backup/Desktop/根脚本亦通过，完整摘要见 `quality-gate.json` 与 `acceptance.md`。这是主会话实际执行结果，独立审核者没有重复运行该完整套件。最终浏览器停止保稿复验和其他实测详见 `browser-qa.md`；独立复核此前记录中的“待主会话”事项据此关闭，原生与付费供应商边界仍保留。
