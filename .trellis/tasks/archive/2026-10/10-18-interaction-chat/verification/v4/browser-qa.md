# v4 浏览器代表路径核验

2026-10-19。IAB tab23，最终候选 review `72e2ca29620a90e6dc2a777a7621ddbda0511a79589423279378ef8c3c9128ce` / iframe `5ed483d87152181feb52f39571ba1ea2fe375404ea9f7eb61b66a99a5ff0af7e`。产品未改，无真实业务请求。403是覆盖路由数量，不是GUI次数。

## 最终候选复核

| 场景 | 操作与可见结果 |
| --- | --- |
| ATT-001.send-pending | 默认全部文档/标准点击官方Send；出现官方上传中消息与Cancel sending。等待期间改为深入/单篇“个人知识库的三种组织方式”，点击宿主模拟准备完成。最终原型控制output仍为“全部文档 · 标准 · 输入发送”，控件为新选择，证明本次发送未重读后来值。见send-pending-snapshot.png。 |
| CHAT-014.queued | 运行中用官方输入Enter依次发送A（全部/标准）与B（单篇/深入）。依次取回预置首条、A，下一条B仍显示单篇/深入，而草稿A及当前控件已恢复全部/标准；两个快照独立。队列只显示首项，为继承的宿主行为。见queue-independent-snapshots.png。 |
| ATT-001.send-pending取消 | Send后点击官方Cancel sending，原问题“请结合附件整理要点。”恢复，研究资料.txt附件与Remove/Send入口保留。无本地发送成功输出。 |
| CHAT-005.user | 官方消息及默认动作/输入/附件/发送正常；工具栏三个button位于原Composer shell排布div内、composer-root之下；实际aria-label分别为当前全局模型、思考强度、本轮检索范围。上游合并class不包含aui_composer-shell标记，故按实际父子DOM核验，不依赖该selector。见preview.png。 |
| CHAT-005.user深色390 | 使用评审内390宽选项与官方dark模式；iframe body clientWidth=324/scrollWidth=324，无横向溢出；三个工具栏项换行，原附件和发送可见。见dark-narrow.png。评审尺寸并非设备/浏览器缩放验收。 |

三项actual ExternalStoreRuntime探针由作者运行3/3通过，独立reviewer复核源码与结果，非主会话重复GUI：异步附件A→C仍A、enqueue/steer各自A/B、官方suggestion append/侧栏false/未就绪拒绝保稿。与最终构建代码一致，见prototype/v4/composer-send-intent.test.tsx及send-intent-probe-result.json。

## 本轮较早视觉候选抽验

最终发送接线修复前，同一视觉源码已抽验：标准/深入切换并跟随只读模型名、单篇范围替换与草稿保留、未配置/同名模型可见角色、管理模型离开交接与返回、范围错误→重试loading→显式模拟读成功、菜单Escape关闭及返回触发器、侧栏禁用标准（isEnabled=false）且三项在输入区内。最终修复没有改这些组件的视觉/菜单实现；这些项目不冒称再次逐项全量执行。

## 检查和边界

主会话重跑严格tsc和check-artifact通过；作者build/lint/17项首方格式及3项探针通过；独立源码复核PASS。51产品基线及125旧稿资产全部匹配。旧候选发送数据结果不计作最终证据，最终截图另存并在integrity.json记录hash。

所有scope标题仅为披露的fixture标识，正式产品必须canonical documentId。模型显示名不是每请求provider/model ID快照。真实AGUI/HTTP、上传/解析/存储/视觉、Agent/Office、原生picker/剪贴板/IME、读屏/Electron、真实缩放与跨document焦点仍待产品实施；原型模拟不证明这些服务可用。本轮未再次尝试原生filechooser，未声明真实文件上传通过。
