import { describe, expect, it } from 'vitest'
import { normalizeReleaseNotes } from './release-notes.js'
import { UpdateController } from './updater.js'

// Actual official v0.1.4 body, preserved in verification/mac-official-manual/official-releases.json.
const officialNotes = `<!-- mimir-desktop-build:127d4b7af8d483521fea8e3ea3c9454a57535fc1 -->

桌面客户端安装包与 fnOS x86_64 原生 FPK。macOS 默认是需手动更新的测试包；fnOS 通过系统管理安装和升级。各平台限制和更新说明见仓库 README。

**Full Changelog**: https://github.com/bijinfeng/mimir/compare/v0.1.3...v0.1.4`

describe('release notes display text', () => {
  it('removes the internal ownership comment from real public release notes', () => {
    expect(normalizeReleaseNotes(officialNotes)).toBe(
      '桌面客户端安装包与 fnOS x86_64 原生 FPK。macOS 默认是需手动更新的测试包；fnOS 通过系统管理安装和升级。各平台限制和更新说明见仓库 README。\n\nFull Changelog: https://github.com/bijinfeng/mimir/compare/v0.1.3...v0.1.4',
    )
  })
  it('makes common GitHub Markdown readable without turning links into actions', () => {
    expect(
      normalizeReleaseNotes(
        '## 更新内容\n- **保存**与 *检索* 改进\n* [x] 支持 `fnOS`\n1. [发布记录](https://example.com/a_(b))\n\n[说明][details]\n[details]: javascript:alert(1)\n\n![图片](https://example.com/tracker.png)\n\n_强调_、snake_case 与 x86_64 保留',
      ),
    ).toBe(
      '更新内容\n• 保存与 检索 改进\n• 支持 fnOS\n1. 发布记录\n\n说明\n\n图片\n\n强调、snake_case 与 x86_64 保留',
    )
  })
  it('handles updater HTML notes as text and removes comments and active HTML content', () => {
    expect(
      normalizeReleaseNotes(
        '<!-- private -->\n<h2>更新 &amp; 改进</h2><ul><li><strong>修复</strong>保存</li><li><a href="javascript:alert(1)">查看说明</a></li></ul><script>alert(1)</script><style>body{display:none}</style><img src=x onerror="alert(1)"><iframe src="https://evil.test">hidden</iframe>',
      ),
    ).toBe('更新 & 改进\n\n• 修复保存\n\n• 查看说明')
    expect(normalizeReleaseNotes('正常内容\n&lt;!-- mimir-desktop-build:abc --&gt;')).toBe(
      '正常内容',
    )
    expect(normalizeReleaseNotes('保留正文<!-- unfinished hidden marker')).toBe('保留正文')
    expect(normalizeReleaseNotes('<script>unterminated')).toBeUndefined()
  })
  it('omits empty or metadata-only notes and uses the same normalization for every version', () => {
    for (const notes of [null, undefined, '', ' \r\n ', '<!-- metadata -->', '<p> </p>', []]) {
      expect(normalizeReleaseNotes(notes)).toBeUndefined()
    }
    expect(
      normalizeReleaseNotes([
        { version: '0.1.4', note: officialNotes },
        { version: '0.1.3', note: null },
        { version: '0.1.2', note: '<!-- hidden -->' },
        { version: '0.1.1', note: '## Earlier\n- **修复**' },
      ]),
    ).toBe(`${normalizeReleaseNotes(officialNotes)}\n\nEarlier\n• 修复`)
  })
  it('publishes normalized notes for both API string and updater array inputs', async () => {
    for (const releaseNotes of [officialNotes, [{ version: '0.1.4', note: officialNotes }]]) {
      const controller = new UpdateController({
        currentVersion: '0.1.3',
        platform: 'darwin',
        arch: 'arm64',
        capability: 'manual',
        preferences: { autoDownload: false },
        persist: async () => {},
        driver: {
          check: async () => ({ version: '0.1.4', releaseNotes }),
          download: async () => {},
          install: () => {},
        },
        prepareInstall: async () => {},
        notify: () => {},
        log: () => {},
      })
      await controller.check()
      expect(controller.getState()).toMatchObject({
        status: 'available',
        releaseNotes: normalizeReleaseNotes(officialNotes),
        releaseUrl: 'https://github.com/bijinfeng/mimir/releases/tag/v0.1.4',
      })
      controller.dispose()
    }
  })
})
