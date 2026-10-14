import type { FailureKind } from '@mimir/shared'

/** Map model failures to the existing user-facing recovery choices. */
export function classifyFailure(error: unknown): FailureKind {
  const message = error instanceof Error ? error.message : String(error)
  const status = (error as { status?: number }).status

  if (status === 402 || /quota|balance|insufficient|余额/i.test(message)) return 'quota'
  if (status === 429 || /rate limit|限流/i.test(message)) return 'quota'
  if (status === 408 || /timeout|timed out|超时/i.test(message)) return 'timeout'
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|network|不可达/i.test(message)) return 'offline'
  if (/length|max_tokens|truncat|截断/i.test(message)) return 'truncated'

  // Unknown failures use the least consequential recovery choice.
  return 'timeout'
}
