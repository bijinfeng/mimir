import { QueryClient } from '@tanstack/react-query'

/**
 * TanStack Query 的全局配置。
 *
 * staleTime 设成 30 秒是刻意的：这是个人自托管的单用户应用，
 * 数据只被自己改动，没有多端竞争，没必要每次挂载都重新拉。
 * 但也不能设成 Infinity——外部编辑器改了 vault 里的文件之后，
 * 重建索引的结果需要能看到。
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        // 4xx 是确定性的失败，重试没有意义；5xx 才值得重试
        const status = (error as { status?: number }).status
        if (status && status >= 400 && status < 500) return false
        return failureCount < 2
      },
      refetchOnWindowFocus: false,
    },
  },
})
