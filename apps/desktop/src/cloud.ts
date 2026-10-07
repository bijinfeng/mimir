/**
 * 云端模式的地址处理（D-100）：归一化与探活。
 *
 * 抽成一个**不依赖 Electron** 的模块，是为了让它能被单测直接跑——
 * URL 的归一化规则与失败措辞是用户唯一能看到的界面，靠手工点太不可靠
 * （尤其「内网地址默认 http、公网默认 https」这条，错了会表现成
 * 「连不上」，而用户会去查服务器）。
 */

export interface CloudUrlResult {
  ok: boolean
  /** 归一化后的地址（ok 时有意义） */
  url?: string
  /** 失败原因，直接展示给用户 */
  message?: string
}

/**
 * 没有写协议时补哪一个。
 *
 * | 主机 | 补 | 为什么 |
 * |---|---|---|
 * | `localhost` / `127.x` / `::1` | http | 本机服务几乎不会带证书；https 会直接 TLS 失败 |
 * | 内网段（10/8、172.16/12、192.168/16）与 `.local` | http | 家庭/公司自托管同样不带证书（与 Jellyfin、Home Assistant 客户端的做法一致） |
 * | 其余（域名、公网 IP） | https | 暴露到公网的部署必须带证书；补 http 会得到一个「连上了但被拒」的更难懂的错 |
 *
 * 用户写全了协议就完全按他写的来——这个函数只负责「没写」的那一半。
 */
export function defaultScheme(hostname: string): 'http' | 'https' {
  const host = hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost')) return 'http'
  if (host === '127.0.0.1' || host === '::1') return 'http'
  if (host.startsWith('127.')) return 'http'
  if (host.startsWith('10.')) return 'http'
  if (host.startsWith('192.168.')) return 'http'
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return 'http'
  if (host.endsWith('.local')) return 'http'
  return 'https'
}

/**
 * 把用户输入的地址收敛成一个可加载的源。
 *
 * 规则很少，但每一条都对应一种真实的输入习惯：
 *  - 前后空格、粘贴时带上的换行 → 去掉（粘贴是最常见的入口）
 *  - 没写协议 → 按 `defaultScheme` 补
 *  - 末尾的 `/` → 去掉（`https://host/` 与 `https://host` 是同一个源，
 *    留着会让健康检查拼出 `//healthz`，也让它与配置里存的值长得不一样）
 *  - 查询串与锚点 → 丢掉（它们对「加载一个应用」没有意义，留着只会在
 *    对比两个地址是否相同时制造假差异）
 */
export function normalizeCloudUrl(input: string): CloudUrlResult {
  const trimmed = input.trim()
  if (!trimmed) return { ok: false, message: '请输入服务器地址' }

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `${guessScheme(trimmed)}://${trimmed}`

  let parsed: URL
  try {
    parsed = new URL(withScheme)
  } catch {
    return { ok: false, message: '这个地址解析不了，检查一下有没有打错' }
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, message: '只支持 http / https 地址' }
  }
  if (!parsed.hostname) return { ok: false, message: '地址里缺少主机名' }

  parsed.search = ''
  parsed.hash = ''
  const path = parsed.pathname.replace(/\/+$/, '')
  const base = `${parsed.protocol}//${parsed.host}${path === '/' ? '' : path}`
  return { ok: true, url: base }
}

/** 先看主机名推测协议。用 `new URL` 的兜底路径解析，避免自己拆 IPv6 括号 */
function guessScheme(trimmed: string): 'http' | 'https' {
  try {
    // 借一个占位协议拿到 hostname（用户没写协议时，`https://` 与 `http://`
    // 解析出的 hostname 相同，所以这一步不影响判断）
    const probe = new URL(`https://${trimmed}`)
    return defaultScheme(probe.hostname)
  } catch {
    return 'https'
  }
}

export interface ProbeResult {
  ok: boolean
  message?: string
}

