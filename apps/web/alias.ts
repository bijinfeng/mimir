import { fileURLToPath } from 'node:url'

/**
 * `@/` → `src/`（浏览器薄壳的本地代码）。
 *
 * vite 和 vitest 各读各的配置，两处都需要这条别名，所以定义在这里只写一份——
 * 两份配置里各写一遍的话，改了一处忘了另一处，表现是「构建能过、测试找不到模块」。
 *
 * 注意：@mimir/renderer 是独立 package，通过正常的 package 导入，不走别名。
 */
export const alias = {
  '@': fileURLToPath(new URL('./src', import.meta.url)),
}
