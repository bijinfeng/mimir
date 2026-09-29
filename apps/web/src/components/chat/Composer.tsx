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
  /* 深度思考开关 + 它的标签。
     标签**放在轨道外面**：antd 的 Switch 把 children 渲染进轨道，而轨道
     底色取 colorTextQuaternary（antd/es/switch/style/index.js），
     那一档在 DESIGN §3.3 里的定位是「占位符与禁用态，不承载信息」——
     白字压上去实测 3.11:1。把标签移出来，它走文字阶（浅色 5.91:1），
     轨道回到纯图形，两边都不再互相将就。

     外面这层是 `<label>` 不是 `<span>`：Switch 渲染的是一个 `<button>`
     （可被 label 关联），所以点标签上的字仍然能拨动开关——这和标签原来
     长在轨道里时的可点范围一致。工具提示也挂在这一层上（antd 的 Tooltip
     包住的是整个「开关 + 文字」）。 */
  deepReason: css`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  `,
  deepReasonLabel: css`
    font-size: ${FONT_SIZE.item}px;
    color: ${token.colorTextSecondary};
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
   *
   * 兜底用 `||` 而不是 `??`：未配置时服务端给的是**空串**而不是 null，
   * `??` 挡不住它，渲染出的是一枚一个字都没有的灰胶囊（实测宽 14px）——
   * 看起来像没加载完，而它恰恰是用来告诉你「这句话会发给谁」的那个控件。
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
              <label className={styles.deepReason}>
                <Switch
                  size="small"
                  aria-label="深度思考"
                  checked={deepReasoning}
                  onChange={setDeepReasoning}
                />
                <span className={styles.deepReasonLabel}>深度思考</span>
              </label>
            </Tooltip>

            {scopedDocumentId && (
              <Tag variant="filled" style={{ marginInlineEnd: 0 }}>
                范围：当前文档
              </Tag>
            )}

            <span style={{ flex: 1 }} />
            <span className={styles.model}>{modelName || '未配置模型'}</span>

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
