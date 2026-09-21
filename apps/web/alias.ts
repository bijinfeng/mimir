import { fileURLToPath } from 'node:url'

/**
 * `@/` → `src/`。
 *
 * vite 和 vitest 各读各的配置，两处都需要这条别名，所以定义在这里只写一份——
 * 两份配置里各写一遍的话，改了一处忘了另一处，表现是「构建能过、测试找不到模块」。
 */
export const alias = {
  '@': fileURLToPath(new URL('./src', import.meta.url)),
}
