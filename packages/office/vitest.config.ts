import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    /**
     * 默认 Node 环境。
     *
     * **不要把它改成 happy-dom 全局默认。** happy-dom 会替换全局的 `URL`，
     * 于是 `readFileSync(new URL(..., import.meta.url))` 抛
     * `The URL must be of scheme file` —— 解析类的测试（xlsx / pptx / docx）
     * 会整片挂掉，而它们与 DOM 毫无关系。实测踩过。
     *
     * 需要 DOM 的测试在自己的文件顶部写 `@vitest-environment happy-dom`。
     */
    environment: 'node',
    // 只测本包源码：vendor/ 是 vendored 的上游代码（自带测试，但依赖上游
    // 的夹具与配置，不在 mimir 里跑）。这里跑的是我们的适配层
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
