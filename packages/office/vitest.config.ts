import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // 只测本包源码：vendor/ 是 vendored 的上游代码（自带测试，但依赖上游
    // 的夹具与配置，不在 mimir 里跑）。这里跑的是我们的适配层
    include: ['src/**/*.test.ts'],
  },
})
