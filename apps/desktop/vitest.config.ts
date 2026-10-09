import { defineConfig } from 'vitest/config'
import { rendererAlias } from './renderer-alias.ts'

/**
 * 本包有**两类**测试，环境不同（D-103）：
 *
 *   - 主进程侧（`src/main/**`）：纯 node，测的是路径推导、地址归一化、配置读写
 *   - 渲染侧（`src/renderer/**`）：要 DOM，测的是标题栏真的渲染出了什么
 *
 * 合成一份配置的话必须二选一：node 环境下组件测试报 `document is not defined`，
 * happy-dom 环境下主进程测试又在一个假 DOM 里跑——两者都不对。
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'main',
          environment: 'node',
          // 只测本包源码：server-deploy/（desktop:build 的 deploy 产物）里带着
          // 服务端的源文件，不加限定会把它们当成测试扫进来
          include: ['src/main/**/*.test.ts'],
        },
      },
      {
        resolve: { alias: rendererAlias },
        test: {
          name: 'renderer',
          environment: 'happy-dom',
          include: ['src/renderer/**/*.test.tsx'],
        },
      },
    ],
  },
})
