import { createFileRoute, redirect } from '@tanstack/react-router'

/** 根路径没有内容，落到默认视图（收件箱） */
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/docs', search: { scope: 'inbox' } })
  },
})
