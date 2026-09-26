import { copyFile, cp, mkdir, readdir, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type { Plugin } from 'vite'

/**
 * 把 pdf.js 的运行时资产从 `pdfjs-dist` 依赖里拷进 `public/pdfjs/`。
 *
 * ## 为什么不把它们提交进仓库（用户问过这个）
 *
 * 那 199 个文件（7.5MB：cmaps / 标准字体 / wasm）**就是 `pdfjs-dist` 这个依赖
 * 自带的**——我们已经依赖它了，把同一份数据在 git 里再存一遍有三个代价：
 *
 *   1. **仓库白白大三倍**，而它们一个字节都不由我们维护
 *   2. **版本会漂移**：升级 `pdfjs-dist` 时如果忘了重新拷贝，跑的是旧 cmaps
 *      配新引擎——一类极难查的兼容问题，而且只在特定的 PDF 上出现
 *   3. 它们不是「我们 vendored 的代码」（那种我们确实要留在树里，见
 *      `packages/office/vendor/`），而是**第三方包的构建资产**
 *
 * 上游 GenOffice 也是这么做的（它的 `vite.renderer.config.ts` 用
 * `vite-plugin-static-copy` 从 `node_modules` 拷到产物）。这里不引那个插件：
 * 一次 `cp` 就够了，而 Vite 插件的 `buildStart` 在**开发与构建两条路径上都会
 * 跑**——同一份代码覆盖两边，不存在「忘了跑脚本」的状态。
 *
 * ## 为什么必须叫这个路径（`public/pdfjs/cmaps/…`）
 *
 * pdf.js 按**原始文件名**去目录里取（它请求 `cmaps/Adobe-GB1-0.bcmap`，
 * 而不是某个带哈希的名字）。所以：
 *
 *   - 交给我们自己的打包逻辑（`?url` / 哈希产物）只会有那一个文件能被找到，
 *     其余 168 个 404 —— 而症状是**中文 PDF 整段文字空白**（不是乱码），
 *     没有任何报错
 *   - `public/` 是 Vite 唯一**原样复制、不改名**的位置
 *
 * 服务端的静态中间件（`lib/static.ts`）为 `.bcmap` / `.pfb` / `.wasm`
 * 补了 MIME——漏了的话同样表现为「取到了但用不了」。
 *
 * ## 为什么先删再拷
 *
 * `cp` 不会删除目标目录里多出来的文件。升级 `pdfjs-dist` 之后，旧版本留下的
 * cmap 会一直躺在那里——不报错、也不生效，只是让产物里多带几个 MB 的废数据。
 */

/** `pdfjs-dist` 的安装根（用 require.resolve 而不是拼 node_modules 路径） */
function pdfjsRoot(): string {
  const require = createRequire(import.meta.url)
  return dirname(require.resolve('pdfjs-dist/package.json'))
}

const SUBDIRS = ['cmaps', 'standard_fonts', 'wasm'] as const

export function copyPdfjsAssets(): Plugin {
  return {
    name: 'mimir:copy-pdfjs-assets',
    /** 开发与构建都从这里进——`publicDir` 的复制发生在它之后 */
    async buildStart() {
      const publicDir = join(import.meta.dirname, 'public', 'pdfjs')
      await rm(publicDir, { recursive: true, force: true })
      await mkdir(publicDir, { recursive: true })

      const root = pdfjsRoot()
      let copied = 0
      for (const sub of SUBDIRS) {
        await cp(join(root, sub), join(publicDir, sub), { recursive: true })
        copied += (await readdir(join(publicDir, sub))).length
      }

      /**
       * **许可声明要跟着资产一起分发。** pdfjs-dist 是 Apache-2.0，而那 198 个
       * 资产文件会被打进产物发出去——Apache-2.0 第 4 条要求随分发保留许可与
       * 声明。不拷它的话产物里只有数据、没有出处，那是不合规的。
       *
       * `wasm/` 目录里有几个第三方组件的许可（JBIG2、OpenJPEG、QCMS）随
       * `cp` 一起过来了——那三个是 pdf.js 自己放进去的，也是同理。
       */
      await copyFile(join(root, 'LICENSE'), join(publicDir, 'LICENSE-pdfjs.txt'))

      this.info?.(`pdf.js 资产已就绪（${copied} 个文件 + 许可，从 pdfjs-dist 拷贝）`)
    },
  }
}
