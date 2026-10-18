---
name: miniapp-client-contract
description: Taro 原生传输、草稿、阅读和写入生命周期
paths:
  - apps/miniapp/src/**
---

# 原生客户端行为合同

## 1. Scope / Trigger

适用于小程序所有业务页面。页面使用 Taro 原生组件及按需 NutUI；批准的浏览器 v3 只作布局和交互参照。客户端不导入 renderer、Office、React DOM 或浏览器网络实现。

## 2. Signatures

- `src/lib/api.ts` 负责 `Taro.request`、统一错误与专用设备 Authorization。
- `src/lib/stream.ts` / `sse.ts` 负责微信分块请求和增量事件解码。
- `src/lib/session.ts` / `storage.ts` 维护设备会话与本地隔离数据。
- `src/lib/files.ts` 负责鉴权下载与 `Taro.openDocument`。
- `src/components/markdown.tsx` 使用原生组件阅读 Markdown。

## 3. Contracts

- 地址来自构建期固定 HTTPS origin；没有配置时明确显示状态，不请求默认地址。
- 设备 token 只进 Authorization，不进 URL、日志、草稿正文或构建常量；过期 / 401 回到登录，不能使用旧 cookie 退回普通 API。
- SSE 解码必须保留跨 chunk 未完整的 UTF-8 字节与半帧，不能假定一次回调对应一个事件。中断不等于成功，重新进入时查服务端回执和持久化消息。
- 草稿以服务 origin、账号与文档 / 新建身份隔离。显式保存、离开提示、前后台保留输入；不把本地保存当作服务端成功。
- 已发送写入持久保留 requestId 与原 payload，断线后先查回执。结果未知时不能自动换编号重写；用户修改输入与原请求的重试相区分。
- 编辑能力由服务端 `canEditBody` 决定；Office 与捕获正文只读。整理和追加仍使用 expectedRevision；冲突保留草稿，提供重载或另存。
- Markdown 不执行 HTML / JavaScript；只允许受控链接与图片来源，失败图片有可理解的提示。Office / PDF 原件必须携带凭证下载到微信临时文件，再调用平台查看，不伪造页码跳转。
- 引用先展示回答中的片段快照；打开原文按 ID 获取当前资料。切检索范围新开会话，不能悄悄改变历史问答含义。
- 视觉沿用紧凑白灰、主操作绿 `#00834d`、中性导航选中态、6px 圆角、44px 触控区域和正文 15px / 1.8。长文、键盘、安全区域及错误态以实际平台效果为后续验收项。

## 4. Validation & Error Matrix

| 情况 | 页面行为 |
| --- | --- |
| 没有服务地址 / 会话 | 显示对应设置说明 / 登录入口 |
| 401 | 清除登录状态，保留账号隔离草稿 |
| HTTP 非 2xx | 读取标准 error envelope，不渲染作成功结果 |
| SSE 未结束、进入后台、网络中断 | 显示未确认状态，查询已保存回执 / 会话 |
| failed 回执的 revision 冲突 | 原输入保留；可重载、保留或另存 |
| 外链图片失败 / 不支持原件格式 | 明确失败，不出现假成功预览 |

## 5. Good / Base / Bad Cases

- Good：电脑修改后，手机保存收到冲突，旧草稿仍能查看和另存。
- Base：只检索模式无模型也能阅读来源片段，状态与问答模式明确区分。
- Bad：后台流被断开时展示“已完成”，或请求超时后重新生成同一回答。

## 6. Tests Required

待用户统一验证：跨块中文 / emoji、半帧 SSE、服务错误、结束事件；弱网和后台返回的操作恢复；账号切换草稿隔离；三种范围；引用回原文；Markdown 安全显示及图片失败；Office / PDF 下载查看；编辑与元信息冲突。保留工程测试和产物脚本；用户明确延后时不执行，也不记录为通过。

## 7. Wrong vs Correct

```ts
// Wrong：微信运行时没有浏览器 EventSource，下载原件也不能依赖网页 cookie。
// Correct：Taro 分块 request 带设备 header；downloadFile 同样带 Authorization。
const header = { Authorization: `Bearer ${session.token}` }
```
