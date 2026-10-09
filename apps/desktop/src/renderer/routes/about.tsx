import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Descriptions, Skeleton, Typography } from 'antd'
import { createStyles } from 'antd-style'
import { desktopBridge } from '@/lib/desktop-bridge'

/**
 * 「关于」页——**客户端专属**（D-104）。
 *
 * ## 它为什么是桌面端自己的路由
 *
 * 这一页显示的全部是**载体的事实**：应用版本（`app.getVersion()`）、
 * 数据根在本机哪个目录、当前是哪种使用方式。浏览器部署里一件都不存在——
 * 那边既没有「版本」（它就是当前访问的那个服务端），也没有「本机数据目录」。
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
    padding: 24px;
    background: ${token.colorBgContainer};
  `,
  card: css`
    max-width: 680px;
  `,
}))

function AboutPage() {
  const { styles } = useStyles()

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
      <div className={styles.card}>
        <Typography.Title level={4}>关于 mimir</Typography.Title>
        <Typography.Paragraph type="secondary">
          自托管的个人知识库。这一页显示的是这台电脑上这个客户端的事实。
        </Typography.Paragraph>

        {boot.isLoading ? (
          <Skeleton active paragraph={{ rows: 3 }} title={false} />
        ) : (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="版本">{boot.data?.version ?? '读取中…'}</Descriptions.Item>
            <Descriptions.Item label="使用方式">
              {boot.data?.mode === 'local'
                ? '本地使用（数据在这台电脑上）'
                : boot.data?.mode === 'cloud'
                  ? '连接服务器'
                  : '未知'}
            </Descriptions.Item>
            {/*
              数据目录**只有本地模式有**（云端模式下数据在服务端，本机只有一个壳）。
              那条不变量写在 `DesktopBootInfo.dataDir` 的类型里（可空），
              所以这里是「有就显示」而不是「显示一个空值」。
            */}
            {boot.data?.dataDir ? (
              <Descriptions.Item label="数据目录">{boot.data.dataDir}</Descriptions.Item>
            ) : null}
            <Descriptions.Item label="窗口加载的地址">
              {boot.data?.origin ?? '未知'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </div>
    </div>
  )
}
