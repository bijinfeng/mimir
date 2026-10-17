/**
 * `@mimir/chat` 的公开面。
 *
 * ## 这个包是什么
 *
 * 对话面板：消息区、检索过程、引用、失败卡、输入区。它自带**状态层**
 * （`@assistant-ui/react` 的运行时 + AG-UI 客户端），宿主只提供
 * 「数据」与「动作」（`ChatIo` + `composerStatus`）。
 *
 * ## 只导出下面这些
 *
 * 内部文件（parts / composer / runtime 下的具体实现）不导出：
 * 它们是**实现细节**，导出等于承诺。宿主需要什么，从这一层加——
 * 加的时候要问「这是宿主的职责吗」，而不是「顺手能用」。
 *
 * ## 主题怎么进来（宿主必读）
 *
 * - **antd token 不需要桥**：包内样式全走 `antd-style` 的 `createStyles`，
 *   它内部就是宿主的 `theme.useToken()`，自动继承外观与自定义 token
 * - **字号需要桥**：宿主必须在面板祖先上挂 `--mimir-chat-font-*` 七档
 *   （值取自宿主的 `FONT_SIZE`），见 `ChatHostVars`
 * - **`--mimir-chat-gutter`**：主视图吃默认 40px；窄栏（侧栏）覆写成 16px
 *
 * 挂错位置的表现是「样式全都退回回退值」——界面能用、字号与设计稿差
 * 半个像素，不报错（与 `editor-theme-bridge.ts` 同一条坑）。
 */
export { ChatPanel } from './ChatPanel.js'
export { ChatHostVars } from './ChatHostVars.js'
export { DEFAULT_CHAT_URL } from './runtime/io.js'
export type {
  ChatPanelProps,
  ChatComposerStatus,
  ChatDraft,
  ChatPptxSnapshot,
  ChatDraftAgent,
  ChatIo,
  ChatDocxAgent,
  ChatDocumentAgent,
} from './types.js'
export type { MimirChatApi } from './runtime/chat-context.js'
