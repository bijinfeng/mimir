# 第七模块 v5 规划交付验收

2026-10-19。用户要求以 `@tanstack/ai-react` 加自有组件替换 assistant-ui，沿用 Mimir 视觉风格，保留 v4 实际交互，并独立展示全部 AG-UI 事件对应的组件、动作和数据处理。v5 替代此前全官方渲染方向；本轮仅方案与 HTML，父子任务均保持 planning。

## 交付合同

- `prototype/v5/review.html`：保留原71组379来源态及24新增附件态，共72组403路由；current为源码重建而非实拍。proposed使用自有组件，真实 TanStack useChat 消费本地事件。
- `prototype/v5/interactions.html`：独立的协议/组件交互详情，支持分类、搜索、深链、播放/单步/重置与可操作组件场景。纯数据同步展示可观察状态，不捏造协议没有的视觉组件。
- 标准协议、5个旧THINKING兼容事件、TanStack扩展、Mimir业务和UI动作分开标明。协议覆盖采用core0.0.59的36事件及core1.0.0的31事件；事件数不等于视觉组件数。
- 交互以v4实际挂载组件及其固定源码为基准，不把上游未挂载导出能力自动加入。详情页的协议能力演示不自动进入Mimir产品范围。
- 模型/标准深入/单篇全部范围保留在输入框内；模型为只读全局绑定、深入为deepReasoning角色路由、侧栏标准、范围不改变Agent目标。自定义mimir.trace继续完全移除。

## 实施接缝

固定兼容候选React0.30.3/client0.39.2/ai0.68.0，隔离安装不改产品锁。真实probe确认stock SSE是完整RunAgentInput，SDK默认浅队列及清空语义不符合Mimir恢复合同，需要Mimir统一深冻结记录。Agent续轮需适配wire parentRunId被服务端拒绝及resume fulfilled false的情况，保留缓存/只续传、不能放宽重放守卫。状态、RAW、reasoning生命周期和旧Thinking边界按版本显式处理。

## 验证边界

403路由和交互目录是覆盖映射，不是全量GUI执行次数。仅HTML本地fixture与隔离运行时probe，真实模型/上传/提取/持久化/HTTP服务往返、Office/Agent改原件、原生IME/读屏/Electron不在本轮完成声明中。产品代码、manifest/lock与冻结v1–v4必须保持不变。具体v5认可前不start、不归档、不推送。

## 最终冻结与检查

- 三份自包含HTML已构建并冻结，准确哈希见 `prototype/v5/version.json`；此前202个原型文件与51个产品文件哈希全部未变，产品manifest/lock与HEAD一致，见 `verification/v5/integrity.json`。
- 原型TypeScript通过；artifact/source闭包检查通过：单React、真实TanStack、无assistant-ui执行模块、来源/current数据不变。Scoped lint零errors，保留31个fixture/effect/array-key等warning；原型源格式检查见记录，生成媒体fixture单独排除，不改编译HTML。
- 协议schema/sequence/sidecar probe：58默认序列+89变体+8检查通过；实际ChatClient/附件适配器probe4组通过，覆盖准备冻结、独立队列快照、取消和失败后显式原始续轮身份的第3次连接恢复。
- 浏览器代表路径及四张最终截图见 `verification/v5/browser-qa.md`。390px为嵌入窄栏模拟；原生IME/权限/真实服务未验。不是403次GUI或全项保真已验收。
- 独立源码复核 `research/independent-v5-source-review.md` 记录已关闭缺陷及边界。独立视觉复核为 **ship（唯一品牌修复resolved的评分范围）**，见 `research/independent-v5-finish-review.md`。专用Impeccable角色在本harness不可用，使用fresh default reviewer/documenter代替，未继承主会话。
- 文档交接 `research/v5-design-handoff.md` 确认现有设计体系扩展，保护DESIGN/PRODUCT；获批实施须映射真实tokens，不直接复制原型近似值。
- 任务与附件子任务保持planning、product_implementation_approved=false；没有start、产品提交或推送。后续具体v5认可后再实施。
