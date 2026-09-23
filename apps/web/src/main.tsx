import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { installInputModalityTracking } from '@/lib/input-modality'
import { queryClient } from '@/lib/query'
import { UnsavedProvider } from '@/lib/unsaved'
import { router } from '@/router'
import { MimirProvider } from '@/theme/MimirProvider'

const container = document.getElementById('root')
if (!container) throw new Error('找不到 #root 挂载点')

/*
 * 输入方式追踪（鼠标 / 键盘），供焦点环使用。
 *
 * 装在模块作用域而不是某个组件的 effect 里：它写的是 `html` 上的一个自定义
 * 属性，与 React 生命周期无关，装在组件里会因为 StrictMode 的双次挂载
 * 而重复注册监听（虽然加了捕获阶段、重复也不出错，但没必要）。
 */
installInputModalityTracking()

createRoot(container).render(
  <StrictMode>
    {/* 主题、locale 与全局样式都在 MimirProvider 里接线，见 theme/MimirProvider.tsx */}
    <MimirProvider>
      <QueryClientProvider client={queryClient}>
        {/*
          未保存内容的状态必须在路由之上：左导航、中栏、命令面板都能触发
          「离开当前文档」，而它们互相不认识——只有共同祖先能拦住它们。
        */}
        <UnsavedProvider>
          <RouterProvider router={router} />
        </UnsavedProvider>
      </QueryClientProvider>
    </MimirProvider>
  </StrictMode>,
)
