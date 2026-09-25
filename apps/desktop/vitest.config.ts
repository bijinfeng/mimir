import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // 只测本包源码：server-deploy/（desktop:build 的 deploy 产物）里带着
    // 服务端的源文件，不加限定会把它们当成测试扫进来
    include: ['src/**/*.test.ts'],
  },
})
