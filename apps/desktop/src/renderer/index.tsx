import { buildRouter, createApp } from '@mimir/renderer'
import { createRoot } from 'react-dom/client'
import { TitleBar } from '@/components/TitleBar'
import { desktopBridge } from '@/lib/desktop-bridge'
import { routeTree } from '@/routeTree.gen'

/**
 * 桌面渲染进程的入口（D-103 / D-104）。
 *
 * 这一侧只做三件事：组装路由（基础路由 + 客户端专属页面）、声明平台能力、
 * 挂载。界面与业务代码全在 `@mimir/renderer`，与浏览器部署共用一份源码。
 */

/**
 * 标题栏的 render-prop **必须是模块级函数**。
 *
 * 写成内联箭头会让 `react(no-unstable-nested-components)` 判它是「渲染期
 * 定义组件」，React Compiler 随即跳过宿主组件——而那是**静默**的退化
 * （`.trellis/spec/project/rules.md` 铁律 1：不报错，只是组件不再被优化）。
 */
const renderTitleBar = (props: Parameters<typeof TitleBar>[0]) => <TitleBar {...props} />

const container = document.getElementById('root')
if (!container) throw new Error('找不到 #root 挂载点')

if (!desktopBridge) {
  /**
   * 桥缺失是**组装错误**，不是可降级的状态：preload 没执行时窗口控件、
   * 模式切换、boot 信息全部不可用，而那条路径上每一处都要写防御分支。
   *
   * 响亮地失败——`preload` 写成相对路径时它会静默不执行（坑表记过），
   * 那种情况下白屏加一条控制台报错远比「界面在但处处失灵」好查。
   */
  throw new Error(
    'window.mimirDesktop 不存在：preload 没有执行（检查 BrowserWindow 的 preload 路径）',
  )
}

createApp(createRoot(container), {
  router: buildRouter(routeTree),
  platform: {
    kind: 'desktop',
    // 判别联合的这一支里两者都是**必填**，所以上面的空值检查不是防御而是前提
    bridge: desktopBridge,
    renderTitleBar,
  },
})
