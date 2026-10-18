# 执行计划

## 当前获准：规划与独立HTML

1. 研究全局CommandPalette及宿主操作/快捷键/最近读取链路；记录具体源码证据与WeKnora版本。
2. 编制全状态盘点与覆盖映射；按当前源码构建baseline，构建同场景提案；仅写任务prototype/。
3. 独立原型lint、格式、脚本/类型检查和构建；主会话使用CUA完成一组合并桌面/窄屏/浅深/关键链路验证。
4. 集中修复发现的问题后，最多一轮确认；保存截图、版本哈希与边界。限定提交任务记录和HTML后请求具体版本认可。

## 用户认可后的产品实施计划（本轮不执行）

- 先核对批准的HTML版本，按源码证据补足精确执行顺序与测试断言，再task.py start。
1. `CommandPalette.tsx`：消费recent查询状态；保留12ID的note子集；组合输入与500字边界；稳定选中key、键鼠同一执行/忙碌保护；等待/缓存失败/重试反馈；长内容、关闭回焦和整面板高度约束。
2. `routes/_app.tsx`：新建和AI分支接入既有runGuarded，确认后才创建或写AskDraft；新建请求单飞、失败保留上下文、成功再导航并保留正文聚焦；快捷键repeat/IME与回焦衔接。
3. `DocumentPanel.tsx`：只补本模块rename/move/find命令链的真实pending/error/IME/文档身份与焦点，不改全文档设计；先复核当前metadata更新和编辑器autosave合同，禁止以异步db事务或无依据缓存覆盖解决竞态。
4. 复用`recent-documents`聚合、QueryClient现有重试和UnsavedGuard。保留Citation/sourceStart定位算法、move原有8秒撤销，不改搜索算法或后端数据模型。
5. 新增有意义的CommandPalette组件与App宿主回归，覆盖152项中的关键行为类别：IME选字/箭头、列表增删key、请求中键鼠一致、recent部分/全部失败及401、显式AI不发送、新建取消/失败/单次、目标文档绑定、查找门槛、交接/回焦和窄屏。采用可控promise/真实用户动作，不写固定sleep断言。
6. 相关包lint/typecheck/测试、实际登录账号的关键链路与片段定位、全仓pnpm check、独立检查和现行spec同步后限定提交。
- 重点保护IME、异步列表身份、旧结果误点、新建单发/失败草稿、显式AI预填与未保存保护、近期读取恢复、弹窗层级焦点。
- 产品实现需独立Trellis检查、实际业务验证、全仓门、规范同步和限定提交；其他模块不继承批准。

当前任务保持planning；原型构建不授权产品代码实现。上模块全仓阻断仍由其开放任务单独记录。
