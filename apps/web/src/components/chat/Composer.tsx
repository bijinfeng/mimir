import { Button, Input, Tag } from 'antd'
import { createStyles } from 'antd-style'
import { Send, Square } from 'lucide-react'
import { useState } from 'react'
import {
  AddContextDropdown,
  ContextUsageChip,
  ModelDropdown,
  StrengthDropdown,
} from '@/components/chat/composer/ComposerMenus'
import type { ContextDoc } from '@/components/chat/composer/ComposerMenus'

/**
 * 输入区。
 *
 * Codex 式底栏（用户拍板）：上面是输入框（3 行起、自动长高到 8 行），
 * 下面一条工具栏分两组——
 *
 *  - **左**：+ 添加上下文（把本轮检索范围锁到某篇文档）、范围 pill、
 *    上下文容量（usageLog 里该会话最近一次请求的真实 promptTokens）。
 *    原来的「未配置模型」胶囊并入模型菜单。
 *  - **右**：思考强度（标准 / 深入 = 对话角色 / 推理角色）、当前模型、
 *    发送 / 停止。原来的「深度思考」开关升级成了强度下拉——M0 的
 *    思考强度就是这条角色轴，真正的 effort 透传要等后端加参数。
 *
 * 范围的语义：`draft` 锁定（从文档工具条「问 AI」进来）与「+ 添加上下文」
 * 所选**共用同一个状态**（`contextDocument`），都以每轮发送的 documentId
 * 覆盖挂载值（见 `use-mimir-chat` 的 send）——移除 pill 就回到整个知识库。
 */

export interface ComposerProps {
  initialText?: string
  /**
   * 正在生成。发送键换成「停止」，输入框转只读。
   *
   * **不是 `disabled`**：`disabled` 连焦点都拿不到，用户按不到 Esc 也看不到
   * 自己刚打的字；`readOnly` 是「现在不能发，但字还在、还能选中复制」。
   */
  busy: boolean
  /** 会话 id：容量 chip 用它查最近一次请求的真实 token 记账（usageLog.refId） */
  conversationId?: string | undefined
  /** 本轮检索范围（draft 锁定或「+ 添加上下文」所选）；null = 整个知识库 */
  contextDocument?: ContextDoc | undefined
  onContextDocumentChange: (doc: ContextDoc | null) => void
  onSend: (text: string, deepReasoning: boolean) => void
  onStop: () => void
}

const useStyles = createStyles(({ css, token, prefixCls }) => ({
  wrap: css`
    flex: none;
    padding: 12px 0 18px;
    /* 与消息列表的界线不在这里画（D-070）：显形开关在 ChatPanel——
       消息列表的 scrollTop 归它管，线画在包着本组件的 composerLine 上 */
    background: ${token.colorBgContainer};
  `,
  inner: css`
    max-width: 860px;
    margin: 0 auto;
    padding: 0 40px;
  `,
  /* 圆角 14px 与内边距取自 DESIGN §8.8（原型实测值）：这是页面上最大的
     单个控件，圆角比面板的 8px 大一档，才不会被看成一个普通的输入框 */
  box: css`
    border: 1px solid ${token.colorBorder};
    border-radius: 14px;
    background: ${token.colorBgContainer};
    padding: 12px 14px 9px;
    transition:
      border-color 0.12s ease-out,
      box-shadow 0.12s ease-out;

    &:focus-within {
      border-color: ${token.colorPrimaryBorder};
      box-shadow: 0 0 0 3px ${token.controlOutline};
    }

    /*
     * 输入框不画自己的焦点环——**外层盒子才是容器**（DESIGN §8.8）。
     * antd v6 给聚焦的输入类控件加了 focusOutline（实测计算样式
     * outline: rgb(22,119,255) solid 1px），叠在盒子的聚焦边框上就是
     * 用户看到的两层边框。命令面板当年为同一条关过三处（DESIGN §8.6），
     * 这里是第四处。
     */
    .${prefixCls}-input {
      &:focus,
      &:focus-within,
      &:hover {
        outline: none;
        box-shadow: none;
      }
    }
  `,
  bar: css`
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 7px;
  `,
  barGroup: css`
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
  `,
  pill: css`
    max-width: 200px;
    /* antd Tag 自带右外边距，会跟关闭按钮之间留出一条缝 */
    margin-inline-end: 0;
  `,
}))

export function Composer({
  initialText = '',
  busy,
  conversationId,
  contextDocument,
  onContextDocumentChange,
  onSend,
  onStop,
}: ComposerProps) {
  const { styles } = useStyles()
  const [text, setText] = useState(initialText)
  const [deepReasoning, setDeepReasoning] = useState(false)

  const submit = () => {
    const value = text.trim()
    if (!value || busy) return
    setText('')
    onSend(value, deepReasoning)
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.inner}>
        <div className={styles.box}>
          <Input.TextArea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onPressEnter={(event) => {
              // Enter 发送、Shift+Enter 换行是聊天框的通行约定
              if (!event.shiftKey) {
                event.preventDefault()
                submit()
              }
            }}
            onKeyDown={(event) => {
              /**
               * 生成中按 Esc 停止。
               *
               * `!isComposing` 不能省：中文输入法里 Esc 是**取消候选词**，
               * 这时按下去不该把正在生成的回答也停掉。rc-input 对 Enter
               * 就是这么挡的（`@rc-component/input/es/TextArea.js:101` 的
               * `e.key === 'Enter' && !e.nativeEvent.isComposing`），
               * 这里照同一个判据。
               */
              if (event.key === 'Escape' && busy && !event.nativeEvent.isComposing) {
                event.preventDefault()
                onStop()
              }
            }}
            autoSize={{ minRows: 3, maxRows: 8 }}
            variant="borderless"
            placeholder={
              busy
                ? '正在生成，按 Esc 停止'
                : contextDocument
                  ? `就「${contextDocument.title}」提问…`
                  : '直接向知识库提问…'
            }
            readOnly={busy}
          />

          <div className={styles.bar}>
            <div className={styles.barGroup}>
              <AddContextDropdown onPick={onContextDocumentChange} />
              {contextDocument && (
                <Tag
                  closable
                  onClose={() => onContextDocumentChange(null)}
                  className={styles.pill}
                  title={`本轮检索范围：${contextDocument.title}`}
                >
                  范围：{contextDocument.title}
                </Tag>
              )}
              <ContextUsageChip conversationId={conversationId} />
            </div>
            <span style={{ flex: 1 }} />
            <div className={styles.barGroup}>
              <StrengthDropdown value={deepReasoning} onChange={setDeepReasoning} />
              <ModelDropdown deepReasoning={deepReasoning} />
              {busy ? (
                <Button
                  size="small"
                  icon={<Square size={16} fill="currentColor" />}
                  onClick={onStop}
                  aria-label="停止"
                />
              ) : (
                <Button
                  type="primary"
                  size="small"
                  icon={<Send size={16} />}
                  disabled={!text.trim()}
                  onClick={submit}
                  aria-label="发送"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
