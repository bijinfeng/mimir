import { Outlet, createRootRouteWithContext, redirect, useRouter } from '@tanstack/react-router'
import { Button, Result, Space } from 'antd'
import { ApiRequestError, api } from '../lib/api'
import { useDesktopBridge } from '../platform'
import type { RouterContext } from '../lib/router-context'

export const Route = createRootRouteWithContext<RouterContext>()({
  /**
   * 鉴权守卫放在根路由，而不是每个页面各写一遍。
   *
   * 这样新增页面时不需要记得加守卫——漏加一个未鉴权的页面，
   * 在自托管暴露公网的情况下等于把整个知识库交出去。
   */
  beforeLoad: async ({ location }) => {
    const session = await api.auth.session()

    if (!session && location.pathname !== '/login') {
      throw redirect({ to: '/login', search: { redirect: location.href } })
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
   * 与设置页的空态同一个形态（`docs/DESIGN.md` §7.4：不留一个没有动作的空态）。
   */
  errorComponent: RootError,
})

function RootError({ error, reset }: { error: unknown; reset: () => void }) {
  const router = useRouter()
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

  return (
    <Result
      status="warning"
      title={reachable ? '服务端出错了' : '连不上服务端'}
      subTitle={
        reachable
          ? `服务端返回了 ${status}。它可能正在重启，或者请求被中间的一层拦下了。`
          : '请确认服务在运行（docker compose ps），以及客户端指向的地址是对的。'
      }
      extra={
        <Space>
          <Button
            type="primary"
            onClick={() => {
              /**
               * **必须 `invalidate()`，不能只 `reset()`。**
               *
               * 这里的错误是在渲染期抛出的（`beforeLoad` 失败的路由会把错误
               * 抛给 React），所以 `reset()` 只是让边界清掉错误状态、再渲染一次
               * 同一棵子树——而那个 match 仍是 `error`，它会立刻重新抛出，
               * 用户看到的是「点了没反应」。
               *
               * `invalidate()` 让路由重新跑一遍 `beforeLoad`（最常见的情况是
               * 服务端刚好起来了）。重跑完再 `reset()` 清掉边界：
               * 成功了就正常进页面，失败了就用新的错误再走一次这一屏。
               */
              void router.invalidate().finally(() => reset())
            }}
          >
            重试
          </Button>
          {bridge ? <Button onClick={() => bridge.mode.openSetup()}>更换使用方式…</Button> : null}
        </Space>
      }
    />
  )
}
