import { createFileRoute, lazyRouteComponent, redirect } from '@tanstack/react-router'

/** Web opts into the public site; desktop keeps its direct workspace entry. */
export const Route = createFileRoute('/')({
  beforeLoad: ({ context }) => {
    if (!context.publicHome) throw redirect({ to: '/docs', search: { scope: 'all' } })
  },
  component: lazyRouteComponent(
    () => import('../components/marketing/OfficialSite'),
    'OfficialSite',
  ),
})
