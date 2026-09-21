import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { queryClient } from '@/lib/query'
import { router } from '@/router'
import { MimirProvider } from '@/theme/MimirProvider'

const container = document.getElementById('root')
if (!container) throw new Error('找不到 #root 挂载点')

createRoot(container).render(
  <StrictMode>
    {/* 主题、locale 与全局样式都在 MimirProvider 里接线，见 theme/MimirProvider.tsx */}
    <MimirProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </MimirProvider>
  </StrictMode>,
)
