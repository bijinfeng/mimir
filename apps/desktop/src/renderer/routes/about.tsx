import { getAppearance } from '@mimir/renderer/titlebar-kit'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Alert, Button, Skeleton, Typography } from 'antd'
import { ArrowLeft } from 'lucide-react'
import { createStyles } from 'antd-style'
import { desktopBridge } from '@/lib/desktop-bridge'
import { useUpdateState } from '@/lib/use-update-state'

/**
 * 「关于」页——**客户端专属**（D-104）。
 *
 * ## 它为什么是桌面端自己的路由
 *
 * 这一页显示桌面客户端的版本和当前使用方式。浏览器部署里没有客户端版本。
 *
 * 放进共享路由再加条件渲染的话，浏览器侧会多出一条**永远到不了的路由**：
 * 类型上 `to="/client/about"` 合法、点进去是一片说不出话的空白。
 * 现在它只存在于桌面端那次构建里（见 `electron.vite.config.ts` 的
 * `extraRoutes`），web 侧写这个 `to` 是类型错。
 *
 * 路径是 `/client/about`：`/client` 前缀由构建配置给，这个文件名决定后半段。
 */
export const Route = createFileRoute('/client/about')({
  component: AboutPage,
})

const useStyles = createStyles(({ css, token }) => ({
  page: css`
    height: 100%;
    overflow-y: auto;
    padding: 24px clamp(24px, 4vw, 48px) 40px;
    background: ${token.colorBgContainer};
  `,
  back: css`
    && {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 32px;
      margin: 0 0 8px -8px;
      padding-inline: 8px;
      color: ${token.colorTextSecondary};
    }
    &&:hover {
      color: ${token.colorText};
    }
  `,
  content: css`
    max-width: 730px;
  `,
  heading: css`
    margin: 0 0 20px !important;
  `,
  section: css`
    border-top: 1px solid ${token.colorBorderSecondary};
    padding-top: 8px;
  `,
  row: css`
    display: flex;
    gap: 16px;
    padding: 12px 0;
    border-bottom: 1px solid ${token.colorBorderSecondary};
    @media (max-width: 600px) {
      flex-direction: column;
      gap: 4px;
    }
  `,
  label: css`
    width: 124px;
    flex: none;
    color: ${token.colorTextSecondary};
  `,
  version: css`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
    min-width: 0;
    overflow-wrap: anywhere;
  `,
  value: css`
    min-width: 0;
    overflow-wrap: anywhere;
    color: ${token.colorText};
  `,
}))

export function AboutPage() {
  const { styles } = useStyles()
  const { state: update } = useUpdateState(desktopBridge?.update)

  /**
   * boot 信息走 react-query 而不是 useEffect + useState：
   * 它是一次异步读取，而缓存、重试、加载态那三件事不该在这里手写一遍。
   */
  const boot = useQuery({
    queryKey: ['desktop-boot'],
    queryFn: async () => (await desktopBridge?.boot()) ?? null,
  })

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <Button
          type="text"
          className={styles.back}
          icon={<ArrowLeft size={16} aria-hidden />}
          onClick={() => window.history.back()}
        >
          返回
        </Button>
        <Typography.Title level={2} className={styles.heading}>
          关于 mimir
        </Typography.Title>
        {boot.isLoading ? (
          <Skeleton active paragraph={{ rows: 2 }} title={false} />
        ) : boot.isError || !boot.data ? (
          <Alert
            type="error"
            showIcon
            title="暂时无法读取客户端信息"
            action={<Button onClick={() => void boot.refetch()}>重试</Button>}
          />
        ) : (
          <div className={styles.section}>
            <div className={styles.row}>
              <span className={styles.label}>版本</span>
              <div className={styles.version}>
                <span className={styles.value}>{boot.data.version}</span>
                {desktopBridge?.update && (
                  <Button onClick={() => desktopBridge?.update.open(getAppearance())}>
                    {update?.status === 'downloaded'
                      ? '可重启更新'
                      : update?.status === 'downloading'
                        ? '更新下载中'
                        : update?.status === 'available'
                          ? '查看新版本'
                          : '检查更新'}
                  </Button>
                )}
              </div>
            </div>
            <div className={styles.row}>
              <span className={styles.label}>使用方式</span>
              <span className={styles.value}>
                {boot.data.mode === 'local' ? '本地使用' : '连接服务器'}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
