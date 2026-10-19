# 对话与 Agent 交互打磨 HTML

本目录只包含独立设计原型，未修改 `packages/chat` 或 Renderer 产品代码。

- 默认打开 `review.html` 查看打磨后；`?mode=compare` 为同逻辑宽高前后比较，`?mode=current` 为当前列。
- `#scene=CHAT-007.focus` 等深链定位具体状态；左栏列出 71 个源码分组，上方状态栏对应 379 个语义状态。
- 画布默认 1140 × 853，支持 768 / 390px。适应窗口默认开启；关闭后可横向滚动核对原逻辑像素。两列共享画布尺寸。
- 浅深主题、200% 字体、减少动态、重置均为评审工具。底部“原型控制”手工投递读取/流式/保存/工具结果，不属于新产品入口。
- 操作图标为现有 Lucide；提案中的格式图标延用已选 A 方案的 Phosphor duotone，本地 SVG 与 MIT 许可放在 `assets/phosphor/`，最终内联。

## 重新生成

仓库已有依赖，不新增安装包。

```sh
python3 .trellis/tasks/10-18-interaction-chat/prototype/generate-manifest.py
node .trellis/tasks/10-18-interaction-chat/prototype/build.mjs
node .trellis/tasks/10-18-interaction-chat/prototype/check-artifact.mjs
packages/renderer/node_modules/.bin/tsc -p .trellis/tasks/10-18-interaction-chat/prototype/tsconfig.json
```

本地预览由仓库外运行中的 Python HTTP 服务在 5189 端口提供；HTML 自身可独立保存/打开，不依赖 Vite dev server 或远端图片。

## 交互与边界

普通输入 Enter 发送，生成中 Enter 排队、鼠标停止，Shift+Enter 换行，IME 不误发。检索、思考、工具诊断可分别展开。分类失败保留各自可用动作；暂未实现的动作禁用。模型菜单只读全局角色绑定。侧栏始终标准模式。

Agent 实时桥位于对话体之前；工具调用消息的 Args/Result 与历史工具摘要分别呈现。媒体选择、部分写作草稿保留/丢弃、回退、续传结果和新文件交接有独立轨道。续传仅重发缓存，版本变化拒绝旧结果。截图图文/队列/失败轮独立，失效不会覆盖新的输入。

379 为源码状态映射数量，52 为渲染轨道数量；不代表 379 项 GUI 实测。`coverage.json` 和 `checks.json` 区分映射与源码绑定。浏览器实测由任务 `verification/` 的记录单独给出。

本稿没有业务请求、本地持久化、真实模型、文件写入、剪贴板写入、PNG 截图、原生文件选择或播放。画布改动、接口结算、原图和下载均为边界模拟；Office 格式工具、实际保存与真实原件能力仍归各格式宿主。刷新/卸载不承诺恢复未发送图文。
