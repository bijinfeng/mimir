import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { requiredArtifacts, findMissing, formatMissingMessage } from './artifacts.js'

describe('artifacts', () => {
  it('全齐时返回空', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'artifacts-test-'))
    try {
      const serverDist = join(tmp, 'server', 'dist')
      const serverRoot = join(tmp, 'server')
      const webDist = join(tmp, 'web', 'dist')

      // 建全部四个必需产物
      mkdirSync(join(serverDist, 'db'), { recursive: true })
      writeFileSync(join(serverDist, 'index.js'), '')
      writeFileSync(join(serverDist, 'db', 'migrate.js'), '')
      mkdirSync(join(serverRoot, 'drizzle-sqlite'), { recursive: true })
      mkdirSync(webDist, { recursive: true })
      writeFileSync(join(webDist, 'index.html'), '')

      const artifacts = requiredArtifacts(serverDist, serverRoot, webDist)
      const missing = findMissing(artifacts)

      expect(missing).toEqual([])
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('缺一个时只列该项', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'artifacts-test-'))
    try {
      const serverDist = join(tmp, 'server', 'dist')
      const serverRoot = join(tmp, 'server')
      const webDist = join(tmp, 'web', 'dist')

      // 只建其中三个，漏掉 migrate.js
      mkdirSync(serverDist, { recursive: true })
      writeFileSync(join(serverDist, 'index.js'), '')
      mkdirSync(join(serverRoot, 'drizzle-sqlite'), { recursive: true })
      mkdirSync(webDist, { recursive: true })
      writeFileSync(join(webDist, 'index.html'), '')

      const artifacts = requiredArtifacts(serverDist, serverRoot, webDist)
      const missing = findMissing(artifacts)

      expect(missing).toHaveLength(1)
      expect(missing[0]?.label).toBe('迁移脚本')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('全缺时列全部', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'artifacts-test-'))
    try {
      const serverDist = join(tmp, 'nonexist', 'dist')
      const serverRoot = join(tmp, 'nonexist')
      const webDist = join(tmp, 'nonexist-web', 'dist')

      const artifacts = requiredArtifacts(serverDist, serverRoot, webDist)
      const missing = findMissing(artifacts)

      expect(missing).toHaveLength(4)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('formatMissingMessage 含修复命令与后果', () => {
    const missing = [
      { label: '服务端入口', path: '/x/index.js', consequence: '动态 import 失败' },
      { label: '前端入口', path: '/y/index.html', consequence: '页面 404' },
    ]

    const message = formatMissingMessage(missing)

    expect(message).toContain('缺少 2 个必需产物')
    expect(message).toContain('服务端入口')
    expect(message).toContain('/x/index.js')
    expect(message).toContain('动态 import 失败')
    expect(message).toContain('pnpm desktop:start')
  })
})
