import { defineConfig } from 'vitest/config'
import { TEST_ENV } from './src/test/config.js'

export default defineConfig({
  test: {
    // 集成测试共用一个测试库，关闭文件级并行避免互相污染
    fileParallelism: false,
    env: TEST_ENV,
    globalSetup: ['./src/test/global-setup.ts'],
  },
})
