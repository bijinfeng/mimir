import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * core / runtime 的边界守卫。
 *
 * 这个重构的全部价值在于「core 不知道宿主是谁」：一旦某个业务文件又去读
 * `process.env` 或 import `runtime/`，桌面与 fnOS 的差异就会重新漏回业务层，
 * 而症状通常不是报错，是「某个部署下悄悄用了另一个路径」。
 *
 * 断言按**源码文本**做，是刻意的：ESLint 的 no-restricted-imports 只看静态
 * import，`process.env` 与动态 import 都漏；这里一次覆盖两类。
 */

const sourceRoot = resolve(import.meta.dirname, '..')

/** 注释里出现这些词是说明文字，不是依赖；去掉注释再断言。 */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function read(relativePath: string): string {
  return readFileSync(join(sourceRoot, relativePath), 'utf8')
}

function listCoreFiles(): string[] {
  const files = ['app.ts', 'boot.ts', 'auth.ts', 'server-runtime.ts']
  const directories = ['db', 'lib', 'middleware', 'plugins', 'routes', 'search', 'services']
  for (const directory of directories) {
    for (const entry of readdirSync(join(sourceRoot, directory), { recursive: true })) {
      const path = String(entry)
      const absolute = join(sourceRoot, directory, path)
      if (!path.endsWith('.ts')) continue
      if (path.endsWith('.test.ts')) continue
      // 只收文件：readdirSync 的 recursive 结果里目录也会出现
      try {
        readFileSync(absolute)
      } catch {
        continue
      }
      files.push(join(directory, path))
    }
  }
  return files
}

describe('core / runtime 边界', () => {
  it('core 不读 process.env、不 import runtime、不知道平台变量名', () => {
    const offenders: string[] = []
    for (const file of listCoreFiles()) {
      const code = codeOnly(read(file))
      if (/\bprocess\.env\b/.test(code)) offenders.push(`${file}: process.env`)
      if (/\bruntime\//.test(code)) offenders.push(`${file}: runtime/`)
      if (/MIMIR_FNOS_|MIMIR_LOCAL_MODE|MIMIR_BASE_PATH|\bWEB_DIST\b/.test(code)) {
        offenders.push(`${file}: 平台变量名`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('中立的 config.ts 不依赖 core 的重模块', () => {
    const code = codeOnly(read('config.ts'))
    expect(code).not.toMatch(/from ['"][^'"]*runtime\//)
    expect(code).not.toMatch(/from ['"]\.\/boot/)
    expect(code).not.toMatch(/from ['"]\.\/app/)
    expect(code).not.toMatch(/from ['"]\.\/db\/schema/)
  })

  it('server-runtime.ts 属于 core：不 import runtime', () => {
    const code = codeOnly(read('server-runtime.ts'))
    expect(code).not.toMatch(/\bruntime\//)
    expect(code).toContain('ensureServerRuntime')
  })

  it('startRuntime 先 configureServer，再动态 import boot', () => {
    const code = codeOnly(read('runtime/start.ts'))
    const configureAt = code.indexOf('configureServer(toServerConfig(config))')
    const bootImportAt = code.indexOf("import('../boot.js')")
    expect(configureAt).toBeGreaterThanOrEqual(0)
    expect(bootImportAt).toBeGreaterThan(configureAt)
    // 静态 import boot 会让 core 在配置之前加载，db/schema.ts 选错方言
    expect(code).not.toMatch(/from ['"]\.\.\/boot\.js['"]/)
  })

  it('db/schema.ts 的方言来自配置快照，而不是模块加载时的 env', () => {
    const code = codeOnly(read('db/schema.ts'))
    expect(code).toContain('getServerConfig()')
    expect(code).not.toMatch(/process\.env/)
  })
})