/**
 * 探活：`GET <url>/healthz`（与部署文档里的健康检查同一个端点）。
 *
 * **必须真的检查内容**，不能只看「有没有响应」：同机上有一个别的服务
 * （或者一个反代配错了的域名）时，那个地址会回 200，而用户会得到
 * 「地址是对的，进去却是别人的页面」。判据是 `/healthz` 回 `{ok:true}`
 * ——那是本服务自己的形状（`apps/server/src/app.ts`）。
 *
 * 超时 8 秒：自托管常在内网，慢一点是常态；但一直转圈也不对。
 */
export async function probeCloudUrl(url: string, timeoutMs = 8000): Promise<ProbeResult> {
  let res: Response
  try {
    res = await fetch(`${url}/healthz`, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
      headers: { Accept: 'application/json' },
    })
  } catch (error) {
    return { ok: false, message: describeFetchError(error, timeoutMs) }
  }

  if (!res.ok) {
    return { ok: false, message: `服务器返回了 ${res.status}。确认地址指向的是 mimir 服务` }
  }

  const body = (await res.json().catch(() => null)) as { ok?: unknown } | null
  if (!body || body.ok !== true) {
    return { ok: false, message: '这个地址有响应，但它看起来不是 mimir 服务' }
  }
  return { ok: true }
}

/**
 * 把 fetch 的失败翻译成一句用户能照做的话。
 *
 * **不能直接透传 `error.message`**：Node 给的是 `fetch failed`、浏览器给的是
 * `Failed to fetch`——两句话都没有说清是「域名解析不了」「没人监听」还是
 * 「证书不被信任」，而这三件的下一步动作完全不同（改地址 / 启动服务 /
 * 换协议）。真正的线索在 `error.cause` 的 `code` 里（Node 的 undici 会带）。
 *
 * 拿不到 code 时退回「检查地址与网络」——不确定时说得出自己不确定，
 * 比编一个具体原因好。
 */
function describeFetchError(error: unknown, timeoutMs: number): string {
  const name = error instanceof Error ? error.name : ''
  if (name === 'TimeoutError' || name === 'AbortError') {
    return `连接超时（${timeoutMs / 1000} 秒）——地址不通，或服务没在运行`
  }

  const code = fetchErrorCode(error)
  if (code === 'ECONNREFUSED') {
    return '这个地址上没有人监听——服务可能没启动，或者端口写错了'
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return '找不到这个域名——检查拼写，或这台电脑的 DNS'
  }
  if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH' || code === 'ECONNRESET') {
    return '网络不通——地址或网络环境需要检查'
  }
  if (code !== null && code.startsWith('CERT')) {
    return '服务器的 HTTPS 证书不被信任——可以改用 http，或为它配一张有效证书'
  }
  if (code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || code === 'SELF_SIGNED_CERT_IN_CHAIN') {
    return '服务器用的是自签名证书——可以改用 http，或为它配一张有效证书'
  }
  /**
   * `bad port`：fetch 会拒绝一批「危险端口」（1、7、9、11……它们历史上
   * 被绑给别的协议）。用户手打地址时最可能踩到的是 `xx:1` 这类。
   * 它没有 errno code，只能按 cause 的话认。
   */
  if (error instanceof Error && error.cause instanceof Error) {
    if (error.cause.message.includes('bad port')) {
      return '这个端口不能用（浏览器出于安全禁止访问它）——换一个常规端口试试'
    }
  }
  return '连不上这个地址——检查地址与网络是否正常'
}

/** 从 fetch 的错误里挖出 errno code。undici 会把它包在 cause 里（可能嵌套一层） */
function fetchErrorCode(error: unknown): string | null {
  let current: unknown = error
  for (let depth = 0; depth < 3; depth += 1) {
    if (typeof current !== 'object' || current === null) return null
    const code = (current as { code?: unknown }).code
    if (typeof code === 'string') return code
    current = (current as { cause?: unknown }).cause
  }
  return null
}
