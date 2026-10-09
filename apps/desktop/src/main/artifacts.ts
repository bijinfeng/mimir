import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 宿主启动时必需的产物。缺失时给出清单式错误（而不是难懂的 ERR_MODULE_NOT_FOUND）。
 */
export interface Artifact {
  /** 用户可读的标签（如"服务端入口"） */
  label: string
  /** 绝对路径 */
  path: string
  /** 缺失后果（如"动态 import 失败"） */
  consequence: string
}

/**
 * 本地模式必需的产物清单。
 *
 * @param serverDist - apps/server/dist 的绝对路径
 * @param serverRoot - apps/server 的绝对路径（用于定位 drizzle-sqlite）
 * @param webDist - 渲染进程产物目录（本包的 dist/renderer，D-103）
 */
export function requiredArtifacts(
  serverDist: string,
  serverRoot: string,
  webDist: string,
): Artifact[] {
  return [
    {
      label: '服务端入口',
      path: join(serverDist, 'index.js'),
      consequence: '动态 import 失败（ERR_MODULE_NOT_FOUND）',
    },
    {
      label: '迁移脚本',
      path: join(serverDist, 'db', 'migrate.js'),
      consequence: 'SQLite 自动迁移失败',
    },
    {
      label: 'drizzle 迁移目录',
      path: join(serverRoot, 'drizzle-sqlite'),
      consequence: '启动报缺表（找不到迁移 SQL）',
    },
    {
      label: '前端入口',
      path: join(webDist, 'index.html'),
      consequence: '页面 404（静态服务找不到 index.html）',
    },
  ]
}

/**
 * 找出缺失的产物。
 */
export function findMissing(artifacts: Artifact[]): Artifact[] {
  return artifacts.filter((a) => !existsSync(a.path))
}

/**
 * 格式化缺失清单为用户可读的错误信息（含修复命令）。
 */
export function formatMissingMessage(missing: Artifact[]): string {
  const list = missing
    .map((a) => `  - ${a.label}（${a.path}）\n    后果：${a.consequence}`)
    .join('\n')

  return `缺少 ${missing.length} 个必需产物：

${list}

修复：pnpm desktop:start（会先构建 server，再构建桌面端三段）`
}
