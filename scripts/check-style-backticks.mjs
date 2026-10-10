#!/usr/bin/env node
/**
 * 检查 CSS 模板字符串里有没有多余的反引号。
 *
 * ## 为什么需要这个脚本
 *
 * `createStyles` / `createGlobalStyle` 的样式体是**模板字符串**，而反引号
 * 会提前把它结束掉——于是整段样式变成非法 TS，报错位置指向一句看起来
 * 毫无问题的中文注释：
 *
 * ```
 * Expected `,` or `}` but found `Identifier`
 *   ,-[/…/NavSidebar.style.ts:19:71]
 * 19 | export const createStyles(({ css, token, prefixCls }) => ({
 *    :                                                       `-- Opened here
 * ```
 *
 * ## 为什么不是一条测试
 *
 * 它**已经有**一条测试（`theme/design.test.ts` 的「样式模板里没有多余的
 * 反引号」），但那条救不了正在写代码的人：写完 → 跑测试 → 红 → 回去改，
 * 而中间那一步极容易被跳过（`pnpm dev` 会直接报编译错误，看起来像别的问题）。
 *
 * 这个坑到写这个脚本时已经咬过**六次**，每次都是同一件事——往注释里写
 * 一对用于强调的反引号（Markdown 习惯）。**文档与测试都拦不住手，
 * 所以改成在 `pnpm check` 里报**：那条命令是提交前的默认动作。
 *
 * 用法：`node scripts/check-style-backticks.mjs`（由根 package.json 的 lint 调用）。
 */

import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

const ROOTS = [
  'apps/web/src',
  'apps/server/src',
  // 对话包（D-099）：它的 createStyles 块同样在这条守卫的射程里。
  // 漏掉它的表现是「代码搬走了、守卫以为它还在」——而扫目录正是这条
  // 守卫唯一的存在理由
  'packages/chat/src',
]
/** 只扫这些形态的模板开头，避免把普通的 `${'`'}` 之类误判 */
const OPENER = /(?:^|\s)(?:css|createGlobalStyle)`/
/** 收尾反引号独占一行（缩进 + 反引号，后面可跟一个逗号） */
const TERMINATOR = /^\s*`\s*,?\s*$/

/** @param {string} dir @returns {Promise<string[]>} */
async function walk(dir) {
  const found = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      found.push(...(await walk(path)))
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) {
      found.push(path)
    }
  }
  return found
}

const offenders = []

for (const root of ROOTS) {
  for (const file of await walk(root)) {
    const text = await readFile(file, 'utf8')
    let inside = false

    text.split('\n').forEach((line, index) => {
      if (!inside && OPENER.test(line)) {
        inside = true
        return
      }
      if (!inside) return

      if (TERMINATOR.test(line)) {
        inside = false
      } else if (line.includes('`')) {
        offenders.push(`${relative(process.cwd(), file)}:${index + 1}: ${line.trim().slice(0, 70)}`)
      }
    })
  }
}

if (offenders.length > 0) {
  console.error('样式模板体内出现了反引号，会提前结束模板字符串：\n')
  for (const line of offenders) console.error(`  ${line}`)
  console.error(
    '\n注释里想强调某个 CSS 属性时，用「」或 ** 包起来，不要用反引号。' +
      '（详见 .trellis/spec/project/architecture.md 第 10 节的坑表）',
  )
  process.exit(1)
}

console.log('样式模板里没有多余的反引号')
