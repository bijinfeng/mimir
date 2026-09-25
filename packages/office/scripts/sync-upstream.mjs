#!/usr/bin/env node
/**
 * 从上游 GenOffice 同步 vendored 代码（`packages/office`）。
 *
 * ## 这个包是什么
 *
 * mimir 需要「在浏览器里预览并编辑 docx」。现成路线里没有许可宽松、可自托管、
 * 且能真编辑的库（见 docs/RESEARCH.md §13 的调研）：ONLYOFFICE 要 1.9 GB 容器、
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
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
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
    // replace 的回调签名是 (match, p1, p2, …, offset, string)
    out = out.replace(rule.match, (match, p1, p2) => {
      const fromDir = resolve(fakeRoot, dirname(vendorRel))
      if (rule.byPkg) {
        const target = resolve(fakeRoot, 'packages', p1, 'src', p2 ? `${p2}.ts` : 'index.ts')
        return relativeImport(fromDir, target)
      }
      return relativeImport(fromDir, resolve(fakeRoot, rule.to))
    })
  }
  // 横幅幂等：已经有就不再叠加（同一文件重复同步不会长出第二份）
  if (!out.startsWith('// @ts-nocheck')) out = BANNER + out
  return out
}

function parseArgs() {
  const args = process.argv.slice(2)
  const from = args.includes('--from') ? args[args.indexOf('--from') + 1] : null
  return { from, check: args.includes('--check') }
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
     * 抓导入必须**允许跨行**：上游大量使用多行形式
     * ```ts
     * export {
     *   TABLE_HEADER_FILL,
     *   applyImageWrap,
     * } from './watermark'
     * ```
     * 用 `[^'"\n]*` 那种「同一行」写法会**静默漏掉整组文件**——实测踩过：
     * docx-engine 的 watermark / protection / blank 等 9 个文件没进闭包，
     * 而脚本一声不响（解析不到就跳过）。所以下面用 [\s\S] 并配合自检。
     */
    for (const re of [
      /(?:^|\n)\s*(?:import|export)[\s\S]{0,2000}?from\s+['"]([^'"]+)['"]/g,
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
   * 这一条是必须的，因为上面解析不到导入时会**静默跳过**——实测两次踩到：
   * ① `.js` 后缀没映射回 `.ts`，docx-engine 的 35 个文件全丢；
   * ② 多行 `export { … } from` 没被正则抓到，9 个文件漏掉。
   * 两次都是「脚本成功退出、文件少了一批」，靠事后人工数文件才发现。
   * 有这条之后同样的失误会在同步时直接报错。
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
  }
  if (orphans.length > 0) {
    console.error(`\n✗ 闭包不自封闭：${orphans.length} 处相对导入指向闭包外的文件。`)
    console.error('  这说明上面的导入抓取或后缀映射漏了东西——不要忽略，先修脚本。')
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
    if (existsSync(cand) && !cand.endsWith('/')) return cand
  }
  return null
}

async function main() {
  const { from, check } = parseArgs()
  if (!from || !existsSync(from)) {
    console.error(
      '用法：node packages/office/scripts/sync-upstream.mjs --from /path/to/genoffice [--check]',
    )
    process.exit(1)
  }

  const head = gitHead(from)
  console.log(`上游 commit: ${head}`)
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

  let changed = []
  for (const rel of files) {
    const target = join(pkgRoot, 'vendor', rel)
    const expected = applyRewrites(await readFile(join(from, rel), 'utf8'), rel)
    const actual = existsSync(target) ? await readFile(target, 'utf8') : null
    if (actual !== expected) changed.push(rel)
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
  // 清理已不在闭包里的旧文件
  for (const rel of removed) {
    await rm(join(pkgRoot, 'vendor', rel), { force: true })
  }
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
