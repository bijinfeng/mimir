import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    /**
     * DOM 环境。
     *
     * 与 `packages/office` 的默认（node）不同：这个包里**没有**解析类测试，
     * 整个包就是 React 组件与「消息 → 渲染模型」的转换，全部需要 DOM。
     * 用环境级默认而不是每个文件顶部的注释，是因为没有一个文件例外。
     */
    environment: 'happy-dom',
    environmentOptions: {
      happyDOM: {
        settings: {
          /**
           * **关掉同源策略。**
           *
           * 面板的端到端测试会起一个真的 HTTP 服务（这样验的是真实字节与
           * 真实协议客户端，而不是 mock——mock 掉它等于把要验的东西验没了）。
           * happy-dom 的 fetch 默认按同源检查，而测试页面的 origin 是
           * `localhost:3000`、服务在 `127.0.0.1:<随机端口>` 上：
           * 症状是 `Cross-Origin Request Blocked`，看起来像「请求没发出去」。
           *
           * 注意这一项在 `fetch` 这一层下面（happy-dom 的
           * `settings.fetch.disableSameOriginPolicy`），写成顶层会被它
           * 直接拒绝：`Unknown browser setting`——那是**起不来**的失败，
           * 不是静默的。
           *
           * 关掉它不会让任何断言变松——测试里没有依赖跨源**拒绝**的用例。
           */
          fetch: { disableSameOriginPolicy: true },
        },
      },
    },
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
