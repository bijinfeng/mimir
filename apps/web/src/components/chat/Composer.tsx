import { SendOutlined } from '@ant-design/icons'
import { Button, Input, Switch, Tag, Tooltip } from 'antd'
import { createStyles } from 'antd-style'
import { useState } from 'react'
import { FONT_SIZE } from '@/theme/tokens'

/**
 * 输入区。
 *
 * 三样东西常驻可见：
 *  - 范围 pill —— 从文档工具条进来时自动锁到「当前文档」（`docs/PRD.md` §5.5）
 *  - 深度思考开关 —— 决定用推理模型还是对话模型
 *  - 当前模型名 —— 用户有权知道自己这句话会发给哪个模型
 */

export interface ComposerProps {
  /** 预填内容（从「就这段提问」带进来的引用） */
  initialText?: string
  /** 锁定到某一篇时显示范围 pill */
  scopedDocumentId?: string | undefined
  /** 清除范围锁定。不传时范围 pill 不可关闭 */
  onClearScope?: () => void
  disabled: boolean
  onSend: (text: string, deepReasoning: boolean) => void
}

const useStyles = createStyles(({ css, token }) => ({
  wrap: css`
    flex: none;
    padding: 12px 0 18px;
    border-top: 1px solid ${token.colorBorderSecondary};
    background: ${token.colorBgContainer};
  `,
  inner: css`
    max-width: 860px;
    margin: 0 auto;
    padding: 0 40px;
  `,
  box: css`
    border: 1px solid ${token.colorBorder};
    border-radius: 12px;
    background: ${token.colorBgContainer};
    padding: 10px 12px 8px;
    transition:
      border-color 0.12s ease-out,
      box-shadow 0.12s ease-out;

    &:focus-within {
      border-color: ${token.colorPrimary};
      box-shadow: 0 0 0 3px rgba(22, 119, 255, 0.1);
    }
  `,
  bar: css`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 7px;
  `,
  model: css`
    font-family: ${token.fontFamilyCode};
    font-size: ${FONT_SIZE.badge}px;
    color: ${token.colorTextTertiary};
    padding: 2px 7px;
    border-radius: 5px;
    background: ${token.colorFillQuaternary};
    white-space: nowrap;
  `,
}))

export function Composer({
  initialText = '',
  scopedDocumentId,
  onClearScope,
  disabled,
  onSend,
}: ComposerProps) {
  const { styles } = useStyles()
  const [text, setText] = useState(initialText)
  const [deepReasoning, setDeepReasoning] = useState(false)

  const submit = () => {
    const value = text.trim()
    if (!value || disabled) return
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
            autoSize={{ minRows: 1, maxRows: 6 }}
            variant="borderless"
            placeholder={scopedDocumentId ? '就这一篇提问…' : '直接向知识库提问…'}
            disabled={disabled}
          />

          <div className={styles.bar}>
            <Tooltip title="用推理模型回答，更慢但更适合复杂问题">
              <Switch
                size="small"
                checked={deepReasoning}
                onChange={setDeepReasoning}
                checkedChildren="深度思考"
                unCheckedChildren="深度思考"
              />
            </Tooltip>

            {scopedDocumentId ? (
              <Tag closable variant="filled" onClose={onClearScope} style={{ marginInlineEnd: 0 }}>
                范围：当前文档
              </Tag>
            ) : (
              <Tag variant="filled" style={{ marginInlineEnd: 0 }}>
                范围：整个知识库
              </Tag>
            )}

            <span style={{ flex: 1 }} />
            <span className={styles.model}>
              {deepReasoning ? 'deepseek-reasoner' : 'deepseek-chat'}
            </span>

            <Button
              type="primary"
              size="small"
              icon={<SendOutlined />}
              loading={disabled}
              disabled={!text.trim()}
              onClick={submit}
            >
              发送
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
