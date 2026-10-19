# Research: Independent v3 review

- Query: 独立只读复核完整官方 Thread v3 HTML 的原件、默认样式、逐态分类、附件 adapter、宿主及队列保护和边界说明。
- Scope: mixed（固定官方源、本地规划原型、产品及 v1/v2 冻结基线；不执行 GUI 验收）
- Date: 2026-10-19

## Findings

### 结论和实测范围

**当前候选通过独立源码与静态产物复核，未发现剩余源码阻断项。** 浏览器交互和视觉验收由主会话负责，本报告不代替该验收，不冻结 v3 最终 hash，不授权产品实施。观测候选的 SHA 与计算结果保存在 `research/independent-v3-evidence.json`；主会话后续若改变产物，应重新核对。

独立复算结果：

| 检查 | 结果 |
| --- | --- |
| 官方固定来源 | 35/35 字节 SHA 一致；25 份运行时源码闭包；unresolved 0 |
| 产品冻结基线 | 51/51 一致，无产品改动 |
| v1/v2 冻结基线 | 57/57 一致 |
| 原来源清单 | 71 组 / 379 态，描述、source、boundary 投影差异 0 |
| 权威逐态分类 | official-default 71、external-host 179、removed 7、boundary 122；379 态逐个比对差异 0 |
| 独立附件新需求 | 新增 24 态，排除于原来源基线；合计 403 唯一路由 |
| 独立 HTML | review/thread HTML SHA 与当前 checks 一致；两文档各单一项目 React；MIT 完整许可均嵌入 |

分类计数和路由覆盖是静态规划证据，**不是 379 或 403 项 GUI 测试通过**。`checks.json` 的声明仅作交叉检查，上表由研究脚本独立读取并计算，没有执行会写 v3 的 checker/build。

### 已逐项复核的修复

| 问题 | 最终源码证据与判断 |
| --- | --- |
| 普通运行中 Enter 经 queue.steer 时报错 | `prototype/v3/thread-app.tsx:101–123`，enqueue/steer 都委托同一宿主 send/FIFO。它只是本地队列映射，没有声称真实 steering，也不能证明产品 AGUI 接线。 |
| 官方快捷问缺 runtime suggestions | `thread-app.tsx:98`、`main.tsx:1887`，官方原件消费实际 suggestions；原重复宿主三个提问按钮已移除。 |
| 分类误把 boundary 算成呈现成功 | generator 从权威 Markdown 逐态分类；本次独立重算 379 态差异 0。 |
| 截图草稿未进入官方附件 | `thread-app.tsx:173–203`，公共 composer.addAttachment 注入有效本地 PNG；`DraftObserver:57–67` 观察原生移除并同步宿主。明确仅本地 1px fixture，不冒称真实画布截图。 |
| 隐藏侧栏会卸载 iframe 丢附件 | `main.tsx:1762–1774`，proposed 同一 wrapper 保留节点，以 hidden 隐藏；生命周期连续性仍由主会话 GUI 核对。 |
| 不支持格式的原生添加错误被丢弃 | `thread-app.tsx:166–172` 订阅公共 attachmentAddError；`thread-frame.tsx:64–65` 转到宿主 Notice。 |
| iframe 默认 form 提交缺权限 | `thread-frame.tsx:79` 含 allow-forms；未放开同源，不改官方默认表单。 |
| 文档 Agent/AI 修订接受通用附件 | `main.tsx:1900` 传真实拟定 Agent 状态；`attachment-adapter.ts:155` 发送前拒绝并保稿；宿主 send 再校验。新增 ATT-001.agent-block，累计 24 态。 |
| 专用截图与通用附件可能混发 | `thread-app.tsx:84` 传 dedicatedSnapshot；`attachment-adapter.ts:153` 在 generic pending adapter.send 前拒绝，专用 complete attachment 独立；`main.tsx:443–469` 还有混发/Agent 二道守卫。通用文件没有注册截图身份。 |
| HOST-010.none 可模拟保存不存在的回答 | `main.tsx:388–389,607–624`，missingSave 从 lastSuccessful 排除、saveAnswer 不启动、completeSave 不得成功，并显示没有已落库助手回答。仍未声称真实落库服务已验证。 |
| CHAT-032.broken 使用正常图片 | `thread-fixtures.ts:139` 将 broken/error/failure 都投影成损坏 PNG。 |

### 完整官方与宿主边界

- `thread-app.tsx:258–262` 在原 Provider 下直接 `<Thread />`。没有 components 覆盖、dataUI/toolUI 注册、自绘消息/Composer 替代或第二份 proposed transcript。
- `official.css` 仅原 registry globals、原 tw-shimmer 和 Tailwind source；固定原件 35 份字节一致。`thread-frame.tsx:75–87` 独立 srcDoc 隔离，宿主 CSS 只管外部容器；父侧整数几何调整不修改 Thread 内部默认样式。
- Thread 保持官方英文、尺寸、图标、媒体/代码/消息动作、默认 Copy/Export 门控。默认 Copy/Export 不等于安全保存或执行成功；不支持的编辑等能力不伪造回调。
- 范围、模型、usage、引用、分类恢复、保存、队列、文档任务在外部业务区。检索 trace 的原 7 态明确 removed，不转成 reasoning/tool-call；真实 canonical reasoning/tool-call 才交默认组件。
- `thread-fixtures.ts` 保留旧 source/audio 缺默认 case 的 boundary；新增 audio-demo 才提供有效本地 PCM WAV，并明确没有自动播放、不是原来源 payload，不声称支持音频上传。
- iframe event.source/type/channel 校验见 `thread-frame.tsx:52–69`，子文档来源检查见 `thread-app.tsx:153–160`。这只是本地隔离原型；正式嵌入焦点/Escape/生命周期仍需产品实测。

