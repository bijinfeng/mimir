import { SendOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Button, Input, Switch, Tag, Tooltip } from 'antd'
import { createStyles } from 'antd-style'
import { useState } from 'react'
import { FONT_SIZE } from '@/theme/tokens'
import { api } from '@/lib/api'

/**
 * 输入区。
 *
 * 两样东西常驻可见：
 *  - 深度思考开关 —— 决定用推理模型还是对话模型
 *  - 当前模型名 —— 用户有权知道自己这句话会发给哪个模型。
 *    **从运行时配置读**（`/api/config` 的角色绑定），不硬编码供应商的模型名：
 *    配置换了模型而界面还报旧名字，是在说谎（D-047 清理项）
 *
 * 范围 pill 只在锁定到某一篇时出现（从文档工具条进来，`docs/PRD.md` §5.5）；
 * 「范围：整个知识库」是永久默认值，常驻显示不携带信息（D-047 清理项）。
 */

export interface ComposerProps {
  /** 预填内容（从「就这段提问」带进来的引用） */
  initialText?: string
  /** 锁定到某一篇时显示范围 pill */
  scopedDocumentId?: string | undefined
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

    /*
     聚焦时不换边框色，改用一圈柔光 + 边框提亮（DESIGN §8.8）。
     柔光用 token.controlOutline 而不是字面量 rgba：
     它是 antd 按当前主色与底色算好的半透明主色，换外观时会跟着变
     （浅色 rgba(5,145,255,.1)、深色 rgba(23,117,249,.31)——
     深色的不透明度更高，因为它在深底上要更亮才看得出来）。
     原先写死的 rgba(22,119,255,.1) 在深色下几乎不可见。
    */
    &:focus-within {
      border-color: ${token.colorPrimaryBorder};
      box-shadow: 0 0 0 3px ${token.controlOutline};
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

export function Composer({ initialText = '', scopedDocumentId, disabled, onSend }: ComposerProps) {
  const { styles } = useStyles()
  const [text, setText] = useState(initialText)
  const [deepReasoning, setDeepReasoning] = useState(false)

  /**
   * 角色绑定的模型名。从设置读而不是硬编码：用户在设置页换过模型后，
   * 这里显示的必须是**这一次提问真的会发给**的那个。
   * 配置未就绪/角色未绑定时显示占位——比显示一个可能错误的模型名诚实。
   */
  const configQuery = useQuery({ queryKey: ['config'], queryFn: api.config })
  const roleName = deepReasoning ? 'reasoning' : 'chat'
  const modelName = configQuery.data?.modelConfig.roles.find(
    (role) => role.role === roleName,
  )?.model

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

            {scopedDocumentId && (
              <Tag variant="filled" style={{ marginInlineEnd: 0 }}>
                范围：当前文档
              </Tag>
            )}

            <span style={{ flex: 1 }} />
            <span className={styles.model}>{modelName ?? '…'}</span>

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
