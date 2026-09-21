import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { App as AntApp, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { queryClient } from '@/lib/query'
import { router } from '@/router'
import { mimirTheme } from '@/theme/tokens'
import '@/styles/global.css'

const container = document.getElementById('root')
if (!container) throw new Error('找不到 #root 挂载点')

createRoot(container).render(
  <StrictMode>
    <ConfigProvider
      locale={zhCN}
      // 设计 token 在 theme/tokens.ts，规范见 docs/DESIGN.md——
      // 这里只负责接线，不放具体的值
      theme={mimirTheme}
    >
      {/* AntApp 提供 message/notification/modal 的 context 版本——
          静态方法拿不到 ConfigProvider 的 locale 与主题，所以用它包一层 */}
      <AntApp>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  </StrictMode>,
)
