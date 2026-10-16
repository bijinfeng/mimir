#!/usr/bin/env node
/**
 * 从上游 GenOffice 同步 vendored 代码（`packages/office`）。
 *
 * ## 这个包是什么
 *
 * mimir 需要「在浏览器里预览并编辑 docx」。现成路线里没有许可宽松、可自托管、
 * 且能真编辑的库（见 .trellis/spec/project/research.md §13 的调研）：ONLYOFFICE 要 1.9 GB 容器、
 * Collabora 开发版官方不推荐生产、CryptPad 路线背着 580 MB 静态资源与 AGPL §7
 * 附加条款。GenOffice（Apache-2.0）是唯一同时满足「真编辑」「无独立服务」
 * 「许可宽松」的，它的引擎是补丁式保存——**未改动的 zip 条目逐字节原样写回**
 * （实测：原样保存 11/11 条目字节相同；改一段只有 document.xml 变化）。
 *
 * ## 为什么是 vendoring 而不是依赖
 *
 * 它是**应用**不是库：所有包 `private: true`、不以 npm 发布、没有嵌入 API。
 * 上游还在活跃开发（拿它就是为了持续吃到 OOXML 兼容性修复），所以做法是
 * 「按文件清单抽取 + 保留原目录形状 + 可重复同步」，而不是 fork 全仓
 * （972 MB、238 个 renderer 文件、105K 行，其中大部分是 mimir 不需要的
 * ribbon/AI/Zotero/多标签）。
 *
 * ## 同步怎么做
 *
 * ```
 * git clone --depth 1 https://github.com/genspark-ai/genoffice /tmp/genoffice
 * node packages/office/scripts/sync-upstream.mjs --from /tmp/genoffice [--check]
 * ```
 *
 * `--check` 只报告差异不写文件（用于定期检查上游是否动了我们 vendored 的文件）。
 *
 * ## 三条规矩
 *
 * 1. **vendor/ 里的文件一律不改。** 需要改行为就在 `src/` 的适配层做，
 *    否则每次同步都会冲突。适配层已改掉的 import（i18n 等）由 `REWRITES`
 *    在同步时机械应用——它们是可重复的，不属于手工修改。
 * 2. **清单是白名单。** 只抽取清单列出的文件；上游新增文件不会自动进来，
 *    这是刻意的（它可能带来新的依赖面）。
 * 3. **锁版本。** `UPSTREAM.json` 记 commit + 抽取时间，`--check` 靠它对比。
 */
import { execFileSync } from 'node:child_process'
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pkgRoot = resolve(here, '..')
const manifestPath = join(pkgRoot, 'vendor/UPSTREAM.json')

/**
 * 抽取清单。**每一条都要写明为什么它在闭包里**——
 * 这个清单是人工维护的，注释是后人判断「能不能删」的唯一依据。
 */
const MANIFEST = JSON.parse(await readFile(manifestPath, 'utf8'))

/**
 * 闭包**之外**还要抽取的文件（`UPSTREAM.json` 的 `extraFiles`）。
 *
 * 闭包是顺着 import 图算出来的，而有一类文件不在那张图上：被 `?raw` 注入的
 * 脚本——html 预览的 `inspector.js`（上游在 App.tsx 里
 * `import inspectorSource from './preview/inspector.js?raw'`，而 `?raw` 不是
 * 模块解析，闭包抓不到）。
 *
 * 它们是**资产**不是模块：照样复制、照样加横幅，只是不作为入口参与闭包计算。
 * 清单放 `UPSTREAM.json` 而不是写死在这里——它是「我们 vendored 了什么」的
 * 一部分，后人看清单就该知道，不必读脚本。
 */
const EXTRA_FILES = MANIFEST.extraFiles ?? []

