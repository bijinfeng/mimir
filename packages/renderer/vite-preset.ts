import { createRequire } from 'node:module'
import { copyFile, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import type { Plugin, PluginOption } from 'vite'
// @ts-expect-error -- .mjs 无类型声明：它要能被 node 直接跑（见那个文件的说明）
import { routeGeneratorConfig } from './route-config.mjs'

/** Resolve the font URLs retained in GenOffice's vendored CSS on both hosts. */
export const genofficeFontAlias = {
  '@genoffice/ui/fonts': resolve(import.meta.dirname, '../office/src/fonts'),
}

/** OXC accepts filename substrings here; vendor still receives its TS/JSX transform. */
export const projectReactSources = [
  resolve(import.meta.dirname, '../../apps'),
  resolve(import.meta.dirname, './src'),
  resolve(import.meta.dirname, '../chat/src'),
  resolve(import.meta.dirname, '../office/src'),
]

/** The emitted Carlito faces need their OFL notice in distributable output. */
export function emitCarlitoLicense(): Plugin {
  return {
    name: 'mimir:emit-carlito-license',
    async generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'fonts/Carlito-LICENSE-OFL.txt',
        source: await readFile(join(genofficeFontAlias['@genoffice/ui/fonts'], 'LICENSE-OFL.txt')),
      })
    },
  }
}

/** The locally bundled Phosphor paths must carry their MIT notice on both hosts. */
export function emitPhosphorLicense(): Plugin {
  return {
    name: 'mimir:emit-phosphor-license',
    async generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'licenses/Phosphor-Icons-MIT.txt',
        source: await readFile(
          new URL('./src/components/library/phosphor-file-icons/LICENSE', import.meta.url),
        ),
      })
    },
  }
}

/**
 * 渲染层的构建预设（D-103）。
 *
 * 浏览器（`apps/web`）与桌面渲染进程（`apps/desktop` 的 renderer 段）构建的是
 * **同一份源码**，所以它需要的构建期插件也必须是同一份：
 *
 *   1. **路由生成**：`routeTree.gen.ts` 由文件路由扫描 `src/routes/` 生成，
 *      而那个目录在这个包里——使用方各写一份配置的话，两边的
 *      `routesDirectory` 会漂移，症状是「某个平台少一个页面」
 *   2. **pdf.js 资产**：按原始文件名取用的 199 个运行时文件，两个平台都要
 *
 * 各写一遍的代价很具体：这两件事都**不报错**。路由漏生成是某一页 404，
 * pdf.js 资产漏拷是中文 PDF 整段空白——而两者都只在那一个平台上出现。
 */

/**
 * pdf.js 的运行时资产（cmaps / 标准字体 / wasm）。
 *
 * ## 为什么不把它们提交进仓库
 *
 * 那 199 个文件（7.5MB）**就是 `pdfjs-dist` 这个依赖自带的**——我们已经依赖
 * 它了，在 git 里再存一遍有三个代价：仓库白白大三倍；升级 `pdfjs-dist` 时
 * 忘了重拷就会**旧 cmaps 配新引擎**（极难查，且只在特定 PDF 上出现）；
 * 它们不是我们 vendored 的代码，而是第三方包的构建资产。
 *
 * ## 为什么必须落在 `public/pdfjs/` 且不能改名
 *
 * pdf.js 按**原始文件名**去目录里取（它请求 `cmaps/Adobe-GB1-0.bcmap`）。
 * 交给我们自己的打包逻辑（`?url` / 哈希产物）只会有一个文件能被找到，
 * 其余 168 个 404——而症状是**中文 PDF 整段文字空白**（不是乱码），
 * 没有任何报错。`public/` 是 Vite 唯一原样复制、不改名的位置。
 *
 * 服务端的静态中间件（`lib/static.ts`）为 `.bcmap` / `.pfb` / `.wasm`
 * 补了 MIME——漏了的话同样表现为「取到了但用不了」。
 *
 * ## 为什么先删再拷
 *
 * `cp` 不会删除目标目录里多出来的文件。升级 `pdfjs-dist` 之后，旧版本留下的
 * cmap 会一直躺在那里——不报错、也不生效，只是让产物多带几个 MB 的废数据。
 *
 * @param publicDir - 使用方的 `public/` 绝对路径（两个平台各有自己的）
 */
export function copyPdfjsAssets(publicDir: string): Plugin {
  const SUBDIRS = ['cmaps', 'standard_fonts', 'wasm'] as const

  return {
    name: 'mimir:copy-pdfjs-assets',
    /** 开发与构建都从这里进——`publicDir` 的复制发生在它之后 */
    async buildStart() {
      const target = join(publicDir, 'pdfjs')
      await rm(target, { recursive: true, force: true })
      await mkdir(target, { recursive: true })

      // require.resolve 而不是拼 node_modules 路径：pnpm 的实际安装位置不是
      // 使用方目录下的 node_modules/pdfjs-dist
      const require = createRequire(import.meta.url)
      const root = dirname(require.resolve('pdfjs-dist/package.json'))

      let copied = 0
      for (const sub of SUBDIRS) {
        await cp(join(root, sub), join(target, sub), { recursive: true })
        copied += (await readdir(join(target, sub))).length
      }

      /**
       * **许可声明要跟着资产一起分发。** pdfjs-dist 是 Apache-2.0，而那些
       * 资产文件会被打进产物发出去——Apache-2.0 第 4 条要求随分发保留许可与
       * 声明。不拷它的话产物里只有数据、没有出处，那是不合规的。
       */
      await copyFile(join(root, 'LICENSE'), join(target, 'LICENSE-pdfjs.txt'))

      this.info?.(`pdf.js 资产已就绪（${copied} 个文件 + 许可，从 pdfjs-dist 拷贝）`)
    },
  }
}

