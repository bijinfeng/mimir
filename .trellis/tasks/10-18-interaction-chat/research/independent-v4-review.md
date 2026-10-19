# Research: v4 独立规划源码复核

- Query: 已批准的输入框底部三项工具栏例外是否完整且保真，其他官方组件/样式、来源映射和旧稿是否保持？
- Scope: mixed；独立源码/静态资产复核。仅 HTML 规划，不是产品质量门或 403 次 GUI 测试。
- Date: 2026-10-19

## Findings

**最终候选 PASS，无剩余源码阻断。** 结论只针对下列 SHA256 对应的规划资产；GUI 抽验由主会话另行记录，产品实施仍须等待用户认可本具体 v4。全部机器核对结果和审阅源码 hash 保存于 `research/independent-v4-evidence.json`。

| 产物 | 独立计算 SHA256 |
| --- | --- |
| `prototype/v4/review.html` | `72e2ca29620a90e6dc2a777a7621ddbda0511a79589423279378ef8c3c9128ce` |
| `prototype/v4/thread.review.html` | `5ed483d87152181feb52f39571ba1ea2fe375404ea9f7eb61b66a99a5ff0af7e` |

### 文件、源码与官方闭包

- `prototype/v4/thread-extended.tsx:3` / `:516`：独立还原后与固定官方 `thread.aui.tsx` 字节一致，仅新增 toolbar import 和 ComposerAction 前一个 `<ComposerBusinessToolbar />`。插入节点位于原 `aui_composer-shell` 内，保留原附件/输入/发送停止和消息链。
- `prototype/v4/composer-toolbar.tsx:53`：唯一新增业务 UI 组合。使用原件 Button ghost/sm、DropdownMenu 的公开 props。排布/换行/截断类只挂新增 div/span，不向原件控件传 className/style；未注册 ModelContext、modelName 或 reasoningEffort。
- `prototype/v4/provenance.json`：36 件官方原件逐件 hash 全匹配；其中 35 件与 v3 相同，新增固定版本通用 DropdownMenu，SHA256 `897df3d3b32c9f292b7bf09e3c00f475c1c28916a660ebe810a8ca8d8337630d`。独立递归解析 derived Thread 和 toolbar 的 import 树，实际执行 vendor 文件 25 件；归档 closure 26 件包含保留但不执行的原始 Thread，不能混淆。
- `prototype/v4/official.css:2`：只导入原 globals/shimmer 并扫描源码，没有新增覆盖选择器或 Mimir 主题/字体/token。官方 globals/shimmer 原件 hash 不变。
- `prototype/v4/thread-app.tsx:311`：调用派生 `<Thread />`，不传自定义 components/renderer，不注册消息/part/data/tool UI；其余完整官方组件/默认 CSS 不变。
- `prototype/v4/thread-frame.tsx`：独立 opaque iframe，外壳宿主样式不能穿透；支持 allow-scripts/forms/downloads/popups，无 allow-same-origin。两份 standalone HTML 完整内嵌官方 MIT 许可，无外部 script/link 运行时依赖。
- `prototype/v4/runtime-resolution.json`：SDK 0.15.29/core 0.3.29；每个 HTML 文档只用一个项目 React 19.3.0 实例。

### 业务控制、范围与安全边界

- `composer-toolbar.tsx:65`：全局 chat/reasoning 两绑定均 disabled；当前角色勾号跟模型名，新增可见角色标签区分同名。缺失如实显示未配置，管理项保留；`main.tsx:686` 经宿主 `runGuarded` 跳转模拟目的地。
- `composer-toolbar.tsx:88`：侧栏明确显示禁用“标准”，没有深入菜单；主对话受控标准/深入只表达已有布尔角色意图。侧栏发送/恢复/派发均强制 false，不把强度误作 provider effort。
- `composer-toolbar.tsx:120`：全部文档/最近 20 篇单篇，选择、更换、清除，loading/error/empty 如实区分。重试进入 loading，再由外部明确模拟读成功/失败结算。不是多知识库选择。范围标题截断留 title；不改 Agent 当前画布执行目标。
- `main.tsx:444` 起保留通用附件/专用截图排斥、Agent 禁通用附件、只检索/无模型/图片无视觉拒绝与原稿恢复；真实 Agent/截图来源/版本和执行桥仍是产品阶段边界。官方附件 UI 不增加自绘重试按钮，失败通过 Remove 后重选。
- 其余保存/引用/队列取回/恢复/Agent 宿主 UI 仍在 Thread 外，v4 没有在外部再放一套三项控制。Current 列保留现行事实，不能将其旧菜单视为 proposed 重复。

### 初始阻断已实质修复：异步发送前冻结

初始候选在 onNew/queue 回调才读取 host latestToolbar，发生在附件 finalize 后，可能将 A 提交误绑到后来 C。该问题被当作阻断修复，未仅修改文案弱化。

