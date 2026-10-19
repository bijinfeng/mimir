# v3 浏览器代表路径抽验

日期：2026-10-19。对象为冻结 v3 HTML，非产品服务。外层 review HTML SHA256 为 `2bfbfd2cd62fefca351297ec03d0d3bfde7f64e9eed123a7372e5ef0bcabd920`，官方 Thread 独立文档为 `e49deaad771175b871bb4674a0def6bafd09c77c3359df7dab89e5357f442df2`。当前稿、对比稿及提案稿可切换；以下为本轮主会话的实际操作记录。

## 结果

| 操作 | 实际观察 |
| --- | --- |
| 普通提问点击官方 Send，再模拟完成 | 官方等待点出现；完成后替换为回答及 Copy/Refresh/More，无残留等待点 |
| CHAT-014.queued 运行中输入并按 Enter | 输入清空并加入宿主 FIFO；取回队首恢复原问题，新问题“再列出三个例子”保留为下一项 |
| 展开官方 Reasoning | 展示真实 canonical reasoning fixture，无自定义检索过程 |
| 展开官方 1 tool call / Running tool: search_knowledge | 展示实际工具参数 fixture，无自定义过程统计 |
| 点击官方快捷问“速读本文” | 发送“这篇讲了什么？用几句话概括。”并进入等待 |
| ATT ready 发送、模拟完成 | 官方文件附件组随用户消息保留，回答显示官方动作 |
| ATT failed | 显示 upload failed 的官方文件附件与 Remove；移除后 tile 消失 |
| no-vision 图片发送 | 拒绝发送并保留问题和失败附件，不生成假回答 |
| search-only 附件发送 | 拒绝发送并保留问题及附件 |
| document-only 附件发送 | 使用明确披露的宿主默认提问“请概括附件内容” |
| send-pending 点击 Cancel sending | 原问题与附件恢复到输入区 |
| 专用截图官方 Preview/Remove | 展示本地 PNG 模拟；Remove 同步清理宿主截图上下文且保留问题 |
| 重置截图后关闭并重开侧栏 | 隐藏时 iframe 仍为 1 个；重开保留截图和草稿，未卸载运行时 |
| HOST-010.none | 无“存成笔记”动作，不能保存不存在的成功回答 |
| CHAT-028 流错误后回填 | 宿主错误、重试及回填可见；回填恢复正确原问题 |
| CHAT-036 Agent | 不安全的官方 Refresh 被真实 capability 禁用 |
| 深色与窄屏 | 390px 审阅场景中官方文档 clientWidth=324、scrollWidth=324，原生 dark 生效 |
| 最终浅色提案 | 完整官方 Thread 与外部业务区、目录可读；已保存最终预览截图 |

## 证据

- [最终浅色提案](preview.png)
- [深色窄屏](dark-narrow.png)
- [文件完整性](integrity.json)
- [独立源码复核](../../research/independent-v3-review.md)

## 未验证与工具边界

403 是规划唯一路由数，379 是原来源状态数；本记录不宣称逐一完成 403 次 GUI 测试。正文、附件、队列与错误均使用披露的本地 fixture/模拟适配器，没有真实模型、上传、解析、持久化、Office 工具或 TTL 服务调用。

原生添加入口实际点击过，但文件选择事件两次超时，未成功完成原生文件选择与上传；`attachment-fixture.txt` 只是无隐私的本地测试素材。附件状态抽验通过场景 fixture，不作为真实上传证据。

CUA 键盘操作遇到 iframe 小数几何限制；关闭“适配”后 CHAT-014 的整数几何上 Enter 成功。另一普通场景 Enter 超时后改用官方 Send 成功，不能据此声称所有键盘路径通过。宿主几何修正未改官方文档样式。

控制台包含 no-vision/search-only 的预期注入拒绝错误，不声明全局零错误。原生 IME、读屏、剪贴板权限、媒体解码、系统缩放/减少动态、跨文档焦点与 Escape、Electron、实际服务及完整产品端到端留待实施验收；本轮未运行产品测试。
