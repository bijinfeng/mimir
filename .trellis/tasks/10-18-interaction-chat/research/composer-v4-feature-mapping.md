# v4 输入框控制覆盖修订

本表取代v3逐态映射中关于三项控制必须放在Thread外的定位要求。原71组379态的来源/当前描述及主分类保留；其中下列44态另标composerExtension，实际使用用户已同意的输入框工具栏组合，不是官方内置业务。其余非工具栏的消息渲染与宿主分工沿用既有合同。原7项trace仍删除，新增24项附件独立统计，总403路由并非GUI测试次数。

官方原件保留，Thread派生仅import与一次挂载；不得改消息/组件默认CSS。工具栏默认Button/Menu复用，作用域实际为单篇/全部，强度为业务角色布尔，模型为全局只读绑定；侧栏提案展示禁用的标准状态，current保留现行隐藏事实。

| 状态 | 显示入口 |
| --- | --- |
| CHAT-002.standard | 侧栏强度隐藏 |
| CHAT-007.empty | 空输入 |
| CHAT-007.focus | 容器聚焦 |
| CHAT-007.typed | 输入文字 |
| CHAT-007.multiline | 换行 |
| CHAT-007.enter | Enter发送 |
| CHAT-007.ime | 输入法候选 |
| CHAT-007.escape-idle | 空闲Esc |
| CHAT-007.narrow | 窄栏工具换行 |
| CHAT-009.all | 全库触发器 |
| CHAT-009.menu | 文档列表 |
| CHAT-009.loading | 文档加载中 |
| CHAT-009.error | 读取失败 |
| CHAT-009.empty | 无文档 |
| CHAT-009.dismiss | 关闭菜单 |
| CHAT-009.keyboard | 键盘菜单 |
| CHAT-010.selected | 已锁单篇 |
| CHAT-010.long | 长标题 |
| CHAT-010.replace | 更换 |
| CHAT-010.remove | 移除 |
| CHAT-010.queued | 已排队范围 |
| CHAT-011.standard | 标准 |
| CHAT-011.menu | 打开强度 |
| CHAT-011.deep | 深入 |
| CHAT-011.hidden | 侧栏隐藏 |
| CHAT-011.dismiss | 取消选择 |
| CHAT-012.chat | 对话模型 |
| CHAT-012.reasoning | 推理模型 |
| CHAT-012.menu | 只读两绑定 |
| CHAT-012.missing | 未配置 |
| CHAT-012.same-name | 同名模型 |
| CHAT-012.long | 长模型名 |
| CHAT-012.manage | 管理模型 |
| HOST-011.loading | 读取可选文档 |
| HOST-011.empty | 没有文档 |
| HOST-011.error | 文档读取失败 |
| HOST-011.items | 可选文档 |
| HOST-011.retry | 重试列表 |
| HOST-012.bound | 两角色模型 |
| HOST-012.missing | 未配置 |
| HOST-012.usage | 主对话容量 |
| HOST-012.nousage | 侧栏无容量数据 |
| HOST-012.manage | 管理模型 |
| HOST-014.reasoning | 侧栏标准强度 |

权威状态数据在prototype/v4/coverage.json与scenes.json，唯一语义合同见composer-v4-contract.md。旧v3映射是基线，不可当成v4仍把三项放外部的依据。
