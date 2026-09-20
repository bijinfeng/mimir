import { Outlet, createRootRouteWithContext, redirect } from '@tanstack/react-router'
import { api } from '@/lib/api'
import type { RouterContext } from '@/lib/router-context'

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
      throw redirect({ to: '/' })
    }

    return { session }
  },
  component: () => <Outlet />,
})