### 附件方案和安全范围

`attachment-adapter.ts:7–18,54–189` 实际使用标准 accept/add/remove/send 接口和本地内存，支持准备/失败/预览/移除/发送前准备等 fixture。普通 File 的 pending send 拒绝发生在原发送前；宿主恢复路径是 complete attachment 时另有二道保护。**首版通用附件只普通模型问答**，Agent/AI 修订关闭后才可发送；专用登记单 PNG 保持原校验，不能混用。现有 Agent 通用编辑后端不在本次范围。

拟定 4 件、总 20 MiB、文档 10 MiB、图片 5 MiB/4096 边/16 MP、单件文本 12000/本轮 24000；24h/1h/已发随会话/200 MiB 仍是服务端待实现合同。部分限制用场景模拟，不能把 fixture 文案当真实 Office/PDF 解析、上传、TTL、鉴权、持久化、配额或模型能力证明。

明确没有 fetch/上传/解析/模型/KB 持久化。现有产品 upload/capture 是永久知识库导入，不可复用成悄然入库的临时附件。正式 wire 须服务端 canonical ID，图片绝对同源 HTTP(S) 引用；本稿 dataURL/text 与 UI ID 均不等于正式 wire 合同。

### 发送前冻结研究与验证界限

配套 `research/agui-official-thread-pre-send-seam.md` 给出公共 runtime facade：在 composer.send、thread.append 之前同步 freeze，Provider 同时覆盖 threads.main/getById，保持原 AGUI core/queue/extras 唯一所有权。隔离的 4 个最小官方 primitive + 真实 HTTP 探针，在产品 SDK .28/core .27 与 SDK .29/core .29 组合各 4/4 通过，facade 严格 tsc 通过。

这不等于完整 Thread 的产品 E2E，更不能用 v3 的本地 ExternalStore/FIFO 证明文档工具恢复、画布版本、历史持久化、队列回填等业务全链。SDK .28 到 .29、已存在 ask 路径去重 freeze、实际附件而非无关 composer 附件的 runConfig、官方 Edit/Reload/voice 与 rejected suggestion 清稿竞态，仍按配套报告留待产品集成验证。

### 文件、来源与相关规范

- `prototype/v3/main.tsx`：before/after 分支及外部宿主业务。
- `prototype/v3/thread-app.tsx`、`thread-frame.tsx`、`thread-fixtures.ts`：完整默认 Thread、独立文档、canonical fixtures。
- `prototype/v3/attachment-adapter.ts`、`attachment-coverage.json`：标准本地 adapter、新增 24 态。
- `prototype/v3/provenance.json`、`vendor/**`、`official.css`、`build.mjs`：固定原件、单 React 构建、许可。
- `research/full-official-feature-mapping.md`、两份 package/host inventory：原 71/379 权威来源和分类。
- `research/independent-v3-evidence.json`：此次独立重算证据；`v2-product-baseline-hashes.json`、`v3-frozen-prototype-hashes.json`：产品/旧稿冻结基线。
- 相关规范：`.trellis/spec/chat/frontend/conventions.md`、`pitfalls.md`；shared document-agent/docx-agent 合同；renderer document/theme conventions；project research/quality。

官方固定源码 `assistant-ui/assistant-ui@a587b2838f2d644549d216098d54cfbeedfac522`，MIT/2026 AgentbaseAI Inc.；v3 SDK 0.15.29、core 0.3.29、项目 React 19.3.0；产品 SDK 0.15.28/core 0.3.27、含 interrupt 恢复补丁的 react-ag-ui 0.0.68，差异未隐去。

按项目要求复核同日 `research/vendor-full-thread/weknora-reference-recheck.json`：[官网](https://weknora.weixin.qq.com/) HTTP200 展示 v0.8.3、113529 bytes、SHA256 `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`；[公开源码](https://github.com/Tencent/WeKnora/tree/2c0d8384398ca756ee414eef01b71caf91e2caa6) 固定 commit `2c0d8384398ca756ee414eef01b71caf91e2caa6`，frontend 0.8.3。AgentStreamDisplay.vue:62–79 的过程区与 :421–454 的成功/非空动作门控可用于 Mimir Agent 业务区边界检查；不适用于覆盖本轮用户要求的完整官方默认 UI，也未以其 Markdown 编辑器作为 Office 工具栏模型。

## Caveats / Not Found

- 本轮独立研究不启动浏览器；主会话负责 GUI。原生文件选择器、IME、真实缩放/减少动态、clipboard 权限、媒体、焦点交接和真实附件保留等未在本研究中实测。
- 403 是唯一路由计数。122 个原状态明确仍是 boundary；不能把分类表、局部 HTTP 探针、原型可点击或静态 checker 表述为真实产品能力全部通过。
- 仅写当前任务 research/ 的报告/证据及隔离 probe；没有改产品、spec、v1/v2、v3，也没有执行 git。
