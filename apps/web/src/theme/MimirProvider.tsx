import { App as AntApp, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { ThemeProvider } from 'antd-style'
import type { ReactNode } from 'react'
import { GlobalStyles } from '@/styles/global'
import { useAppearance } from '@/theme/appearance'
import { customTokenFor } from '@/theme/customToken'
import { themeConfigFor } from '@/theme/tokens'

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
 *
 * ## 外观是受控的，不由 antd-style 自己管
 *
 * `ThemeProvider` 自带 `themeMode` / `appearance` 两套状态，但它们不持久化；
 * 而且 `themeMode="auto"` 的首次匹配走 `setTimeout(…, 1)`，**首帧先按浅色
 * 渲染再翻成深色**——深色用户每次打开都会先看到一下白闪。
 *
 * 所以这里把算好的 `appearance` 作为**受控值**传进去（受控时它不再自己判断），
 * 状态的持有者是 `theme/appearance.ts`：它同步地从 localStorage 与
 * `prefers-color-scheme` 算出第一帧该用哪套色。
 *
 * `theme` 也随外观换成对应的 ThemeConfig。注意深色的 `algorithm` 里
 * **只有校准层**——`darkAlgorithm` 由 antd-style 按 appearance 自动串在前面，
 * 自己再传一遍会让它跑两次（见 `tokens.ts` 的 `algorithmFor`）。
 */
export function MimirProvider({ children }: { children: ReactNode }) {
  const appearance = useAppearance()

  return (
    <ThemeProvider
      appearance={appearance}
      theme={themeConfigFor(appearance)}
      customToken={customTokenFor(appearance)}
    >
      <ConfigProvider locale={zhCN}>
        <AntApp>
          <GlobalStyles />
          {children}
        </AntApp>
      </ConfigProvider>
    </ThemeProvider>
  )
}
