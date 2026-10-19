# v7 产品浏览器验收

2026-10-19，实际产品 Web，统一测试账号 admin@example.com。隔离 SQLite/文件存储，Web 5191 → Mimir Server 3004 → 本地 OpenAI-compatible HTTP/SSE 验收服务 3044；不触及个人知识库或真实供应商计费。此处是产品接线验证，不把本地供应商 fixture 当作付费模型认证。

## 已实际操作并观察

| 区域 | 操作与结果 |
| --- | --- |
| 模型 | 主对话和侧栏均在输入框内展示模型、推理等级和范围；两个供应商下的同名 qa-model 分组显示，无对话/思考角色分类。供应商 A 实际能力 off/low/medium/high 可选；供应商 B 不支持时显示不可调节。 |
| 真实附件 | 通过原生文件选择接入临时 TXT，逐件准备后显示 ready 卡及受保护原件链接。仅附件发送采用“请概括附件内容”，无 KB 命中也收到真实产品服务转发的 SSE 回答。原件没有导入知识库。 |
| 图片 | 实际上传自造PNG成功，打开预览显示原图；Escape关闭并回焦原预览按钮，移除后卡片消失且发送变为禁用。 |
| 消息 | Markdown 标题、列表、代码正常；真实 reasoning_content 展开/收起；复制回答得到包含代码围栏的 Markdown。 |
| 历史 | 重载后恢复 user/assistant、附件链接、推理与已保存笔记入口；HMR 调整源码期间的临时重置不作为稳定产品验收。 |
| 分支 | 编辑最后一条用户消息并重新发送，出现新可见分支；保存当前回答成功，入口变为“打开笔记”。精确 canonical ID/弃置分支来源由 HTTP 回归覆盖，不仅凭相同 fixture 正文判断。 |
| 引用 | 点击“mimir 产品说明”的真实检索引用，进入对应文档并显示“已定位引用原文”。 |
| 侧栏 | 文档问 AI 初始检索本文，可选择全部文档；模型和推理菜单保持输入框内；输入草稿后关闭/重开仍保留。 |
| 排队 | 生成中 Enter 出现独立队列，正常完成后第二条自动发送，最终两条回答均完成。 |
| 停止 | 稳定重载后复现旧代码点击停止误发回填队列，定位为同一 DOM button 从 button 切换 submit 后触发默认表单动作。修复先 preventDefault；最终再次重载，流式第一条+排队第二条+点击停止，第二条仅回填草稿，未成为 user 消息，界面恢复发送。 |
| 尺寸 | 主视图实际观察深色1280×720，浅色1440×900、1100×853、880×853、600×853；600宽 scrollWidth=600。侧栏浅色1100、600及390×720均观察，390宽 scrollWidth=390，控件可换行。 |
| 聚焦/悬停 | 主视图1100宽输入框表单 border=1px，hover/focus 均为796×113，坐标不变；更宽视图对照消息808与composer856含gutter的冻结尺寸约定。 |
| 键盘 | Enter发送/排队；模型菜单Escape关闭并把焦点还给触发按钮。原生中文IME/读屏未全平台执行。 |

## 截图

- `screenshots/main-final.jpg`：最终冻结产品源码的浅色截图。
- `screenshots/main-dark.jpg`
- `screenshots/main-light-1440.jpg`、`main-light-1100.jpg`、`main-light-880.jpg`、`main-light-600.jpg`
- `screenshots/queue-live.jpg`：修复前队列已正确入队，不能单独证明停止通过。
- `screenshots/branch-saved.jpg`、`screenshots/image-preview.jpg`
- `screenshots/sidebar-light.jpg`、`sidebar-light-600.jpg`、`sidebar-light-390.jpg`
- `screenshots/stop-restored-final.jpg`：最终冻结源码重载后的停止保稿。

## 证据边界

`parity.md/json` 的71组379来源态及24附件态是实现/测试/原型来源映射，不能解释为403条真实 GUI 全部操作通过。工具无正文、连续轮次来源、Agent原目标/版本/截图守卫、缓存续传不重执行、上传取消迟到/GC/多格式字节解析，使用真实HTTP/worker/数据库及可控异步回归；没有逐项用图形界面再次执行。原生Electron窗口、系统输入法与读屏、真实外部付费模型供应商兼容性未认证。Web与Desktop生产构建另见质量门记录。验收后已重置临时viewport并恢复原先跟随系统主题，关闭隔离验收标签页。
