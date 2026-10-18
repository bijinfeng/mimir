# 执行计划

## 已完成：规划与独立HTML

1. 研究全局CommandPalette及宿主操作/快捷键/最近读取链路；记录具体源码证据与WeKnora版本。
2. 编制全状态盘点与覆盖映射；按当前源码构建baseline，构建同场景提案；仅写任务prototype/。
3. 独立原型lint、格式、脚本/类型检查和构建；主会话使用CUA完成一组合并桌面/窄屏/浅深/关键链路验证。
4. 集中修复发现的问题后，最多一轮确认；保存截图、版本哈希与边界。限定提交任务记录和HTML后请求具体版本认可。

## 当前获准：产品实施

- 先核对批准的HTML版本，按源码证据补足精确执行顺序与测试断言，再task.py start。
1. `CommandPalette.tsx`：消费recent查询状态；保留12ID的note子集；组合输入与500字边界；稳定选中key、键鼠同一执行/忙碌保护；等待/缓存失败/重试反馈；长内容、关闭回焦和整面板高度约束。
2. `routes/_app.tsx`：新建和AI分支接入既有runGuarded，确认后才创建或写AskDraft；新建请求单飞、失败保留上下文、成功再导航并保留正文聚焦；快捷键repeat/IME与回焦衔接。
3. `DocumentPanel.tsx`：只补本模块rename/move/find命令链的真实pending/error/IME/文档身份与焦点，不改全文档设计；先复核当前metadata更新和编辑器autosave合同，禁止以异步db事务或无依据缓存覆盖解决竞态。
4. 复用`recent-documents`聚合、QueryClient现有重试和UnsavedGuard。保留Citation/sourceStart定位算法、move原有8秒撤销，不改搜索算法或后端数据模型。
5. 新增有意义的CommandPalette组件与App宿主回归，覆盖152项中的关键行为类别：IME选字/箭头、列表增删key、请求中键鼠一致、recent部分/全部失败及401、显式AI不发送、新建取消/失败/单次、目标文档绑定、查找门槛、交接/回焦和窄屏。采用可控promise/真实用户动作，不写固定sleep断言。
6. 相关包lint/typecheck/测试、实际登录账号的关键链路与片段定位、全仓pnpm check、独立检查和现行spec同步后限定提交。
- 重点保护IME、异步列表身份、旧结果误点、新建单发/失败草稿、显式AI预填与未保存保护、近期读取恢复、弹窗层级焦点。
- 产品实现需独立Trellis检查、实际业务验证、全仓门、规范同步和限定提交；其他模块不继承批准。

用户已于2026-10-18认可v1并回复“实施吧”；批准后开始当前模块。上模块全仓阻断仍由其开放任务单独记录。

## 实施分工与顺序

1. 三个可独立验证关注点并行：CommandPalette及其样式/测试；AppShell动作/快捷键及测试；DocumentPanel命令宿主及测试。共享接口先固定，最后集成。
2. AppShell拥有新建请求的同步单飞锁、pending/error状态，向Palette传creatingNote/createNoteError。Palette所有动作由宿主决定关闭时机，不再执行后盲目onClose；新建/提问/打开/返回在guard确认后才关闭或开始请求，取消保留原输入。
3. Palette取消才回焦，交接不抢焦；必要时给共享导航搜索触发器加稳定data标识用于回焦兜底。原型保持冻结不改。
4. 文档宿主先核实metadata与autosave的数据流，操作绑定文档ID；不改变保存算法或做猜测缓存覆盖。
5. 增加可控promise回归：查询中键鼠统一防误执行、最近部分失败、组合输入、选中key、新建单发/失败/guard、AI取消无草稿、命令失败不丢草稿/迟到不污染新文档。
6. 定向lint/format、Renderer typecheck/tests，独立check代理与真实浏览器合并浅深/桌面窄屏链路；集中修正后确认；执行全仓pnpm check并准确记录阻断。

最小改动边界：以上三个Renderer关注点及其必要样式、测试、回焦标识；不修改搜索后端、共享契约、Office引擎、主题tokens或其他模块设计。局部拆文件只按样式/命令关注点，不做泛化重构。

## 实施前技术核对

- 文档命令：服务端updateNote已有per-note串行队列且读取最新row后patch；MarkdownEditor正文初值按documentId快照，metadata更新不重新灌入编辑内容。本轮不变更保存算法、不引入猜测缓存字段合并。metadata成功后精确失效document query读取服务端当前事实，避免主动把旧的整对象mutation响应写入活缓存。网络响应顺序窗口未被断言为已发生故障。
- Guard：既有runGuarded返回void，已有确认modal保持原manual/auto/Office选项；App仅补齐所有离开动作的入口并保留被盖住的Palette。interactionSuspended仅暂停底层输入/关闭，不重建面板。
- 跨组件命令事件携带{command,documentId}，宿主拒绝不属于当前文档的事件；兼容已有内部调用，异步结果绑定原文档。

## 本轮实施结果

- 三处关注点实施、独立检查和合并真实浏览器验收完成。元数据刷新失败的必要保护采用有缓存doc保留活编辑器、只重试读取；未改autosave算法。
- 完整Renderer57文件490项通过；全仓类型通过。本轮lint/format/AntD/样式门通过。全仓门仍被小程序lint、其他配置格式及Office加密测试阻断，任务保持in_progress。
- 全部事实、152项验证分类与限制见[产品实施验收](implementation-acceptance.md)，不把原型模拟或组件回归当真实原生能力验证。
