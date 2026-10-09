import { defineConfig } from 'vitest/config'

/**
 * 渲染层的测试配置（D-103）。
 *
 * `happy-dom` 是必需的：这个包里的测试大多要挂载组件（`createRoot` + 真实
 * DOM 断言）。缺了它的症状是 `document is not defined`——组件测试全线失败，
 * 而那看起来像代码坏了。
 *
 * 不需要 alias：包内已全部改用相对导入（见本包 AGENTS 与 D-103）。
 */
export default defineConfig({
  test: {
    environment: 'happy-dom',
  },
})
