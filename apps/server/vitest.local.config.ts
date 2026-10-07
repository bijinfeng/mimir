import { defineConfig } from 'vitest/config'
import { LOCAL_MODE_TEST_ENV } from './src/test/config.js'

/**
 * 本地模式（D-100）那一遍测试。
 *
 * 与主配置的唯一区别是环境（`MIMIR_LOCAL_MODE` / `MIMIR_LOCAL_TOKEN`）
 * 与收录范围（只有 `local-mode.test.ts`）。分成两个进程的理由写在
 * `src/test/config.ts` 的 `LOCAL_MODE_TEST_ENV` 上：那些变量只在模块加载
 * 时被读一次，而它们会全局地改变鉴权与配置形状——两条路径必须各自跑一遍。
 *
 * `globalSetup` 仍指向同一个文件：两个进程先后各建一次测试库
 * （第二个进程会把第一个的数据清掉，顺序执行、互不影响）。
 */
export default defineConfig({
  test: {
    fileParallelism: false,
    env: LOCAL_MODE_TEST_ENV,
    globalSetup: ['./src/test/global-setup.ts'],
    include: ['src/test/local-mode.test.ts'],
  },
})
