import type { Capturer, CaptureRaw, PluginSettings } from '@mimir/shared'
import { USER_AGENT, fetchLimits } from './http.js'

/**
 * GitHub 仓库抓取器。
 *
 * 走 API 取 README + 元数据，**不克隆仓库**（`.trellis/spec/project/product.md` §3.3）：
 * 只抓 README 和 `docs/`，不拉整个仓库。
 *
 * ## 限额
 *
 * 没有 token 时 GitHub API 限额 60 次/小时，够个人用；
 * 配了 `capture.githubToken` 提到 5000。密钥加密落库（`.trellis/spec/project/architecture.md` §7.6）。
 *
 * 403 与 404 分开报，因为对用户的下一步动作不同：
 * 404 是「这个仓库不存在或私有」，403 是「配额用完了，配个 token 就好」。
 */
export function createGithubCapturer(settings: PluginSettings): Capturer {
  return {
    id: 'github',
    matches: (url) => /github\.com/i.test(url),

    async run(url: string): Promise<CaptureRaw> {
      const parsed = parseGithubUrl(url)
      if (!parsed) {
        throw new Error('无法解析 GitHub 链接（需要 https://github.com/owner/repo 形式）')
      }

      const limits = await fetchLimits(settings)
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      }

      const token = await settings.getSecret('capture.githubToken')
      if (token.ok) headers.Authorization = `Bearer ${token.value}`

      const repoResponse = await fetch(
        `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`,
        { headers, signal: AbortSignal.timeout(limits.timeoutMs) },
      )

      if (repoResponse.status === 404) {
        throw new Error('仓库不存在，或它是私有的（私有仓库需要配 GitHub Token）')
      }
      if (repoResponse.status === 403) {
        throw new Error(
          'GitHub API 限额用尽。配置 GitHub Token 可以把限额从 60 次/小时提到 5000 次',
        )
      }
      if (!repoResponse.ok) {
        throw new Error(`GitHub API 返回 ${repoResponse.status}`)
      }

      const repo = (await repoResponse.json()) as {
        full_name: string
        description: string | null
        stargazers_count: number
        language: string | null
        license: { spdx_id: string } | null
        topics?: string[]
        homepage: string | null
      }

      // README 单独一次请求。用 raw 而不是 API 的 base64 content——
      // 后者在 README 超过 1 MB 时会返回空字符串
      const readmeResponse = await fetch(
        `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/HEAD/README.md`,
        { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(limits.timeoutMs) },
      )
      const readme = readmeResponse.ok ? await readmeResponse.text() : ''

      const meta = [
        `- **仓库**：${repo.full_name}`,
        repo.description ? `- **简介**：${repo.description}` : null,
        repo.language ? `- **语言**：${repo.language}` : null,
        `- **Star**：${repo.stargazers_count}`,
        repo.license ? `- **许可**：${repo.license.spdx_id}` : null,
        repo.topics?.length ? `- **主题**：${repo.topics.join(', ')}` : null,
        repo.homepage ? `- **主页**：${repo.homepage}` : null,
      ]
        .filter(Boolean)
        .join('\n')

      const markdown = `## 仓库信息\n\n${meta}\n\n## README\n\n${readme || '（该仓库没有 README）'}`

      return {
        kind: 'github',
        title: repo.full_name + (repo.description ? ` — ${repo.description}` : ''),
        // README 本来就是 Markdown：再走一遍 HTML 转换是倒退
        // （会丢掉围栏语言标注、重排表格）。所以这里声明成 markdown
        content: { type: 'markdown', markdown },
        imageCount: (readme.match(/!\[[^\]]*\]\(/g) ?? []).length,
      }
    },
  }
}

function parseGithubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([^/\s]+)\/([^/?#\s]+)/i)
  if (!match?.[1] || !match[2]) return null
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') }
}
