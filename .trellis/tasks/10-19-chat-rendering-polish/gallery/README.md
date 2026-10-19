# 对话真实组件场景

这个页面导入 `packages/chat` 的生产组件、真实 TanStack 官方 UI 与 SDK 历史重放，以及 renderer 的实际主题与 ChatThemeBridge。固定资料、供应商与 IO 是验收 fixture，不代表真实检索或模型输出；发送与上传须在实际产品环境验证。此页面主要用于同内容、同尺寸的渲染取证，不是另一套手绘产品实现。

从仓库根运行（归档后替换配置文件所在路径即可，配置会向上寻找 pnpm-workspace.yaml）：

```sh
pnpm --filter @mimir/web exec vite --config "$PWD/.trellis/tasks/10-19-chat-rendering-polish/gallery/vite.config.mjs" --host 127.0.0.1 --port 5194
```

构建到临时目录，避免将依赖 bundle 加入源码：

```sh
GALLERY_OUT=/private/tmp/mimir-chat-polish-after pnpm --filter @mimir/web exec vite build --config "$PWD/.trellis/tasks/10-19-chat-rendering-polish/gallery/vite.config.mjs"
```

`GALLERY_SOURCE_ROOT` 可指向由指定 Git commit 导出的仓库源快照；baseline 构建用此方式导入改动前的 Chat 与 renderer 主题/桥，而 fixture 源码、依赖版本和场景参数与 after 保持一致。具体 commit、bundle 哈希和截图清单由 verification 中的对比档案记录。

查询参数：

- `scene=reading`：多层标题、段落、嵌套列表、引用、原生表格、长代码、长路径、引用来源与回答动作。
- `scene=process`：经真实 SDK 重放的思考、工具调用/参数/结果、最终回答与引用；折叠可操作。
- `scene=states`：生产思考/工具状态展示、工具失败/分组、停止、流错误、图片预览、文件与外链来源。
- `scene=failure`：真实持久化 `quota` 失败形态与不同可用/禁用恢复动作。
- `scene=empty`：新会话空态与居中输入区。
- `scene=loading` / `history-error`：未结束的历史读取和读取失败恢复。
- `theme=light|dark`；`layout=main|sidebar`，侧栏宽 390px。

静态 fixture 的菜单、折叠、复制、编辑、图片预览等展示操作使用生产组件。保存、跳原文和管理模型通过演示宿主提供结果或提示；不声称验证真实服务端效果。真实 HTTP/SSE、队列保稿、附件上传与 Agent 守卫的证据另见产品验收。

## 媒体样例来源

`public/attachment.png` 是程序生成的文档缩略图 fixture；`fixture-audio.wav` 是程序生成的半秒低音量 440Hz 音频；`fixture-document.txt` 是本地示例文本。`fixture-video.mp4` 来自 MDN interactive-examples 的 CC0 flower 示例（https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4），仅用于原生视频控件展示与播放抽验，非 Mimir 用户资料或模型产物。