- `runtime-facade.ts:20`：公开 runtime decorator 覆盖 `thread`、`threads.main` 和 `threads.getById`；composer.send 在调用原 send 之前同步 freeze 新 runConfig，append 在原 append 前 freeze。原 runtime/core/queue/attachment/中断仍唯一所有，不改私有实现或 DOM。
- `composer-send-intent.ts:5`：每次新建 `runConfig.custom.mimirComposerIntent`，含 scope/deep/kind；侧栏一律 false。后续 selection 不改旧对象。
- `thread-app.tsx:177`：facade freeze 读取本 iframe 同步 capture context；`:304` 的 toolbar onAction 在发宿主 IO 前先同步更新 context，避免单纯等待 host fixture 回传才看到新选择。
- `thread-app.tsx:124` / `:133` / `:152`：enqueue、steer、onNew 都只从本 message.runConfig 读取冻结 intent；不再重新读取当前控件。
- `thread-frame.tsx:78`、`main.tsx:508`：透传该 intent，用于宿主 FIFO 和可见发送快照；取回/派发恢复各条已有快照。
- `composer-send-intent.test.tsx` 和 `send-intent-probe-result.json`：已审阅作者重跑的 3/3 通过证据及源码。实际 ExternalStoreRuntime 与官方 Send/Suggestion primitive 验证异步附件 A→C 仍保留 A、enqueue/steer 分别冻结 A/B 后改 C 不回写、suggestion append、侧栏 false、未就绪拒绝保稿。独立审阅者未重跑探针；此为真实运行时接缝探针，不是完整 Thread 产品 E2E。

### 全来源覆盖与资产完整性

独立逐项比较两份 source inventory、scenes 和 coverage：71 组 / 379 个原状态的 stable ID、Current 描述、description、source、boundary 全部一致，coverage 的 UI、proposed、disposition 同步。新增附件 24 个明确排除在原 baseline 外，总计 72 组 / 403 条唯一路由，且所有原 stable ID 都在 HTML 中。

原始主分类保留 official-default 71 / external-host 179 / boundary 122 / removed 7；另有 44 个状态显式 composerExtension（35 host、7 official、2 boundary），以及每场景 renderContract。这个叠加标记诚实说明有限业务组合，不能将原主分类当作“模型/范围/强度原生官方业务”。7 个自定义 trace 来源均标 removed；真实 canonical reasoning/tool 不由 trace 合成。

`research/v2-product-baseline-hashes.json` 的 **51/51 产品文件** 与 `research/v4-frozen-prototype-hashes.json` 的 **125/125 v1/v2/v3 资产** 均 hash 一致。修复仅在 v4 原型，没有修改产品、产品依赖、旧稿或产品 spec。

### 外部参考、版本与适用性

- assistant-ui 官方源码主证据：`https://github.com/assistant-ui/assistant-ui/tree/a587b2838f2d644549d216098d54cfbeedfac522`，MIT；新增 DropdownMenu 来源与版本同一 commit，见 provenance。
- 按项目研究规则复核同任务同日固定 WeKnora 证据 `research/vendor-full-thread/weknora-reference-recheck.json`：官网 `https://weknora.weixin.qq.com/` HTTP 200，v0.8.3，SHA256 `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`；公开源码 `https://github.com/Tencent/WeKnora` 固定 `2c0d8384398ca756ee414eef01b71caf91e2caa6`，frontend 0.8.3。
- WeKnora 适用于知识库/Agent 范围、来源与权限分工的业务核查；不替代 assistant-ui 对话默认组件/样式，未照搬其自绘过程卡，也不将单篇 Mimir 范围误包装成其其他能力。本主题不是 Office 工具栏，不使用其 Markdown 编辑器作主参照。
- 相关规范：`.trellis/spec/chat/frontend/index.md`、`conventions.md`、`pitfalls.md`，`.trellis/spec/project/rules.md`。旧规范主题/自定义渲染与最新用户官方组件要求冲突时，以用户最新明确要求及批准的有限扩展为准；本研究不修改 spec。

## Caveats / Not Found

- scope 仍以明确披露的本地 fixture 标题标识，**不是 service canonical documentId**；未来产品必须换 canonical ID。只读模型名是当前全局绑定，不承诺队列固化某个 provider/model ID。
- 这次是完整 HTML 效果稿和业务接缝规划；没有真实上传/解析/模型/存储/Agent 写原件、原生 picker/剪贴板/IME、读屏或 Electron 验证。403 是路由数量，不是 GUI 通过数。
- 附件容量、格式、提取和寿命是待用户具体稿审批的方案；真实 API/鉴权/清理/历史/AGUI wire 仍由附件子任务实施。当前文本附件模拟不是正式文件 wire 合同。
- 原型 iframe 边界不等于未来产品部署结构；跨文档焦点/原生功能、真实产品 AGUI queue/interrupt 和发送全过程须在具体 v4 获准后独立验收。
- 研究文件 PASS 不授权 task.py start；具体 HTML 尚需主会话完成 GUI 与交付，等待用户认可后才能实施。
