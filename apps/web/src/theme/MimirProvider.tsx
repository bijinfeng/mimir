import { App as AntApp, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { ThemeProvider } from 'antd-style'
import type { ReactNode } from 'react'
import { GlobalStyles } from '@/styles/global'
import { mimirCustomToken } from '@/theme/customToken'
import { mimirTheme } from '@/theme/tokens'

/**
 * 应用的主题与样式基建 —— 全应用只有这一处组装。
 *
 * 单独成文件而不是写在 `main.tsx` 里，是为了让 `design.test.ts` 渲染
 * **和线上完全一样**的 provider 栈：测试里的结构一旦和生产分叉，
 * 它守住的就不是真实的东西了。
 *
 * 四层的分工：
 *   ThemeProvider  antd-style 的业务层封装。它内部就是 ConfigProvider，
 *                  额外提供主题外观状态、自定义 token 与静态方法实例。
 *   ConfigProvider 只负责 locale。**不能把 theme 再传一遍**——内层传了
 *                  theme 会重算 cssVar 的 key，`--ant-*` 变量名就变了。
 *                  不传时 antd 会直接继承外层的 theme。
 *   AntApp         提供 message/notification/modal 的 context 版本，
 *                  并给原生标签（`<a>` 等）补上 antd 的样式重置。
 *   GlobalStyles   文档级样式，见 `styles/global.ts`。
 */
export function MimirProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider theme={mimirTheme} customToken={mimirCustomToken}>
      <ConfigProvider locale={zhCN}>
        <AntApp>
          <GlobalStyles />
          {children}
        </AntApp>
      </ConfigProvider>
    </ThemeProvider>
  )
}
