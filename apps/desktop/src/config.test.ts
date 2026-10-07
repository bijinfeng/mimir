import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { configPath, parseModeConfig, readModeConfig, writeModeConfig } from './config.js'

/**
 * 模式选择的持久化（D-100）。
 *
 * 三条要守的：写出去能读回来、坏文件不炸、写是原子的（半截 JSON 的表现是
 * 「下次启动又回到选择页」——用户的选择静默丢失）。
 */

const dirs: string[] = []

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'mimir-desktop-config-'))
  dirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('parseModeConfig', () => {
  it('认识两种合法形状', () => {
    expect(parseModeConfig({ mode: 'local' })).toEqual({ mode: 'local' })
    expect(parseModeConfig({ mode: 'cloud', cloudUrl: 'https://k.example.com' })).toEqual({
      mode: 'cloud',
      cloudUrl: 'https://k.example.com',
    })
  })

  it('云端缺地址、模式名不认识、非对象一律算「没选过」', () => {
    expect(parseModeConfig({ mode: 'cloud' })).toBeNull()
    expect(parseModeConfig({ mode: 'cloud', cloudUrl: '' })).toBeNull()
    expect(parseModeConfig({ mode: 'serverful' })).toBeNull()
    expect(parseModeConfig(null)).toBeNull()
    expect(parseModeConfig('local')).toBeNull()
  })
})

describe('读 / 写 / 再读', () => {
  it('往返一致', async () => {
    const dir = await tempDir()
    await writeModeConfig(dir, { mode: 'cloud', cloudUrl: 'https://k.example.com' })

    const text = await readFile(configPath(dir), 'utf8')
    expect(JSON.parse(text)).toEqual({ mode: 'cloud', cloudUrl: 'https://k.example.com' })
    expect(await readModeConfig(dir)).toEqual({ mode: 'cloud', cloudUrl: 'https://k.example.com' })
  })

  it('覆盖写入不留临时文件', async () => {
    const dir = await tempDir()
    await writeModeConfig(dir, { mode: 'local' })
    await writeModeConfig(dir, { mode: 'cloud', cloudUrl: 'https://a.example.com' })
    expect(await readModeConfig(dir)).toEqual({ mode: 'cloud', cloudUrl: 'https://a.example.com' })

    const { readdir } = await import('node:fs/promises')
    expect(await readdir(dir)).toEqual(['desktop-config.json'])
  })

  it('文件不存在时返回 null（首次启动的正常路径）', async () => {
    const dir = await tempDir()
    expect(await readModeConfig(dir)).toBeNull()
  })

  it('坏 JSON 不炸，也不清掉现场', async () => {
    const dir = await tempDir()
    await writeFile(configPath(dir), '{ 这不是 JSON', 'utf8')
    expect(await readModeConfig(dir)).toBeNull()
    // 留在磁盘上，排查时还在（不能悄悄抹掉用户的现场）
    expect(await readFile(configPath(dir), 'utf8')).toBe('{ 这不是 JSON')
  })

  it('形状对但取值不认识时也是「没选过」', async () => {
    const dir = await tempDir()
    await writeFile(configPath(dir), JSON.stringify({ mode: 'something-else' }), 'utf8')
    expect(await readModeConfig(dir)).toBeNull()
  })
})
