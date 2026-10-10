import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { DesktopModeState } from '@mimir/shared/desktop'

/**
 * 客户端模式选择的持久化（D-100）。
 *
 * ## 为什么存在文件里，不进服务端设置表
 *
 * 它是**载体事实**：选择必须能在服务端不可达时完成与修改（云端模式连不上
 * 时用户要能改回本地），而服务端设置表恰恰在那时读不到。位置在
 * `<userData>/desktop-config.json`——与数据目录同一棵树，卸载重装的行为
 * 与数据一致（`.trellis/spec/project/architecture.md` §7.5 的分层里的「部署事实」一类）。
 *
 * ## 读失败一律当「还没选过」
 *
 * 文件不存在、不是 JSON、形状不认识——三种都返回 null，界面回到选择页。
 * 抛错会让「配置坏了一行」变成「应用打不开」，而那正是用户最需要能打开
 * 选择页的时刻。损坏的内容会保留在磁盘上（不自动删），排查时还在。
 */
export const CONFIG_FILE = 'desktop-config.json'

export function configPath(userDataDir: string): string {
  return join(userDataDir, CONFIG_FILE)
}

/** 形状校验。窄到只认我们写出去的那两种形状，别的都算「没选过」 */
export function parseModeConfig(raw: unknown): DesktopModeState | null {
  if (typeof raw !== 'object' || raw === null) return null
  const value = raw as { mode?: unknown; cloudUrl?: unknown }

  if (value.mode === 'local') return { mode: 'local' }
  if (value.mode === 'cloud' && typeof value.cloudUrl === 'string' && value.cloudUrl) {
    return { mode: 'cloud', cloudUrl: value.cloudUrl }
  }
  return null
}

export async function readModeConfig(userDataDir: string): Promise<DesktopModeState | null> {
  try {
    const text = await readFile(configPath(userDataDir), 'utf8')
    return parseModeConfig(JSON.parse(text))
  } catch {
    return null
  }
}

/**
 * 写入选择。**先写临时文件再改名**：直接覆盖时电源断了会留下半截 JSON，
 * 而半截 JSON 的表现是「下次启动又回到选择页」——用户的模式选择静默丢失。
 * rename 在同一文件系统内是原子的（配置与目标同目录，所以成立）。
 */
export async function writeModeConfig(userDataDir: string, state: DesktopModeState): Promise<void> {
  const target = configPath(userDataDir)
  const temp = `${target}.tmp`
  await mkdir(dirname(target), { recursive: true })
  await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  await rename(temp, target)
}