/** Only the portable LSTM core and best_int language data; no CDN fallback or full tessdata directories. */
export function copyPdfOcrAssets(publicDir: string): Plugin {
  return {
    name: 'mimir:copy-pdf-ocr-assets',
    async buildStart() {
      const require = createRequire(import.meta.url)
      const rootOf = (name: string) => dirname(require.resolve(`${name}/package.json`))
      const target = join(publicDir, 'pdf-ocr')
      await rm(target, { recursive: true, force: true })
      await mkdir(join(target, 'lang'), { recursive: true })
      await copyFile(
        join(rootOf('tesseract.js'), 'dist/worker.min.js'),
        join(target, 'worker.min.js'),
      )
      await copyFile(
        join(rootOf('tesseract.js'), 'LICENSE.md'),
        join(target, 'LICENSE-tesseract.js.txt'),
      )
      const core = rootOf('tesseract.js-core')
      // The .wasm.js builds embed another base64 copy of the whole WASM. Use the
      // portable external-WASM LSTM pair instead of shipping duplicate variants.
      for (const extension of ['js', 'wasm'])
        await copyFile(
          join(core, `tesseract-core-lstm.${extension}`),
          join(target, `tesseract-core-lstm.${extension}`),
        )
      await copyFile(join(core, 'LICENSE'), join(target, 'LICENSE-tesseract.js-core.txt'))
      for (const language of ['eng', 'chi_sim']) {
        const root = rootOf(`@tesseract.js-data/${language}`)
        await copyFile(
          join(root, `4.0.0_best_int/${language}.traineddata.gz`),
          join(target, 'lang', `${language}.traineddata.gz`),
        )
        // These packages ship license metadata but no separate LICENSE file; preserve their full notices.
        await writeFile(
          join(target, `NOTICE-${language}.txt`),
          `${await readFile(join(root, 'package.json'), 'utf8')}\n\n${await readFile(join(root, 'README.md'), 'utf8')}\n`,
        )
      }
      await copyFile(
        new URL('./licenses/tessdata-Apache-2.0.txt', import.meta.url),
        join(target, 'LICENSE-tessdata-Apache-2.0.txt'),
      )
      this.info?.('本地 OCR 资产已就绪（中英语言、LSTM WASM、许可；无需 CDN）')
    },
  }
}

export interface RendererPluginOptions {
  /** 使用方的 `public/` 绝对路径（pdf.js 资产拷到它下面） */
  publicDir: string
  /**
   * 生成的路由树写到哪（使用方自己的目录）。
   *
   * **每个平台一份**：插件的 `generatedRouteTree` 是单值，而桌面端要在基础
   * 路由之外挂自己的页面——两个平台共用一份产物的话，浏览器会拿到桌面专属
   * 的路由（类型上也会出现一个它永远到不了的 `to`）。
   */
  generatedRouteTree: string
  /**
   * 这个平台独有的路由（D-104）。
   *
   * 目录里的文件按**文件路由约定**写（`createFileRoute`），挂载到
   * `pathPrefix` 之下：例如 `{ directory: 'src/routes', pathPrefix: '/client' }`
   * 里的 `about.tsx` 会成为 `/client/about`。
   *
   * 不给就只有基础路由——浏览器部署是这一支。
   */
  extraRoutes?: { directory: string; pathPrefix: string }
}

/**
 * 渲染层构建需要的插件（不含 React 插件）。
 *
 * **React 插件由使用方自己给**：它的 `compiler` 选项是两边都要开的（铁律 1），
 * 但插件实例本身与使用方的 Vite 版本绑定，跨包传实例会在 pnpm 的布局下
 * 拿到第二份拷贝。
 */
export function rendererPlugins(options: RendererPluginOptions): PluginOption[] {
  const { publicDir, generatedRouteTree, extraRoutes } = options

  return [
    /**
     * **排在第一位**：`buildStart` 越早跑越好，因为 Vite 随后会复制
     * `publicDir`——晚于它注册的插件可能赶不上那次复制（开发模式下第一次
     * 请求就会 404，而刷新后反而正常，属于最难查的一类）。
     */
    copyPdfjsAssets(publicDir),
    copyPdfOcrAssets(publicDir),
    emitCarlitoLicense(),
    emitPhosphorLicense(),
    /**
     * 文件路由。**配置来自 `route-config.mjs`**——那一份同时被
     * `generate-routes.mjs` 用（typecheck 之前要先有路由树，而插件那时还没跑）。
     * 两处各写一遍的话会出现「构建能过、typecheck 看到的是另一棵树」。
     *
     * **必须排在 react() 之前**：它要先生成 `routeTree.gen.ts`。
     */
    tanstackRouter(routeGeneratorConfig({ generatedRouteTree, extraRoutes })),
  ]
}
