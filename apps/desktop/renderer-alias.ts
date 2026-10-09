import { fileURLToPath } from 'node:url'

/**
 * 渲染进程的别名（D-103）。
 *
 * `@/` → 本包的 `src/renderer/`。桌面端自己的渲染代码只有标题栏与桥访问器，
 * 其余全部来自 `@mimir/renderer`——那个包是**正常的 package 导入**，
 * 不在这里配别名（配了就等于把它当目录用，包的导出边界会形同虚设）。
 *
 * electron.vite.config.ts 与 vitest.config.ts 各读各的配置，两处都需要这一条，
 * 所以只写一份：各写一遍的话改一处漏一处是静默的——构建能过、测试找不到模块。
 */
export const rendererAlias = {
  '@': fileURLToPath(new URL('./src/renderer', import.meta.url)),
}
