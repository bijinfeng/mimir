import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * 根路径没有内容，落到默认视图（收件箱）。
 *
 * 用 `_app` 这个 layout 的默认 scope 而不是让用户看到空白页——
 * 单用户自托管应用没有「首页」的概念，直接进最常用的视图。
 */
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/docs', search: { scope: 'all' } })
  },
})
