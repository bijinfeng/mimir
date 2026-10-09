import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import type { AnyRouter } from '@tanstack/react-router'
import { StrictMode } from 'react'
import type { Root } from 'react-dom/client'
import { installInputModalityTracking } from './lib/input-modality'
import { queryClient } from './lib/query'
import { UnsavedProvider } from './lib/unsaved'
import { PlatformProvider, type Platform } from './platform'
import { MimirProvider } from './theme/MimirProvider'

/**
 * 挂载应用（供平台入口调用）。
 *
 * 两个参数都是**平台给的**，这是刻意的——它们恰好是两个平台唯一不同的东西：
 *
 * | 参数 | 为什么由平台给 |
 * |---|---|
 * | `router` | 路由树按平台组装：桌面端多挂自己的页面（D-104） |
 * | `platform` | 桌面端有桥与标题栏，浏览器端都没有（判别联合，见 platform.tsx） |
 *
 * 平台差异走参数而不是模块级 setter：顺序由函数签名保证，忘传就是类型错，
 * 而不是首帧 render 里一个被 error boundary 吞掉的运行时异常。
 *
 * @param root - React 的 Root 实例（由平台入口创建）
 * @param options.router - 该平台组装好的路由实例
 * @param options.platform - 该平台的能力
 */
export function createApp(
  root: Root,
  { router, platform }: { router: AnyRouter; platform: Platform },
): void {
  /*
   * 输入方式追踪（鼠标 / 键盘），供焦点环使用。
   *
   * 装在这里而不是某个组件的 effect 里：它写的是 `html` 上的一个自定义属性，
   * 与 React 生命周期无关，装在组件里会因为 StrictMode 的双次挂载
   * 而重复注册监听（虽然加了捕获阶段、重复也不出错，但没必要）。
   */
  installInputModalityTracking()

  root.render(
    <StrictMode>
      {/* 主题、locale 与全局样式都在 MimirProvider 里接线，见 theme/MimirProvider.tsx */}
      <MimirProvider>
        <PlatformProvider platform={platform}>
          <QueryClientProvider client={queryClient}>
            {/*
              未保存内容的状态必须在路由之上：左导航、中栏、命令面板都能触发
              「离开当前文档」，而它们互相不认识——只有共同祖先能拦住它们。
            */}
            <UnsavedProvider>
              <RouterProvider router={router} />
            </UnsavedProvider>
          </QueryClientProvider>
        </PlatformProvider>
      </MimirProvider>
    </StrictMode>,
  )
}
