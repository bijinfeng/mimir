import { configDefaults, defineConfig } from 'vitest/config'
import { TEST_ENV } from './src/test/config.js'

export default defineConfig({
  test: {
    // 集成测试共用一个测试库，关闭文件级并行避免互相污染
    fileParallelism: false,
    env: TEST_ENV,
    globalSetup: ['./src/test/global-setup.ts'],
    /**
     * 本地模式（D-100）的用例**不在这一遍跑**。
     *
     * 它需要 `MIMIR_LOCAL_MODE=1` 之类的环境，而那些变量必须在模块加载前
     * 就位（`env.ts` 在模块顶层读取）——混进这一遍等于把另一条路径的实现
     * 全局打开，正常模式的断言会跟着变味。所以它有自己的配置与进程：
     * `vitest.local.config.ts`，由 `pnpm test` 接着跑。
     */
    exclude: [...configDefaults.exclude, 'src/test/local-mode.test.ts'],
  },
})
