import path from 'node:path'

/** ASAR 3.x traverses archive keys by the host path separator. */
export function extractArchiveFile(archive, entry, extractFile) {
  return extractFile(archive, path.normalize(entry.replaceAll('\\', '/')))
}

/** Read actual root dependency bytes; listPackage uses host-specific display separators. */
export function verifyPackagedUpdater(archive, extractFile) {
  const packageRoot = 'node_modules/electron-updater'
  const updater = JSON.parse(
    extractArchiveFile(archive, `${packageRoot}/package.json`, extractFile).toString(),
  )
  if (updater.name !== 'electron-updater' || updater.version !== '6.8.9')
    throw new Error('Wrong packaged electron-updater module')
  if (typeof updater.main !== 'string' || !updater.main)
    throw new Error('Missing packaged electron-updater main entry')
  const main = path.posix.normalize(`${packageRoot}/${updater.main.replaceAll('\\', '/')}`)
  if (!main.startsWith(`${packageRoot}/`) || !extractArchiveFile(archive, main, extractFile).length)
    throw new Error('Missing packaged electron-updater main entry')
}
