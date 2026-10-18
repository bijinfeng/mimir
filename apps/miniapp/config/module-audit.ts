import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Compiler } from 'webpack'

/** Build-time evidence: runtime dependencies actually admitted to this compilation. */
export class ModuleAuditPlugin {
  apply(compiler: Compiler) {
    compiler.hooks.done.tap('MimirModuleAudit', (stats) => {
      if (stats.hasErrors()) return
      const directory = resolve(__dirname, '../.temp')
      mkdirSync(directory, { recursive: true })
      const modules = Array.from(stats.compilation.modules, (module) =>
        module.identifier(),
      ).toSorted()
      writeFileSync(resolve(directory, 'runtime-modules.json'), JSON.stringify(modules, null, 2))
    })
  }
}
