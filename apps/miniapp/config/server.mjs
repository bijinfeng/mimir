export function resolveServerOrigin(value) {
  if (!value?.trim()) return ''
  const url = new URL(value.trim())
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('MIMIR_MINIAPP_SERVER_URL must be an HTTPS origin without credentials or path')
  }
  return url.origin
}
