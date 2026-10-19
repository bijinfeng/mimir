import { Button, Switch } from 'antd'
import { createStyles } from 'antd-style'
import { DOCUMENT_FONT_SIZE } from './DocumentPanel.style'

export function DocxCapabilityStatus({
  modelStatus,
  loading,
  canvasReady = true,
  error,
  onRetry,
  onSettings,
  revisionMode,
  onRevisionModeChange,
}: {
  modelStatus: 'loading' | 'error' | 'empty' | 'available'
  loading: boolean
  canvasReady?: boolean
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
      {loading ? (
        <p className={styles.detail} role="status">
          正在检测当前文档能力…
        </p>
      ) : error ? (
        <div className={styles.detail} role="alert">
          读取编辑能力失败。
          <Button type="link" size="small" onClick={onRetry}>
            重试检测
          </Button>
        </div>
      ) : !canvasReady ? (
        <p className={styles.detail} role="status">
          原件画布尚未就绪，暂时不能编辑。
        </p>
      ) : modelStatus === 'loading' ? (
        <p className={styles.detail} role="status">
          正在读取模型列表…
        </p>
      ) : modelStatus === 'error' ? (
        <p className={styles.detail} role="alert">
          模型列表读取失败，请在输入框重试。
        </p>
      ) : modelStatus === 'empty' ? (
        <div className={styles.detail}>
          尚未配置可用的模型。
          <Button type="link" size="small" onClick={() => onSettings('models')}>
            配置模型
          </Button>
        </div>
      ) : (
        <p className={styles.detail} role="status">
          {revisionMode
            ? '修订模式已开启，DOCX编辑结果保留待审阅。'
            : '修订模式已关闭，编辑会直接更新DOCX原件。'}
          工具能力以输入框所选模型为准。
        </p>
      )}
    </section>
  )
}

const useStyles = createStyles(({ css, token }) => ({
  wrap: css`
    flex: none;
    padding: 16px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
    font-size: ${DOCUMENT_FONT_SIZE.control}px;
    color: ${token.colorTextSecondary};
  `,
  detail: css`
    display: block;
    line-height: 1.8;
    margin: 8px 0 0;
    overflow-wrap: anywhere;
  `,
  revision: css`
    display: flex;
    align-items: center;
    gap: 8px;
    color: ${token.colorText};
  `,
}))
