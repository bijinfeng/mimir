import { MimirProvider } from '@mimir/renderer/titlebar-kit'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { SetupPage } from '@/setup/SetupPage'

/**
 * 选择页的入口（D-100 / D-103）。
 *
 * 它是 renderer 段的**第二个 HTML 入口**，与主应用分开：这一页必须在
 * 没有任何宿主时也能打开（首启时本地宿主还没起，云端连不上时远端也没有），
 * 所以由 `file://` 加载，不进主应用的路由（后者是 history 模式，file:// 下
 * 不工作）。
 *
 * **不注入平台插槽**：那套东西是给主应用用的（它要决定标题栏与侧栏顶栏），
 * 而这一页自己就是桌面专属的，直接用桥即可。
 */
const container = document.getElementById('root')
if (!container) throw new Error('找不到 #root 挂载点')

createRoot(container).render(
  <StrictMode>
    {/* 主题、locale 与全局样式与主界面同源——这一页不再自带一套变量 */}
    <MimirProvider>
      <SetupPage />
    </MimirProvider>
  </StrictMode>,
)
