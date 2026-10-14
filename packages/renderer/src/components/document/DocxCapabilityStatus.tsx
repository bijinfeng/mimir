import type { DocxAgentCapabilities } from '@mimir/shared'
import { Button, Switch } from 'antd'
import { createStyles } from 'antd-style'
import { FONT_SIZE } from '../../theme/tokens'

export function DocxCapabilityStatus({
  capabilities,
  loading,
  error,
  onRetry,
  onSettings,
  revisionMode,
  onRevisionModeChange,
}: {
  capabilities?: DocxAgentCapabilities
  loading: boolean
  error: boolean
  onRetry: () => void
  onSettings: (section: 'models' | 'network-search') => void
  revisionMode: boolean
  onRevisionModeChange: (enabled: boolean) => void
}) {
  const { styles } = useStyles()

  return (
    <section className={styles.wrap} aria-label="AI 修订设置" aria-busy={loading}>
      <div className={styles.revision}>
        <span>AI 修订</span>
        <Switch
          size="small"
          aria-label="AI 修订"
          checked={revisionMode}
          onChange={onRevisionModeChange}
        />
      </div>
      {error ? (
        <div className={styles.detail} role="alert">
          能力状态读取失败。
          <Button type="link" size="small" onClick={onRetry}>
            重试
          </Button>
        </div>
      ) : !loading && capabilities && !capabilities.modelReady ? (
        <div className={styles.detail}>
          需要聊天模型
          <Button type="link" size="small" onClick={() => onSettings('models')}>
            模型设置
          </Button>
        </div>
      ) : null}
    </section>
  )
}

const useStyles = createStyles(({ css, token }) => ({
  wrap: css`
    flex: none;
    padding: 8px 16px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
    font-size: ${FONT_SIZE.meta}px;
    color: ${token.colorTextSecondary};
  `,
  detail: css`
    display: block;
    line-height: 1.5;
  `,
  revision: css`
    display: flex;
    align-items: center;
    gap: 8px;
    color: ${token.colorText};
  `,
}))
