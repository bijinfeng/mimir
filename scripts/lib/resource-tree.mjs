import { copyFile, lstat, readdir, readlink, realpath, unlink } from 'node:fs/promises'
import path from 'node:path'

/** The host must survive archive extraction into a different install directory. */
export async function finalizeResourceTree(root) {
  const canonicalRoot = await realpath(root)
  let files = 0
  let materialized = 0
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isSymbolicLink()) {
        const target = await readlink(file)
        const relative = path.relative(canonicalRoot, await realpath(file))
        if (
          path.isAbsolute(target) ||
          path.isAbsolute(relative) ||
          relative === '..' ||
          relative.startsWith(`..${path.sep}`)
        )
          throw new Error(`Non-portable resource link: ${file} -> ${target}`)
        const resolved = await realpath(file)
        if (!(await lstat(resolved)).isFile())
          throw new Error(
            `Resource directory link must be deployed with --node-linker hoisted: ${file} -> ${target}`,
          )
        // Only file aliases (e.g. POSIX .bin shims) are copied. Never follow a dependency graph.
        await unlink(file)
        await copyFile(resolved, file)
        materialized++
        files++
      } else if (entry.isDirectory()) await visit(file)
      else if (entry.isFile()) files++
      else throw new Error(`Unsupported resource entry: ${file}`)
    }
  }
  await visit(canonicalRoot)
  return { files, materialized }
}
