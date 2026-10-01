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
    /**
     * 5s 的默认超时对编辑器的初始化太紧。
     *
     * 大量用例要在每次测试里现建 Tiptap 编辑器（docx 的 find/toolbar 系）
     * 或解析 xlsx/pdf 字节（pdfjs 的 worker 冷启动）——本机上实测：单跑
     * 稳过，但在 `pnpm check` 的并行负载下（7 个 workspace × 各自 vitest
     * 池同时跑）偶发超时，且**每次失败的用例集合都不同**（2 → 8 → 29 → 33
     * 漂移，全部是 "Test timed out in 5000ms"、非断言失败）。
     * 20s 只放宽等待上限，不改任何断言与行为。
     */
    testTimeout: 20000,
    // 只测本包源码：vendor/ 是 vendored 的上游代码（自带测试，但依赖上游
    // 的夹具与配置，不在 mimir 里跑）。这里跑的是我们的适配层
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