/**
 * 同步时机械应用的 import 改写。
 *
 * 这些是**可重复的**，所以不属于「手工修改」：vendored 代码原本引用
 * GenOffice 自己的包，我们在 mimir 里用等价实现替掉。
 *
 * 目标路径按**文件位置动态计算**（`to` 是相对 vendor 根的 shim 路径），
 * 而不是写死一串 `../`——vendored 文件散在不同深度（renderer 顶层、
 * renderer/editor/、各包的 src/），写死的相对路径必然有数错的那一天，
 * 而错了只在运行时以「模块找不到」暴露。
 */
const REWRITES = [
  {
    match: /from\s+['"]@genoffice\/pptx-render['"]/g,
    to: 'packages/pptx-render/src/render-tree.js',
    onlyWhen: (vendorRel) => vendorRel === 'packages/pipelines/src/slides/layout-audit.ts',
    reason: '布局审计只导入 RenderSlide/RenderNode 类型；直指数据类型以保持浏览器闭包自封闭',
  },
  {
    match: /from\s+['"]\.\.\/\.\.\/shared\/ipc['"]/g,
    to: 'packages/pptx-ops/src/types.js',
    onlyWhen: (vendorRel) => vendorRel === 'apps/slides/src/renderer/ai/layout-script.ts',
    reason: '安全编辑脚本只使用 EditParagraph 类型；避免带入 Electron IPC 和应用层闭包',
  },
  {
    match: /from\s+['"]electron['"]/g,
    to: '../src/shims/pdf-native-image.js',
    onlyWhen: (vendorRel) => vendorRel === 'apps/pdf/src/main/image-edit.ts',
    reason: 'PDF image-edit仅借nativeImage位图编解码；由服务端受限PNG/JPEG端口替代Electron',
  },
  {
    /** PDF IPC 的 AI 类型仅描述上游 Electron 壳，不在 Mimir 执行路径。 */
    match: /from\s+['"]@genoffice\/ai-provider['"]/g,
    to: '../src/shims/pdf-app-types.js',
    onlyWhen: (vendorRel) => vendorRel === 'apps/pdf/src/shared/ipc.ts',
    reason: 'PDF 宿主只消费 IPC 中的写入数据结构；AI 流走 Mimir 自己的合同',
  },
  {
    /** PDF 的 WASM 资产由 Mimir 服务端的 npm 依赖提供。 */
    match: /from\s+['"]\.\/wasm-path['"]/g,
    to: '../src/shims/pdf-wasm-path.js',
    onlyWhen: (vendorRel) => vendorRel.startsWith('apps/pdf/src/main/'),
    reason: '上游只认识 Electron resourcesPath；Mimir 两端通过服务端依赖解析 WASM',
  },
  {
    /**
     * i18n：上游引 `@genoffice/i18n`（198 行的 createI18n 工具）+ 渲染层的
     * 字符串表（20 种语言 × 3 组 ≈ 1.5 MB、60 个文件）。mimir 只需要编辑器
     * 真正会显示的那几处文案，换成 `src/shims/i18n.ts` 的等价实现——
     * 依赖面从 60 个文件降到 1 个。
     */
    match: /from\s+['"](?:@genoffice\/i18n|(?:\.\.\/)+i18n\/locale)['"]/g,
    /** 相对 **vendor 根**的 shim 位置（`..` 走出 vendor，进 packages/office/src） */
    to: '../src/shims/i18n.js',
    reason: 'i18n 包体积大（20 语言 × 3 组）且 mimir 只需少量文案，用 src/shims/i18n.ts 等价替代',
  },
  {
    /**
     * `@genoffice/ui` → `src/shims/ui.ts`（WordArt 预设 + `Find*` 类型）。
     *
     * vendored 代码对 ui 包的引用**全部是数据或类型**，没有一处要它的组件：
     * `protected-render.ts` 拿 WordArt 预设渲染 docx 里已有的艺术字；html 的
     * 源码编辑器要 `FindTarget` / `FindOptions` 两个类型（运行时被擦除，见
     * 那个 shim 的说明）。而整个 ui 包是 26 个文件、13 个 React 组件——
     * 为这几个符号拉进来不划算，也会触发 React Compiler 告警。
     *
     * 其它 `@genoffice/ui` 导出仍然是断链（self-check 会拦下：那种文件不该
     * 在闭包里）。
     */
    match: /from\s+['"]@genoffice\/ui(?:\/wordart-presets)?['"]/g,
    to: '../src/shims/ui.js',
    reason:
      '只借了 ui 包的两样东西（WordArt 预设有数据、Find* 是纯类型），由 shims/ui.ts 承接；不为它们 vendor 整个 UI kit',
  },
  {
    /**
     * 浏览器侧 `@genoffice/pptx-engine` 导入 → `src/shims/pptx-engine-types.ts`。
     * pptx-ops/src/ops 下的完整操作注册表必须使用 vendored 引擎，只有
     * 服务端会导入这组文件。
     *
     * 这一条必须在下面那条 `byPkg` 规则**之前**，否则 `byPkg` 会先把它改写成
     * 引擎的 `index.ts`，从而把整条写路径（insert/generate/media-insert/
     * slide-transfer/sections，约 10K 行，带 `node:zlib` 与 `Buffer`）拉进
     * 闭包。渲染层只需类型，顶层 edit-text 还使用 shim 的 encodeRunLink。
     *
     * 只替**裸包名**（`@genoffice/pptx-engine`）。子路径导入是**真代码**，
     * 必须照常走 byPkg：`./table-grid`、`./identity`、`./background-promote`
     * 三个在 pptx-render 里都被运行时使用（闭包的负向断言见 §自检）。
     */
    match: /from\s+['"]@genoffice\/pptx-engine['"]/g,
    to: '../src/shims/pptx-engine-types.js',
    onlyWhen: (vendorRel) => !vendorRel.startsWith('packages/pptx-ops/src/ops/'),
    reason:
      '浏览器预览与 edit-text 不能指向带 node:zlib/Buffer 的引擎 index；仅服务端 pptx-ops/src/ops 保留完整写路径',
  },
  {
    /**
     * 自家包的裸导入 → vendor 内的相对路径。
     *
     * 上游用 npm workspace 名（`@genoffice/docx-engine`）互相引用，而这个包在
     * mimir 里不是 workspace（是 vendor 目录），Node/Vite 都解析不了那个名字。
     * 改成相对路径后 vendor 就是**自封闭**的：不需要为它配 tsconfig paths，
     * 也不会和 mimir 自己的模块解析规则打架。
     *
     * 映射：`@genoffice/<pkg>`       → `…/packages/<pkg>/src/index.ts`
     *       `@genoffice/<pkg>/<sub>` → `…/packages/<pkg>/src/<sub>.ts`
     * 说明：`byPkg` 规则用 resolve 回调自己算目标，不走上面的 `to`。
     */
    match: /from\s+['"]@genoffice\/([a-z0-9-]+)(?:\/([a-z0-9/-]+))?['"]/g,
    byPkg: true,
    /**
     * **必须跳过 skipPackages 里的包。** 这条规则把包名改写成相对路径，
     * 而闭包计算的「按包名跳过」是在**改写之后**做的——改写一发生，
     * skipPackages 就再也拦不住它（`@genoffice/ui` 被改成
     * `../../../../packages/ui/src/index.js`，26 个 UI kit 文件连带 13 个
     * React 组件进了 vendor，还会触发 React Compiler 告警）。
     * 实测踩过：症状是「bundle 里莫名其妙多了 React 组件」。
     */
    skipPackages: true,
    reason: '上游用 workspace 包名互相引用，vendor 里必须改成相对路径才自封闭',
  },
]

/** 解析一个 shim / 自家包目标，返回从 `fromDir` 出发的导入路径 */
function relativeImport(fromDir, targetAbs) {
  let rel = relative(fromDir, targetAbs).split('\\').join('/')
  if (!rel.startsWith('.')) rel = `./${rel}`
  // 上游源码里指向 .ts 的导入写成 .js（TS 的 NodeNext 约定，Vite 也接受）
  return `from '${rel.replace(/\.ts$/, '.js')}'`
}

/**
 * 每个 vendored 文件顶部加的统一横幅。
 *
 * 为什么需要：vendored 代码是**别人的代码**，它按上游自己的严格度写。
 * 直接拉进 mimir 的 TS program 会报几十处 `string | undefined 不能赋给 string`
 * （mimir 基座开了 noUncheckedIndexedAccess，上游没开），lint 也会因为风格
 * 规则成片报错。两条路：改 vendor（同步会覆盖，改动面越滚越大）或豁免它
 * （保留 vendor 原样，把**适配层 src/ 作为唯一受检查的边界**）。选后者。
 *
 * `@ts-nocheck` 与 `eslint-disable` 是**机械添加**的，所以同步可以重复应用；
 * 行为改动仍然只发生在 src/，这条边界不会因为同步而漂移。
 */
const BANNER = [
  '// @ts-nocheck -- vendored from GenOffice（Apache-2.0）；不要手改，见 vendor/UPSTREAM.json',
  '/* eslint-disable -- vendored，风格由上游决定 */',
  '',
].join('\n')

/** 这些包一律不进 vendor（改写规则也要绕开它们，否则改写会把它们拉进来） */
const SKIP_PACKAGES = [
  '@genoffice/ui',
  '@genoffice/i18n',
  '@genoffice/ai-provider',
  '@genoffice/ai-search',
  '@genoffice/agent-core',
  '@genoffice/project-store',
  '@genoffice/electron-utils',
  '@genoffice/cli',
  '@genoffice/pipelines',
  '@genoffice/pdf2docx',
  '@genoffice/html2docx',
]

/**
 * 应用改写。`vendorRel` 是被改写文件在 vendor 下的相对路径——用它算出
 * 指向 shim 的正确相对路径。
 *
 * 两头都先解析成「以 vendor 根为基准的绝对路径」再求相对，避免手写
 * `../` 的层级数错。上游文件散在三个不同深度（renderer 顶层、
 * renderer/editor/、各包的 src/），写死一次必然有错的那天。
 */
function applyRewrites(text, vendorRel) {
  const fakeRoot = resolve('/vendor-root')
  let out = text
  for (const rule of REWRITES) {
    if (!rule.reason) throw new Error('REWRITES 里每一条都必须写理由')
    if (rule.onlyWhen && !rule.onlyWhen(vendorRel)) continue
    // replace 的回调签名是 (match, p1, p2, …, offset, string)
    out = out.replace(rule.match, (match, p1, p2) => {
      if (rule.byPkg && SKIP_PACKAGES.some((p) => p === `@genoffice/${p1}`)) return match
      const fromDir = resolve(fakeRoot, dirname(vendorRel))
      if (rule.byPkg) {
        const target = resolve(fakeRoot, 'packages', p1, 'src', p2 ? `${p2}.ts` : 'index.ts')
        return relativeImport(fromDir, target)
      }
      return relativeImport(fromDir, resolve(fakeRoot, rule.to))
    })
  }
  // 横幅幂等：已经有就不再叠加（同一文件重复同步不会长出第二份）
  if (!vendorRel.endsWith('.md') && !out.startsWith('// @ts-nocheck')) out = BANNER + out
  return out
}

function parseArgs() {
  const args = process.argv.slice(2)
  const from = args.includes('--from') ? args[args.indexOf('--from') + 1] : null
  const entries = args.flatMap((arg, i) => (arg === '--entry' ? [args[i + 1]] : []))
  const assets = args.flatMap((arg, i) => (arg === '--asset' ? [args[i + 1]] : []))
  if (entries.some((entry) => !entry || entry.startsWith('--') || entry.includes('..')))
    throw new Error('--entry 必须是上游内的相对文件路径')
  if (assets.some((asset) => !asset || asset.startsWith('--') || asset.includes('..')))
    throw new Error('--asset 必须是清单内的资源文件路径')
  return { from, check: args.includes('--check'), entries, assets }
}

function gitHead(repo) {
  return execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
}

/** 闭包计算：从入口文件出发，跟随相对导入与 @genoffice/* 导入 */
function computeClosure(repo, entries, skipPackages) {
  const visited = new Set()
  const skipping = []
  const externals = new Map()

  const resolveSpec = (spec, fromFile) => {
    if (spec.startsWith('.')) return resolveSpecIn(repo, spec, fromFile)
    if (spec.startsWith('@genoffice/')) {
      const parts = spec.split('/')
      const pkgName = parts.slice(0, 2).join('/')
      const sub = parts.slice(2).join('/')
      const dir = join(repo, 'packages', pkgName.replace('@genoffice/', ''))
      if (!existsSync(dir)) return null
      const cands = sub
        ? [join(dir, 'src', `${sub}.ts`), join(dir, 'src', sub, 'index.ts')]
        : [join(dir, 'src', 'index.ts')]
      for (const cand of cands) if (existsSync(cand)) return cand
      return null
    }
    const pkgName = spec.startsWith('@')
      ? spec.split('/').slice(0, 2).join('/')
      : spec.split('/')[0]
    externals.set(pkgName, (externals.get(pkgName) ?? 0) + 1)
    return null
  }

  const walk = (file) => {
    const rel = relative(repo, file)
    if (visited.has(rel) || !existsSync(file)) return
    visited.add(rel)
    /**
     * **先改写，再解析导入。** 顺序不能反：i18n 那类替代是相对导入
     * （`../i18n/locale`），按包名跳过抓不到它；改写后它指向 vendor 之外的
     * shim，resolveSpec 里的「不在 repo 内 → 跳过」规则自然接管。
     * 这也让闭包反映的是**我们实际 vendored 的内容**，而不是上游原样。
     */
    const src = applyRewrites(readFileSync(file, 'utf8'), rel)
    const specs = new Set()
    /**
     * 抓 import 有两处必须同时满足，各是一次实测教训：
     *
     * 1. **允许跨行**：上游大量用多行 `export { … } from './x'`。用「同一行」
     *    写法会静默漏掉整组文件——docx-engine 的 watermark / protection /
     *    blank 等 9 个文件没进闭包，而脚本一声不响（解析不到就跳过）。
     * 2. **不跨越语句边界**：见到 `;` 或另一个 import/export 就停。否则
     *    **注释里**提到 `@genoffice/ui` 也会被当成导入——实测把整个 26 文件的
     *    UI kit 拉进了闭包（`generate.ts` 的注释里写着「Presets live in the
     *    UI layer (@genoffice/ui)」），它带着 React 组件进 bundle。
     *
     * 三条正则各管一种写法：带 `from` 的单行、多行花括号形式、裸导入。
     */
    for (const re of [
      /(?:^|\n)\s*(?:import|export)\s+(?![^'"\n]*(?:;|\bimport\b|\bexport\b))[^'"\n]{0,400}?from\s+['"]([^'"]+)['"]/g,
      /(?:^|\n)\s*(?:import|export)\s*\{[^}]{0,2000}?\}\s*from\s+['"]([^'"]+)['"]/g,
      /(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g,
    ]) {
      for (const m of src.matchAll(re)) specs.add(m[1])
    }
    for (const spec of specs) {
      if (skipPackages.some((p) => spec === p || spec.startsWith(`${p}/`))) {
        skipping.push(`${rel} → ${spec}`)
        continue
      }
      const next = resolveSpec(spec, file)
      if (next) walk(next)
    }
  }

  for (const entry of entries) {
    const abs = join(repo, entry)
    if (!existsSync(abs)) throw new Error(`清单里的入口不存在：${entry}`)
    walk(abs)
  }

  /**
   * **自检：闭包必须自封闭。** 每个被抽出来的文件，它的每个相对导入都要能
   * 在闭包内解析到。
   *
   * 这一条是必须的，因为上面解析不到导入时会**静默跳过**——实测三次踩到：
   * ① `.js` 后缀没映射回 `.ts`，docx-engine 的 35 个文件全丢；
   * ② 多行 `export { … } from` 没被正则抓到，9 个文件漏掉；
   * ③ **依赖被跳过包的模块留在闭包里**（`protected-render.ts` 真 import
   *    `@genoffice/ui`），而改写规则又把包名变成了相对路径，于是 Vite 报
   *    「Failed to resolve import」、整个应用起不来——前两次是「文件少了」，
   *    这次是「文件多了但链是断的」。
   * 三次都是「脚本成功退出而产物不对」。有这条之后同类失误会直接报错。
   *
   * 检查两种断链：
   *   - 相对导入落在闭包外
   *   - **未被改写**的 `@genoffice/*` 导入（说明它依赖被跳过的包，或清单漏了包）
   */
  const fileSet = new Set([...visited].map((rel) => rel))
  const orphans = []
  for (const rel of visited) {
    const abs = join(repo, rel)
    const src = applyRewrites(readFileSync(abs, 'utf8'), rel)
    for (const m of src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      const resolved = resolveSpecIn(repo, m[1], abs)
      // 指向 vendor 之外的（shim）已由 resolveSpec 跳过，这里只查 repo 内的
      if (resolved === null) continue
      if (!fileSet.has(relative(repo, resolved))) orphans.push(`${rel} → ${m[1]}`)
    }
    // 改写后仍留在文件里的 @genoffice/* 就是断链：vendor 里没有那些包
    for (const m of src.matchAll(/from\s+['"](@genoffice\/[^'"]+)['"]/g)) {
      orphans.push(`${rel} → ${m[1]}（未被改写，vendor 里没有这个包）`)
    }
  }
  if (orphans.length > 0) {
    console.error(`\n✗ 闭包不自封闭：${orphans.length} 处导入指向闭包外。`)
    console.error('  常见修法：把该包加进 skipPackages 的 shim 改写，或换掉这个入口。')
    for (const o of orphans.slice(0, 15)) console.error(`    ${o}`)
    process.exit(1)
  }

  return { files: [...visited].toSorted(), skipping, externals }
}

/** 与 computeClosure 内的 resolveSpec 同规则，独立出来供自检使用 */
function resolveSpecIn(repo, spec, fromFile) {
  if (!spec.startsWith('.')) return null
  const base = resolve(dirname(fromFile), spec)
  if (!base.startsWith(repo)) return null
  const stem = base.replace(/\.(js|jsx)$/, '')
  for (const cand of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${stem}.ts`,
    `${stem}.tsx`,
  ]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand
  }
  return null
}

async function main() {
  const { from, check, entries, assets } = parseArgs()
  MANIFEST.entries = [...new Set([...MANIFEST.entries, ...entries])]
  if (!from || !existsSync(from)) {
    console.error(
      '用法：node packages/office/scripts/sync-upstream.mjs --from /path/to/genoffice [--check]',
    )
    process.exit(1)
  }

  const head = gitHead(from)
  console.log(`上游 commit: ${head}`)
  // 精确资源同步不重算闭包、不清理 vendor，也不改版本/时间戳。
  if (assets.length) {
    if (entries.length) throw new Error('--asset 不能与 --entry 同时使用')
    if (head !== MANIFEST.commit) throw new Error('--asset 要求上游 commit 与清单完全一致')
    const selected = [...new Set(assets)].map((name) => {
      const asset = MANIFEST.assets.find((item) => item.from === name)
      if (!asset || !statSync(join(from, asset.from)).isFile())
        throw new Error(`--asset 只能选择清单内的单个资源文件：${name}`)
      return asset
    })
    for (const asset of selected) {
      const dst = join(pkgRoot, 'vendor', asset.to)
      const expected = await readFile(join(from, asset.from))
      const actual = existsSync(dst) ? await readFile(dst) : null
      if (actual?.equals(expected)) continue
      if (check) {
        console.log(`资源不同：${asset.from}`)
        process.exitCode = 1
      } else {
        await mkdir(dirname(dst), { recursive: true })
        await writeFile(dst, expected)
        console.log(`资源 ${asset.from} → vendor/${asset.to}`)
      }
    }
    return
  }
  if (check && head === MANIFEST.commit) {
    console.log('与清单记录的 commit 相同，仍逐个文件核对内容……')
  }

  const { files, skipping, externals } = computeClosure(
    from,
    MANIFEST.entries,
    MANIFEST.skipPackages,
  )
  console.log(`闭包文件数: ${files.length}`)
  console.log(`外部 npm 依赖: ${[...externals.keys()].toSorted().join(', ')}`)
  if (skipping.length) {
    console.log(
      `跳过 ${skipping.length} 处对 ${MANIFEST.skipPackages.join('/')} 的引用（由 shims 承接）`,
    )
  }

  // 资产文件并进清单：它们同样要复制、要参与差异检测（少了这一步，
  // inspector.js 改了不会被发现，而 html 预览会静默用旧脚本）
  for (const extra of EXTRA_FILES) {
    if (!files.includes(extra)) files.push(extra)
  }

  const declared = new Set(MANIFEST.files)
  const found = new Set(files)
  const added = files.filter((f) => !declared.has(f))
  const removed = MANIFEST.files.filter((f) => !found.has(f))
  if (added.length)
    console.log(`\n新增 ${added.length} 个文件（同步后会写进清单）:\n  ${added.join('\n  ')}`)
  if (removed.length)
    console.log(
      `\n清单里有但闭包已不含 ${removed.length} 个（同步后会移除）:\n  ${removed.join('\n  ')}`,
    )

  /**
   * 差异检测。
   *
   * ## 为什么要**过一遍格式化器**再比
   *
   * 同步写出的是 `applyRewrites` 的**原样**产物，而仓库里的 vendor 文件
   * 随后会被 `pnpm format`（oxfmt）重排：改写把 `@genoffice/x` 换成长相对
   * 路径，那条 import 超过行宽就被折成多行；长联合类型也会被折开并在每行
   * **加上前导 `|`**。
   *
   * 结果是**逐字节比会永远报差异**。实测：一份已同步的树跑 `--check` 报
   * 「16 个文件有差异」而它们实际完全一致——于是退出码恒为 1，这个
   * 「上游是否动了我们 vendored 的文件」的探测器**永远在报警**，等于没有。
   *
   * 所以比较前先用**同一个格式化器**（`oxfmt --stdin-filepath`）把期望内容
   * 格式化一遍——那正是 `sync` → `pnpm format` 之后文件该有的样子。
   * 归一化空白是不够的：折行会**新增字符**（前导 `|`），不是只改空白。
   *
   * 格式化器不可用（没装依赖）时退回逐字节比：会吵，但不会漏报。
   */
  const expectedContent = async (rel) => {
    const raw = applyRewrites(await readFile(join(from, rel), 'utf8'), rel)
    try {
      // Use the installed repository formatter. npx can attempt a registry lookup
      // once per file and stall a fully local, fixed-version synchronization.
      return execFileSync(
        resolve(pkgRoot, '../../node_modules/.bin/oxfmt'),
        ['--stdin-filepath', rel],
        {
          input: raw,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore'],
        },
      )
    } catch {
      return raw
    }
  }

  let changed = []
  for (const rel of files) {
    const target = join(pkgRoot, 'vendor', rel)
    const actual = existsSync(target) ? await readFile(target, 'utf8') : null
    if (actual !== (await expectedContent(rel))) changed.push(rel)
  }
  console.log(`\n内容有差异: ${changed.length} 个文件`)

  if (check) {
    if (changed.length) {
      console.log('\n--check 模式，未写文件。差异文件：')
      for (const f of changed.slice(0, 40)) console.log(`  ${f}`)
      if (changed.length > 40) console.log(`  …还有 ${changed.length - 40} 个`)
      process.exitCode = 1
    } else {
      console.log('与上游一致，无需同步。')
    }
    return
  }

  for (const rel of files) {
    const src = join(from, rel)
    const dst = join(pkgRoot, 'vendor', rel)
    await mkdir(dirname(dst), { recursive: true })
    await writeFile(dst, applyRewrites(await readFile(src, 'utf8'), rel))
  }
  /**
   * 清理 vendor 里**不在当前闭包**的文件。
   *
   * 不能只删 `removed`（那只是「清单里有、闭包不含」的差集）：上一次同步
   * 误纳的文件从未进过清单，就会永久残留在 vendor 里——实测踩过：注释里
   * 的 `@genoffice/ui` 被当成导入，26 个 UI kit 文件写进了 vendor，
   * 修好正则后它们仍在（清单不含、但也没人删），React Compiler 照旧报错。
   * 所以这里以「闭包」为准做全量对齐。
   */
  const keep = new Set(files.map((rel) => join(pkgRoot, 'vendor', rel)))
  for (const asset of [...MANIFEST.assets, ...(MANIFEST.fixtures ?? [])]) {
    void asset // 资源目录整体拷贝，不参与逐文件清理
  }
  async function pruneVendor(dir) {
    let directoryEntries
    try {
      directoryEntries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of directoryEntries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        // 资源目录（字体等）由 assets 管理，跳过
        const relFromVendor = relative(join(pkgRoot, 'vendor'), full)
        if (
          MANIFEST.assets.some(
            (a) => a.to === relFromVendor || a.to.startsWith(`${relFromVendor}/`),
          )
        )
          continue
        if (
          MANIFEST.fixtures?.some(
            (a) => a.to === relFromVendor || a.to.startsWith(`${relFromVendor}/`),
          )
        )
          continue
        await pruneVendor(full)
        // 空目录也清掉
        if ((await readdir(full)).length === 0) await rm(full, { recursive: true, force: true })
      } else if (
        entry.name.endsWith('.ts') ||
        entry.name.endsWith('.tsx') ||
        entry.name.endsWith('.mjs')
      ) {
        if (!keep.has(full)) await rm(full, { force: true })
      }
    }
  }
  await pruneVendor(join(pkgRoot, 'vendor'))
  // 静态资源（字体等）整个目录拷贝
  for (const asset of [...MANIFEST.assets, ...(MANIFEST.fixtures ?? [])]) {
    const src = join(from, asset.from)
    const dst = join(pkgRoot, 'vendor', asset.to)
    await rm(dst, { recursive: true, force: true })
    await cp(src, dst, { recursive: true })
    console.log(`资源 ${asset.from} → vendor/${asset.to}`)
  }

  await writeFile(
    manifestPath,
    `${JSON.stringify({ ...MANIFEST, commit: head, syncedAt: new Date().toISOString(), files }, null, 2)}\n`,
  )

  /**
   * 顺带裁剪样式：vendored 的 styles.css 是整个办公应用的样式表（264 KB），
   * 直接引会污染 mimir（`:root` 变量、`body` 规则）。裁剪规则与理由见
   * trim-editor-css.mjs。**跟着同步一起跑**，样式才不会与 vendor 版本脱节。
   */
  execFileSync(process.execPath, [join(here, 'trim-editor-css.mjs')], { stdio: 'inherit' })

  console.log(`\n同步完成：${files.length} 个文件 + ${MANIFEST.assets.length} 份资源。清单已更新。`)
}

await main()
