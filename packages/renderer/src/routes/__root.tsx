import {
  Outlet,
  createRootRouteWithContext,
  redirect,
  useRouter,
  useRouterState,
} from '@tanstack/react-router'
import { Button, Result } from 'antd'
import { createStyles } from 'antd-style'
import { TriangleAlert } from 'lucide-react'
import { useRef, useState } from 'react'
import { ApiRequestError, api } from '../lib/api'
import { useDesktopBridge, useTitleBar } from '../platform'
import { FONT_SIZE } from '../theme/tokens'
import type { RouterContext } from '../lib/router-context'

export const Route = createRootRouteWithContext<RouterContext>()({
  /**
   * 鉴权守卫放在根路由，而不是每个页面各写一遍。
   *
   * 这样新增页面时不需要记得加守卫——漏加一个未鉴权的页面，
   * 在自托管暴露公网的情况下等于把整个知识库交出去。
   */
  beforeLoad: async ({ location, context }) => {
    // pathname is already stripped of the router basepath. No auth or private
    // data is needed for this exact, explicitly enabled public surface.
    if (context.publicHome && location.pathname === '/') return { session: null }

    const session = await api.auth.session()

    if (!session && location.pathname !== '/login') {
      throw redirect({ to: '/login', search: { redirect: location.publicHref } })
    }
    if (session && location.pathname === '/login') {
      throw redirect({ to: '/docs', search: { scope: 'all' } })
    }

    return { session }
  },
  component: () => <Outlet />,
  /**
   * 根路由的错误兜底。
   *
   * ## 为什么必须有
   *
   * 守卫在 `beforeLoad` 里请求会话（`api.auth.session()`）。这个请求**会失败**：
   * 服务端重启、容器没起来、Electron 客户端指错地址、代理挂了——而
   * `beforeLoad` 抛出的非 redirect 错误如果没有 `errorComponent`，
   * TanStack Router 就渲染它自带的英文开发页：整页只有
   * `Something went wrong!` + `Hide Error` + 一条红框 `Failed to fetch`，
   * 没有卡片、没有表单，控制台还打一条
   * 「The following error wasn't caught by any route!」。自托管的单用户产品里
   * 这几种情况都会发生，而这恰好是**唯一一个别的都坏了它也得在**的页面。
   *
   * ## 文案不直接透传 error.message
   *
   * `Failed to fetch` 是浏览器给的英文。这里按「用户下一步做什么」分两类：
   * 服务端给了响应但状态不对（401 之外的 HTTP 错误）说服务端那边的事，
   * 拿不到响应说连不上。两类都给一个「重试」——刷新是唯一有效的动作，
   * 而用户不该自己猜着按 F5。
   *
   * 用 antd 的 `Result`：图标、标题、动作三段的层级它已经定好了，
   * 与设置页的空态同一个形态（`.trellis/spec/project/design.md` §7.4：不留一个没有动作的空态）。
   */
  errorComponent: RootError,
})

const noop = () => {}

const useErrorStyles = createStyles(({ css, token }) => ({
  shell: css`
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: ${token.colorBgLayout};
  `,
  page: css`
    flex: 1;
    min-height: 0;
    display: flex;
    overflow: auto;
    padding: 24px;
  `,
  result: css`
    width: min(100%, 480px);
    min-width: 0;
    flex: none;
    margin: auto;
    padding: 24px 0;
    overflow-wrap: anywhere;
  `,
  icon: css`
    margin-bottom: 16px;
    color: ${token.colorWarning};
    line-height: 1;
  `,
  heading: css`
    margin: 0;
    color: ${token.colorText};
    font-size: ${FONT_SIZE.pageTitle}px;
    font-weight: 600;
    line-height: ${token.lineHeightHeading3};
  `,
  description: css`
    margin-top: 12px;
    color: ${token.colorTextSecondary};
    font-size: ${FONT_SIZE.body}px;
    line-height: ${token.lineHeight};
  `,
  extra: css`
    margin-top: 24px;
  `,
  actions: css`
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 8px;
  `,
}))

function RootError({ error, reset }: { error: unknown; reset: () => void }) {
  const { styles } = useErrorStyles()
  const router = useRouter()
  const [retrying, setRetrying] = useState(false)
  const retryingRef = useRef(false)
  // The router may replace its error boundary after another failed attempt.
  // Its loading state survives that remount, unlike this component's state.
  const routeLoading = useRouterState({ select: (state) => state.isLoading })
  const busy = retrying || routeLoading
  const titleBar = useTitleBar({ collapsed: false, onToggleCollapsed: noop, showToggle: false })
  const status = error instanceof ApiRequestError ? error.status : null

  /**
   * `Failed to fetch` 这类没有响应的错误。判据是「我们有没有拿到状态码」，
   * 不是去匹配 message 的字符串——那句话随浏览器与语言变。
   */
  const reachable = status !== null

  /**
   * 桌面壳里多给一条出路（D-100 / D-103）：**连不上服务器时最需要的动作其实是
   * 「换一个地址或改用本地使用」**，而设置页此刻进不去（它也在远端）。
   * 「更换使用方式」把窗口带回客户端自己的选择页——那是唯一一个不依赖
   * 远端可用性的入口。
   *
   * 浏览器里不出现：那里没有桥，这一项也没有意义。
   */
  const bridge = useDesktopBridge()

  async function retry() {
    if (retryingRef.current || routeLoading) return
    retryingRef.current = true
    setRetrying(true)
    try {
      // Rerun beforeLoad before clearing the boundary. Reset alone would render
      // the same failed match and immediately show this error again.
      await router.invalidate()
    } catch {
      // A rejected refresh must also release the boundary to show the latest
      // route error, rather than leaving a disabled recovery action behind.
    } finally {
      retryingRef.current = false
      setRetrying(false)
      reset()
    }
  }

  return (
    <div className={styles.shell}>
      {titleBar}
      <main className={styles.page}>
        <Result
          className={styles.result}
          classNames={{ icon: styles.icon, subTitle: styles.description, extra: styles.extra }}
          status="warning"
          icon={<TriangleAlert size={40} aria-hidden="true" />}
          title={
            <h1 className={styles.heading}>{reachable ? '服务暂时不可用' : '暂时无法连接服务'}</h1>
          }
          subTitle={
            reachable
              ? '服务暂时无法完成请求，请稍后重试。'
              : '请检查网络连接后重试。如果仍无法连接，请确认服务地址是否正确。'
          }
          extra={
            <div className={styles.actions}>
              <Button
                type="primary"
                loading={busy}
                disabled={busy}
                aria-busy={busy}
                onClick={() => void retry()}
              >
                {busy ? '正在重试' : '重试'}
              </Button>
              {bridge ? (
                <Button onClick={() => bridge.mode.openSetup()}>更换使用方式…</Button>
              ) : null}
            </div>
          }
        />
      </main>
    </div>
  )
}
